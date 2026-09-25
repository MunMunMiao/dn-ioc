import { describe, expect, test } from 'bun:test'
import { bootstrapApp, bundleProviders, type Context, provide, provideFor, type Ref, token } from './index'

async function runApp<T>(
  fn: (ctx: Context) => T | Promise<T>,
  providers?: readonly Parameters<typeof bundleProviders>[number][],
): Promise<T> {
  let captured!: T
  const app = bootstrapApp(
    async ctx => {
      captured = await fn(ctx)
    },
    providers ? { providers } : undefined,
  )
  await app.start()
  return captured
}

// The resolution stack, the pending-dependency graph and the binding lookup are about to be
// reworked for speed. These pin the behaviour that must survive it.
describe('resolution stack', () => {
  test('a factory that injects itself reports a single-key cycle path', async () => {
    const selfRef: Ref<unknown> = provide(function SelfRef({ inject }): unknown {
      return inject(selfRef)
    })

    await expect(runApp(({ inject }) => inject(selfRef))).rejects.toThrow('Circular dependency detected: SelfRef -> SelfRef')
  })

  test('a four-deep cycle lists every key on the path', async () => {
    let bRef!: Ref<unknown>
    let cRef!: Ref<unknown>
    let dRef!: Ref<unknown>
    const aRef: Ref<unknown> = provide(function A({ inject }): unknown {
      return inject(bRef)
    })
    bRef = provide(function B({ inject }): unknown {
      return inject(cRef)
    })
    cRef = provide(function C({ inject }): unknown {
      return inject(dRef)
    })
    dRef = provide(function D({ inject }): unknown {
      return inject(aRef)
    })

    await expect(runApp(({ inject }) => inject(aRef))).rejects.toThrow('Circular dependency detected: A -> B -> C -> D -> A')
  })

  test('the reported cycle starts at the key that closes it, not at the root', async () => {
    let bRef!: Ref<unknown>
    const aRef: Ref<unknown> = provide(function A({ inject }): unknown {
      return inject(bRef)
    })
    bRef = provide(function B({ inject }): unknown {
      return inject(bRef)
    })

    await expect(runApp(({ inject }) => inject(aRef))).rejects.toThrow('Circular dependency detected: B -> B')
  })

  // A resolution stack that is mutated in place instead of branched would still hold `Left`
  // when `Right` runs, turning this ordinary re-use into a phantom cycle.
  test('injecting a sibling that a previous branch already resolved is not a cycle', async () => {
    const leafRef = provide(function Leaf() {
      return 'leaf'
    })
    const leftRef = provide(function Left({ inject }) {
      return `left(${inject(leafRef)})`
    })
    const rightRef = provide(function Right({ inject }) {
      return `right(${inject(leftRef)})`
    })
    const topRef = provide(function Top({ inject }) {
      return `${inject(leftRef)}|${inject(rightRef)}`
    })

    await expect(runApp(({ inject }) => inject(topRef))).resolves.toBe('left(leaf)|right(left(leaf))')
  })

  // `inject` captured by a factory keeps working after that factory returns, and at that point
  // it must resolve against an empty stack - otherwise the ref's own key looks like a cycle.
  test('a captured inject can re-resolve its own ref after the factory returned', async () => {
    const selfAwareRef: Ref<{ resolveSelf: () => unknown }> = provide(function SelfAware({ inject }) {
      return { resolveSelf: () => inject(selfAwareRef) }
    })

    const same = await runApp(({ inject }) => {
      const instance = inject(selfAwareRef)
      return instance.resolveSelf() === instance
    })

    expect(same).toBe(true)
  })

  test('a captured inject can still resolve an ancestor of the factory that created it', async () => {
    let capture!: () => unknown
    const childRef: Ref<string> = provide(function Child({ inject }) {
      capture = () => inject(parentRef)
      return 'child'
    })
    const parentRef: Ref<string> = provide(function Parent({ inject }) {
      return `parent(${inject(childRef)})`
    })

    const resolved = await runApp(({ inject }) => {
      const parent = inject(parentRef)
      return capture() === parent
    })

    expect(resolved).toBe(true)
  })

  test('a deep chain resolves without tripping cycle detection', async () => {
    let node = provide(() => 0)
    for (let depth = 0; depth < 200; depth++) {
      const previous = node
      node = provide(({ inject }) => inject(previous) + 1)
    }

    await expect(runApp(({ inject }) => inject(node))).resolves.toBe(200)
  })
})

