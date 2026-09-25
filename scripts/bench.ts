// Micro-benchmarks for the container's hot paths. Run: bun run scripts/bench.ts
// Profile: bun --cpu-prof --cpu-prof-md scripts/bench.ts
import { bootstrapApp, bundleProviders, type InjectFn, type ProviderInput, provide, provideFor, type Ref, token } from '../src/index'

const results: Array<{ name: string; nsPerOp: number; ops: number }> = []

function record(name: string, ns: number, ops: number): void {
  results.push({ name, nsPerOp: ns / ops, ops })
}

function bench(name: string, iters: number, fn: (i: number) => unknown): void {
  for (let i = 0; i < Math.min(iters, 100); i++) {
    fn(i)
  }
  const t0 = Bun.nanoseconds()
  for (let i = 0; i < iters; i++) {
    fn(i)
  }
  record(name, Bun.nanoseconds() - t0, iters)
}

async function benchAsync(name: string, iters: number, fn: (i: number) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < Math.min(iters, 5); i++) {
    await fn(i)
  }
  const t0 = Bun.nanoseconds()
  for (let i = 0; i < iters; i++) {
    await fn(i)
  }
  record(name, Bun.nanoseconds() - t0, iters)
}

// --- graph builders -------------------------------------------------------

function makeChain(depth: number): Ref<number> {
  let node = provide(() => 0)
  for (let i = 0; i < depth; i++) {
    const prev = node
    node = provide(({ inject }) => inject(prev) + 1)
  }
  return node
}

function makeFanout(width: number): Ref<number> {
  const leaves = Array.from({ length: width }, (_, i) => provide(() => i))
  return provide(({ inject }) => leaves.reduce((sum, leaf) => sum + inject(leaf), 0))
}

// Each level declares its child as a scoped provider, so resolution walks a chain of attached scopes.
function makeScopeChain(depth: number): { deepest: () => InjectFn; root: Ref<unknown> } {
  let captured!: InjectFn
  let node: Ref<unknown> = provide(({ inject }) => {
    captured = inject
    return 0
  })
  for (let i = 0; i < depth; i++) {
    const child = node
    node = provide(({ inject }) => inject(child), { providers: [child] })
  }
  return { deepest: () => captured, root: node }
}

function makeBundleTree(depth: number, width: number): ProviderInput {
  if (depth === 0) {
    return bundleProviders(...Array.from({ length: width }, () => provide(() => 1)))
  }
  return bundleProviders(...Array.from({ length: width }, () => makeBundleTree(depth - 1, width)))
}

// Async layers where every node injects all of the previous layer before awaiting, so each
// inject lands on a *pending* record and goes through the cycle check.
function makeAsyncLayers(layers: number, width: number): Ref<number> {
  let prev: Ref<number>[] = [provide(async () => 1)]
  for (let l = 0; l < layers; l++) {
    const deps = prev
    prev = Array.from({ length: width }, () =>
      provide(async ({ inject }) => {
        const pending = deps.map(dep => inject(dep))
        const values = await Promise.all(pending)
        return values.reduce((a, b) => a + b, 0)
      }),
    )
  }
  const top = prev
  return provide(async ({ inject }) => {
    const values = await Promise.all(top.map(dep => inject(dep)))
    return values.reduce((a, b) => a + b, 0)
  })
}

async function runOnce<T>(fn: (inject: InjectFn) => T | Promise<T>, providers?: readonly ProviderInput[]): Promise<T> {
  let out!: T
  const app = bootstrapApp(
    async ({ inject }) => {
      out = await fn(inject)
    },
    providers ? { providers } : undefined,
  )
  await app.start()
  await app.stop()
  return out
}

// --- scenarios ------------------------------------------------------------

async function main(): Promise<void> {
  // 1. steady-state inject on an already-resolved ref in the root scope.
  {
    const ref = provide(() => 42)
    let rootInject!: InjectFn
    const app = bootstrapApp(({ inject }) => {
      rootInject = inject
      inject(ref)
    })
    await app.start()
    bench('inject cached ref (root scope)', 2_000_000, () => rootInject(ref))

    const tok = token<number>('tok')
    const app2 = bootstrapApp(
      ({ inject }) => {
        rootInject = inject
        inject(tok)
      },
      { providers: [provideFor(tok, () => 7)] },
    )
    await app2.start()
    bench('inject cached token (root scope)', 2_000_000, () => rootInject(tok))
    await app.stop()
    await app2.stop()
  }

  // 2. same lookup, but from a factory N attached scopes deep (parent-chain walk).
  for (const depth of [1, 8, 32]) {
    const tok = token<number>(`root-${depth}`)
    const { deepest, root } = makeScopeChain(depth)
    const app = bootstrapApp(({ inject }) => void inject(root), { providers: [provideFor(tok, () => 1)] })
    await app.start()
    const inject = deepest()
    inject(tok)
    bench(`inject cached token from depth ${depth}`, 500_000, () => inject(tok))
    await app.stop()
  }

  // 3. cold resolution of a pre-built graph, once per app.
  for (const depth of [10, 100, 1000]) {
    const chain = makeChain(depth)
    await benchAsync(`cold resolve chain depth ${depth}`, 2000, () => runOnce(inject => inject(chain)))
  }
  for (const width of [10, 100, 1000]) {
    const fan = makeFanout(width)
    await benchAsync(`cold resolve fanout ${width}`, 2000, () => runOnce(inject => inject(fan)))
  }

  // 4. install cost alone: bootstrap with providers, resolve nothing.
  for (const count of [10, 100, 1000]) {
    const providers = Array.from({ length: count }, () => provide(() => 1))
    await benchAsync(`bootstrap + install ${count} providers`, 2000, () => runOnce(() => 0, providers))
  }
  {
    const tree = makeBundleTree(3, 5) // 625 leaves
    await benchAsync('bootstrap + install nested bundles (625)', 500, () => runOnce(() => 0, [tree]))
  }

  // 5. definition-time cost.
  bench('provide() no providers', 500_000, () => provide(() => 1))
  {
    const deps = Array.from({ length: 50 }, () => provide(() => 1))
    bench('provide() with 50 providers', 100_000, () => provide(() => 1, { providers: deps }))
  }
  bench('token()', 500_000, () => token<number>('t'))

  // 6. async graph: exercises the pending-dependency cycle check.
  for (const [layers, width] of [
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
  ] as const) {
    const graph = makeAsyncLayers(layers, width)
    const iters = layers >= 5 ? 20 : 200
    await benchAsync(`async layers ${layers}x${width}`, iters, () => runOnce(inject => inject(graph)))
  }

  // 7. teardown with many hooks.
  for (const count of [100, 5000]) {
    await benchAsync(`start+stop with ${count} dispose hooks`, 200, async () => {
      const app = bootstrapApp(({ onDispose }) => {
        for (let i = 0; i < count; i++) {
          onDispose(() => undefined)
        }
      })
      await app.start()
      await app.stop()
    })
  }

  await benchAsync('empty bootstrap + start + stop', 20_000, () => runOnce(() => 0))

  const width = Math.max(...results.map(r => r.name.length))
  for (const { name, nsPerOp, ops } of results) {
    const per =
      nsPerOp >= 1e6 ? `${(nsPerOp / 1e6).toFixed(3)} ms` : nsPerOp >= 1e3 ? `${(nsPerOp / 1e3).toFixed(3)} µs` : `${nsPerOp.toFixed(1)} ns`
    console.log(`${name.padEnd(width)}  ${per.padStart(12)}/op  (${ops} ops)`)
  }
}

await main()