describe('pending dependency graph', () => {
  // Every node yields once so its own pending record exists, then injects dependencies that are
  // themselves still pending - the shape the pending-dependency cycle check walks.
  function buildPendingGraph(size: number, edge: (index: number, offset: number) => number | undefined) {
    let releaseGate!: () => void
    const gate = new Promise<void>(resolve => {
      releaseGate = resolve
    })
    let releasePhase!: () => void
    const phase = new Promise<void>(resolve => {
      releasePhase = resolve
    })

    const nodes: Ref<Promise<number>>[] = []
    for (let index = 0; index < size; index++) {
      const self = index
      nodes.push(
        provide(async function Node({ inject }) {
          await phase
          for (const offset of [1, 2]) {
            const target = edge(self, offset)
            if (target !== undefined) {
              // A detected cycle throws out of `inject` itself; the promise is only here to
              // register the edge, so swallow it rather than leave it unhandled.
              inject(nodes[target]!).catch(() => undefined)
            }
          }
          await gate
          return self
        }),
      )
    }

    return { gate, nodes, releaseGate, releasePhase }
  }

  // `allSettled`, so a detected cycle rejects the node promises without leaving unhandled
  // rejections behind, and both the healthy and the cyclic graph go through one harness.
  async function resolveAll(
    size: number,
    edge: (index: number, offset: number) => number | undefined,
  ): Promise<{ elapsedMs: number; settled: PromiseSettledResult<number>[] }> {
    const { nodes, releaseGate, releasePhase } = buildPendingGraph(size, edge)

    return await runApp(async ({ inject }) => {
      const pending: Promise<number>[] = []
      // Reverse order so the earliest nodes register their edges last, against a fully built graph.
      for (let index = size - 1; index >= 0; index--) {
        pending.push(inject(nodes[index]!))
      }
      await null
      const startedAt = Bun.nanoseconds()
      releasePhase()
      await phaseSettled()
      const elapsedMs = (Bun.nanoseconds() - startedAt) / 1e6
      releaseGate()
      return { elapsedMs, settled: await Promise.allSettled(pending) }
    })
  }

  // Lets every node's post-`await phase` continuation run before the gate opens.
  function phaseSettled(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  // A wall-clock budget is the only honest probe for a complexity class: the cycle search runs
  // inside the library with no observable counter. The margin is what makes it stable - the
  // unmemoised search needs ~9400ms here, a memoised one ~2ms, so 500ms is nowhere near either.
  // The test timeout cannot do this job: the search blocks the event loop, so no timer fires.
  test('a shared pending graph resolves without an exponential cycle search', async () => {
    const size = 41
    const { elapsedMs, settled } = await resolveAll(size, (index, offset) => (index + offset < size ? index + offset : undefined))

    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(size)
    expect(elapsedMs).toBeLessThan(500)
  })

  // Every other async cycle test resolves its factories straight from the root, where the
  // current frame happens to be both the first and the last on the stack. Resolving them from
  // inside another factory is what tells those two apart.
  test('an async cycle is detected when both factories were resolved from another factory', async () => {
    const tick = () => new Promise(resolve => setTimeout(resolve, 0))
    let bRef!: Ref<Promise<unknown>>
    const aRef: Ref<Promise<unknown>> = provide(async function AsyncA({ inject }): Promise<unknown> {
      await tick()
      return await inject(bRef)
    })
    bRef = provide(async function AsyncB({ inject }): Promise<unknown> {
      await tick()
      return await inject(aRef)
    })
    const outerRef = provide(function Outer({ inject }) {
      return Promise.all([inject(aRef), inject(bRef)])
    })

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for circular dependency detection')), 100)
    })

    await expect(Promise.race([runApp(({ inject }) => inject(outerRef)), timeout])).rejects.toThrow('Circular dependency detected')
  })

  test('a cycle is still reported when the pending graph shares most of its edges', async () => {
    const size = 12
    const { settled } = await resolveAll(size, (index, offset) => (index + offset) % size)

    const rejections = settled.filter(result => result.status === 'rejected')
    expect(rejections.length).toBeGreaterThan(0)
    expect((rejections[0] as PromiseRejectedResult).reason.message).toContain('Circular dependency detected')
  })
})

describe('binding installation', () => {
  test('a scoped ref serves one instance from a single attached scope', async () => {
    const labelToken = token<string>('Label')
    let labelFactoryRuns = 0
    const scopedRef = provide(({ inject }) => ({ label: inject(labelToken) }), {
      providers: [
        provideFor(labelToken, () => {
          labelFactoryRuns += 1
          return 'scoped'
        }),
      ],
    })
    const consumerRef = provide(({ inject }) => inject(scopedRef))

    const { direct, viaConsumer, runs } = await runApp(({ inject }) => ({
      direct: inject(scopedRef),
      viaConsumer: inject(consumerRef),
      runs: labelFactoryRuns,
    }))

    expect(direct).toBe(viaConsumer)
    expect(runs).toBe(1)
  })

  // Each nesting shape has to take a turn as the last element: a nested group in the middle is
  // followed by a sibling that puts the right provider back on the end, which hides a flattener
  // that misplaces that group's contents.
  test('a nested array installed last wins over everything before it', async () => {
    const labelToken = token<string>('Label')

    const result = await runApp(
      ({ inject }) => inject(labelToken),
      [
        provideFor(labelToken, () => 'first'),
        bundleProviders(provideFor(labelToken, () => 'second')),
        [provideFor(labelToken, () => 'third')],
      ],
    )

    expect(result).toBe('third')
  })

  test('a bundle installed last wins over everything before it', async () => {
    const labelToken = token<string>('Label')

    const result = await runApp(
      ({ inject }) => inject(labelToken),
      [
        provideFor(labelToken, () => 'first'),
        [provideFor(labelToken, () => 'second')],
        bundleProviders(provideFor(labelToken, () => 'third')),
      ],
    )

    expect(result).toBe('third')
  })

  test('a bundle installed after an array still loses to a later plain provider', async () => {
    const labelToken = token<string>('Label')

    const result = await runApp(
      ({ inject }) => inject(labelToken),
      [bundleProviders(provideFor(labelToken, () => 'bundled')), provideFor(labelToken, () => 'plain')],
    )

    expect(result).toBe('plain')
  })

  test('empty arrays and empty bundles install nothing and resolve the real provider', async () => {
    const labelToken = token<string>('Label')

    const result = await runApp(
      ({ inject }) => inject(labelToken),
      [[], bundleProviders(), [[], bundleProviders([])], provideFor(labelToken, () => 'ok')],
    )

    expect(result).toBe('ok')
  })

  test('a deeply nested bundle tree installs every leaf', async () => {
    const tokens = Array.from({ length: 8 }, (_, index) => token<number>(`Leaf${index}`))
    const nested = tokens.reduce<Parameters<typeof bundleProviders>[number]>(
      (inner, leafToken, index) => bundleProviders(inner, [provideFor(leafToken, () => index)]),
      bundleProviders(),
    )

    const result = await runApp(({ inject }) => tokens.map(leafToken => inject(leafToken)), [nested])

    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})
