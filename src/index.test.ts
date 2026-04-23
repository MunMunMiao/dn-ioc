import { describe, expect, test } from 'bun:test'
import {
  bootstrapApp,
  bundleProviders,
  type Context,
  isProvideRef,
  type ProviderInput,
  provide,
  provideFor,
  type Ref,
  type Token,
  token,
} from './index'

describe('IoC Container', () => {
  test('basic provide and inject with bootstrapApp', async () => {
    const ref = provide(() => 'test value')

    const result = await bootstrapApp(({ inject }) => inject(ref))

    expect(result).toBe('test value')
  })

  test('bootstrapApp returns sync and async results', async () => {
    const syncValue = await bootstrapApp(() => 'sync')
    const asyncValue = await bootstrapApp(async () => 'async')

    expect(syncValue).toBe('sync')
    expect(asyncValue).toBe('async')
  })

  test('context can be passed to helper functions', async () => {
    const ref = provide(() => 'value')

    function helper(ctx: Context) {
      return ctx.inject(ref)
    }

    const result = await bootstrapApp(ctx => helper(ctx))

    expect(result).toBe('value')
  })

  test('root refs are shared within one app but isolated across apps', async () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }))

    const firstApp = await bootstrapApp(({ inject }) => {
      const a = inject(ref)
      const b = inject(ref)
      return { a, b }
    })

    const secondApp = await bootstrapApp(({ inject }) => inject(ref))

    expect(firstApp.a).toBe(firstApp.b)
    expect(firstApp.a).not.toBe(secondApp)
    expect(counter).toBe(2)
  })

  test('refs auto-bind into the current local scope when first resolved there', async () => {
    let counter = 0
    const valueRef = provide(() => ({ id: ++counter }))

    const leftRef = provide(({ inject }) => inject(valueRef), {
      providers: [provideFor(token('LeftScopeMarker'), () => true)],
    })

    const rightRef = provide(({ inject }) => inject(valueRef), {
      providers: [provideFor(token('RightScopeMarker'), () => true)],
    })

    const result = await bootstrapApp(({ inject }) => ({
      leftA: inject(leftRef),
      leftB: inject(leftRef),
      right: inject(rightRef),
      root: inject(valueRef),
    }))

    expect(result.leftA).toBe(result.leftB)
    expect(result.leftA).not.toBe(result.right)
    expect(result.leftA).not.toBe(result.root)
    expect(result.right).not.toBe(result.root)
    expect(counter).toBe(3)
  })

  test('isProvideRef only matches refs', () => {
    const ref = provide(() => 'value')
    const pureToken = token<string>('PureToken')
    const bundle = bundleProviders(provideFor(pureToken, () => 'bound'))

    expect(isProvideRef(ref)).toBe(true)
    expect(isProvideRef(pureToken)).toBe(false)
    expect(isProvideRef(bundle)).toBe(false)
    expect(isProvideRef(null)).toBe(false)
  })

  test('runtime handles are frozen and do not expose internal metadata', async () => {
    const configToken = token<string>('Config')
    const ref = provide(() => 'safe value')
    const binding = provideFor(configToken, () => 'bound value')
    const bundle = bundleProviders(binding)

    for (const handle of [configToken, ref, binding, bundle]) {
      expect(Object.isFrozen(handle)).toBe(true)
      expect(Object.keys(handle)).toEqual([])
      expect(Object.getOwnPropertySymbols(handle)).toEqual([])
    }

    expect(() => {
      Object.defineProperty(ref, 'factory', { value: () => 'tampered value' })
    }).toThrow()

    const result = await bootstrapApp(({ inject }) => inject(ref))

    expect(result).toBe('safe value')
  })

  test('forged runtime handles are rejected', async () => {
    const forgedRef = Object.freeze({
      [Symbol('dn_ioc.kind')]: 'ref',
      factory: () => 'forged value',
      id: Symbol('forged'),
    }) as unknown as Ref<string>

    const forgedProvider = Object.freeze({
      [Symbol('dn_ioc.kind')]: 'binding',
      factory: () => 'forged provider',
      id: Symbol('forged-provider'),
    }) as unknown as ProviderInput

    await expect(bootstrapApp(({ inject }) => inject(forgedRef))).rejects.toThrow('Invalid inject key received')
    await expect(
      bootstrapApp(() => 'ok', {
        providers: [forgedProvider],
      }),
    ).rejects.toThrow('Invalid provider input received')
  })

  test('provider inputs are snapshotted when handles are created', async () => {
    const labelToken = token<string>('Label')
    const nestedProviders: ProviderInput[] = [provideFor(labelToken, () => 'initial')]
    const scopedRef = provide(({ inject }) => inject(labelToken), {
      providers: [nestedProviders],
    })

    nestedProviders[0] = provideFor(labelToken, () => 'mutated')

    const result = await bootstrapApp(({ inject }) => inject(scopedRef))

    expect(result).toBe('initial')
  })

  test('token identity does not depend on description text', async () => {
    const firstToken = token<string>('SharedName')
    const secondToken = token<string>('SharedName')

    await bootstrapApp(
      ({ inject }) => {
        expect(inject(firstToken)).toBe('first')
        expect(() => inject(secondToken)).toThrow('No provider for token: SharedName')
      },
      {
        providers: [provideFor(firstToken, () => 'first')],
      },
    )
  })

  test('local providers create a shared subtree instance', async () => {
    const serviceToken = token<{ id: number }>('Service')
    let counter = 0

    const leafRef = provide(({ inject }) => inject(serviceToken))
    const middleRef = provide(({ inject }) => ({
      fromLeaf: inject(leafRef),
      fromMiddle: inject(serviceToken),
    }))
    const rootLocalRef = provide(
      ({ inject }) => ({
        fromMiddle: inject(middleRef),
        fromSelf: inject(serviceToken),
      }),
      {
        providers: [provideFor(serviceToken, () => ({ id: ++counter }))],
      },
    )

    const result = await bootstrapApp(({ inject }) => inject(rootLocalRef))

    expect(result.fromSelf).toBe(result.fromMiddle.fromMiddle)
    expect(result.fromSelf).toBe(result.fromMiddle.fromLeaf)
    expect(counter).toBe(1)
  })

  test('local bindings stay invisible outside their subtree', async () => {
    const serviceToken = token<string>('LocalOnly')
    const scopedRef = provide(({ inject }) => inject(serviceToken), {
      providers: [provideFor(serviceToken, () => 'local value')],
    })

    await bootstrapApp(({ inject }) => {
      expect(() => inject(serviceToken)).toThrow('No provider for token: LocalOnly')
      expect(inject(scopedRef)).toBe('local value')
      expect(() => inject(serviceToken)).toThrow('No provider for token: LocalOnly')
    })
  })

  test('local providers fall back to parent bindings when not overridden', async () => {
    const configToken = token<string>('Config')
    const unrelatedToken = token<string>('Unrelated')
    const scopedRef = provide(
      ({ inject }) => ({
        config: inject(configToken),
        unrelated: inject(unrelatedToken),
      }),
      {
        providers: [provideFor(unrelatedToken, () => 'local')],
      },
    )

    const result = await bootstrapApp(({ inject }) => inject(scopedRef), {
      providers: [provideFor(configToken, () => 'root')],
    })

    expect(result).toEqual({
      config: 'root',
      unrelated: 'local',
    })
  })

  test('sibling local providers for the same token stay isolated', async () => {
    const tenantToken = token<string>('Tenant')
    const leftRef = provide(({ inject }) => inject(tenantToken), {
      providers: [provideFor(tenantToken, () => 'left')],
    })
    const rightRef = provide(({ inject }) => inject(tenantToken), {
      providers: [provideFor(tenantToken, () => 'right')],
    })

    await bootstrapApp(({ inject }) => {
      expect(inject(leftRef)).toBe('left')
      expect(inject(rightRef)).toBe('right')
      expect(() => inject(tenantToken)).toThrow('No provider for token: Tenant')
    })
  })

  test('reinstalling in a lower subtree creates a new instance there', async () => {
    const serviceToken = token<{ owner: string }>('Service')

    const leafRef = provide(({ inject }) => inject(serviceToken))
    const childRef = provide(
      ({ inject }) => ({
        leaf: inject(leafRef),
        self: inject(serviceToken),
      }),
      {
        providers: [provideFor(serviceToken, () => ({ owner: 'child' }))],
      },
    )
    const parentRef = provide(
      ({ inject }) => ({
        child: inject(childRef),
        self: inject(serviceToken),
      }),
      {
        providers: [provideFor(serviceToken, () => ({ owner: 'parent' }))],
      },
    )

    const result = await bootstrapApp(({ inject }) => inject(parentRef))

    expect(result.self.owner).toBe('parent')
    expect(result.child.self.owner).toBe('child')
    expect(result.child.leaf.owner).toBe('child')
    expect(result.self).not.toBe(result.child.self)
  })

  test('provideFor can rebind an existing ref locally', async () => {
    const configRef = provide(() => 'root config')
    const serviceRef = provide(({ inject }) => inject(configRef), {
      providers: [provideFor(configRef, () => 'local config')],
    })

    const result = await bootstrapApp(({ inject }) => ({
      root: inject(configRef),
      local: inject(serviceRef),
    }))

    expect(result.root).toBe('root config')
    expect(result.local).toBe('local config')
  })

  test('local overrides do not change an already bound parent consumer ref', async () => {
    const configRef = provide(() => 'root config')
    const serviceRef = provide(({ inject }) => inject(configRef))
    const localServiceRef = provide(({ inject }) => inject(serviceRef), {
      providers: [provideFor(configRef, () => 'local config')],
    })

    const result = await bootstrapApp(({ inject }) => ({
      rootFirst: inject(serviceRef),
      localAfterRoot: inject(localServiceRef),
    }))

    expect(result.rootFirst).toBe('root config')
    expect(result.localAfterRoot).toBe('root config')
  })

  test('consumer refs can be explicitly rebound in local providers', async () => {
    const configRef = provide(() => 'root config')
    const serviceRef = provide(({ inject }) => inject(configRef))
    const localServiceRef = provide(({ inject }) => inject(serviceRef), {
      providers: [provideFor(configRef, () => 'local config'), provideFor(serviceRef, ({ inject }) => inject(configRef))],
    })

    const result = await bootstrapApp(({ inject }) => ({
      rootFirst: inject(serviceRef),
      localAfterRoot: inject(localServiceRef),
    }))

    expect(result.rootFirst).toBe('root config')
    expect(result.localAfterRoot).toBe('local config')
  })

  test('root providers can install tokens and bundles', async () => {
    const envToken = token<string>('Env')
    const apiToken = token<string>('ApiBaseUrl')

    const featureBundle = bundleProviders(
      provideFor(envToken, () => 'test'),
      provideFor(apiToken, ({ inject }) => `https://${inject(envToken)}.example.com`),
    )

    const result = await bootstrapApp(({ inject }) => inject(apiToken), {
      providers: [featureBundle],
    })

    expect(result).toBe('https://test.example.com')
  })

  test('root providers can install refs explicitly', async () => {
    let counter = 0
    const serviceRef = provide(() => ({ id: ++counter }))

    const result = await bootstrapApp(
      ({ inject }) => ({
        first: inject(serviceRef),
        second: inject(serviceRef),
      }),
      {
        providers: [serviceRef],
      },
    )

    expect(result.first).toBe(result.second)
    expect(counter).toBe(1)
  })

  test('later providers override earlier providers in the same installation scope', async () => {
    const labelToken = token<string>('Label')

    const result = await bootstrapApp(({ inject }) => inject(labelToken), {
      providers: [
        provideFor(labelToken, () => 'first'),
        bundleProviders([provideFor(labelToken, () => 'from bundle')]),
        provideFor(labelToken, () => 'last'),
      ],
    })

    expect(result).toBe('last')
  })

  test('bundles can be nested and flattened', async () => {
    const aToken = token<string>('A')
    const bToken = token<string>('B')

    const nestedBundle = bundleProviders(
      [provideFor(aToken, () => 'hello')],
      bundleProviders(provideFor(bToken, ({ inject }) => `${inject(aToken)} world`)),
    )

    const result = await bootstrapApp(({ inject }) => inject(bToken), {
      providers: [nestedBundle],
    })

    expect(result).toBe('hello world')
  })

  test('bundles snapshot nested provider arrays when created', async () => {
    const labelToken = token<string>('Label')
    const nestedProviders: ProviderInput[] = [provideFor(labelToken, () => 'initial')]
    const bundle = bundleProviders(nestedProviders)

    nestedProviders[0] = provideFor(labelToken, () => 'mutated')

    const result = await bootstrapApp(({ inject }) => inject(labelToken), {
      providers: [bundle],
    })

    expect(result).toBe('initial')
  })

  test('deferred inject stays available for lazy lookup after factory returns', async () => {
    const configToken = token<string>('Config')
    const serviceRef = provide(
      ({ inject }) => ({
        readConfig: () => inject(configToken),
      }),
      {
        providers: [provideFor(configToken, () => 'local-config')],
      },
    )

    const result = await bootstrapApp(({ inject }) => inject(serviceRef).readConfig())

    expect(result).toBe('local-config')
  })

  test('recommended style resolves dependencies once and returns a closure-based object', async () => {
    const messageRef = provide(() => 'hello')
    const suffixRef = provide(() => 'world')

    const formatterRef = provide(({ inject }) => {
      const message = inject(messageRef)
      const suffix = inject(suffixRef)

      return {
        format() {
          return `${message} ${suffix}`
        },
      }
    })

    const result = await bootstrapApp(({ inject }) => inject(formatterRef).format())

    expect(result).toBe('hello world')
  })

  test('missing token throws a clear error', async () => {
    const missingToken = token<string>('MissingToken')

    await expect(bootstrapApp(({ inject }) => inject(missingToken))).rejects.toThrow('No provider for token: MissingToken')
  })

  test('missing anonymous token falls back to <anonymous> in error messages', async () => {
    const missingToken = token<string>()

    await expect(bootstrapApp(({ inject }) => inject(missingToken))).rejects.toThrow('No provider for token: <anonymous>')
  })

  test('circular dependency error includes the dependency path', async () => {
    let bRef!: Ref<unknown>
    const aRef: Ref<unknown> = provide(function ServiceA({ inject }): unknown {
      return inject(bRef)
    })
    bRef = provide(function ServiceB({ inject }): unknown {
      return inject(aRef)
    })

    await expect(bootstrapApp(({ inject }) => inject(aRef))).rejects.toThrow(
      'Circular dependency detected: ServiceA -> ServiceB -> ServiceA',
    )
  })

  test('anonymous circular dependency also uses <anonymous> in the cycle path', async () => {
    let bRef!: Ref<unknown>
    const aRef: Ref<unknown> = provide(({ inject }): unknown => inject(bRef))
    bRef = provide(({ inject }): unknown => inject(aRef))

    await expect(bootstrapApp(({ inject }) => inject(aRef))).rejects.toThrow(
      'Circular dependency detected: <anonymous> -> <anonymous> -> <anonymous>',
    )
  })

  test('non-circular diamond graph resolves normally', async () => {
    const baseRef = provide(() => ({ value: 'base' }))
    const leftRef = provide(({ inject }) => ({ base: inject(baseRef), side: 'left' }))
    const rightRef = provide(({ inject }) => ({ base: inject(baseRef), side: 'right' }))
    const topRef = provide(({ inject }) => ({ left: inject(leftRef), right: inject(rightRef) }))

    const top = await bootstrapApp(({ inject }) => inject(topRef))

    expect(top.left.base).toBe(top.right.base)
    expect(top.left.side).toBe('left')
    expect(top.right.side).toBe('right')
  })

  test('falsy and undefined values are cached', async () => {
    let undefinedAttempts = 0
    let falsyAttempts = 0
    const undefinedRef = provide(() => {
      undefinedAttempts++
      return undefined
    })
    const falsyRef = provide(() => {
      falsyAttempts++
      return 0
    })

    await bootstrapApp(({ inject }) => {
      expect(inject(undefinedRef)).toBeUndefined()
      expect(inject(undefinedRef)).toBeUndefined()
      expect(inject(falsyRef)).toBe(0)
      expect(inject(falsyRef)).toBe(0)
    })

    expect(undefinedAttempts).toBe(1)
    expect(falsyAttempts).toBe(1)
  })

  test('sync provider failures are not cached', async () => {
    let attempts = 0
    const flakyRef = provide(() => {
      attempts++
      if (attempts === 1) {
        throw new Error('Temporary sync failure')
      }
      return 'recovered'
    })

    await bootstrapApp(({ inject }) => {
      expect(() => inject(flakyRef)).toThrow('Temporary sync failure')
      expect(inject(flakyRef)).toBe('recovered')
    })

    expect(attempts).toBe(2)
  })
})

describe('IoC Container - Async Support', () => {
  test('async providers are cached within the same install scope', async () => {
    let counter = 0
    const asyncRef = provide(async () => {
      counter++
      await new Promise(resolve => setTimeout(resolve, 10))
      return { id: counter }
    })

    const result = await bootstrapApp(async ({ inject }) => {
      const [a, b] = await Promise.all([inject(asyncRef), inject(asyncRef)])
      return { a, b }
    })

    expect(result.a).toBe(result.b)
    expect(counter).toBe(1)
  })

  test('async provider rejection is not cached', async () => {
    let attempts = 0
    const flakyRef = provide(async () => {
      attempts++
      if (attempts === 1) {
        throw new Error('Temporary failure')
      }
      return { ok: true }
    })

    await bootstrapApp(async ({ inject }) => {
      await expect(inject(flakyRef)).rejects.toThrow('Temporary failure')
      const value = await inject(flakyRef)
      expect(value.ok).toBe(true)
    })

    expect(attempts).toBe(2)
  })

  test('concurrent async provider rejection is shared and then retried', async () => {
    let attempts = 0
    const flakyRef = provide(async () => {
      attempts++
      await new Promise(resolve => setTimeout(resolve, 5))
      if (attempts === 1) {
        throw new Error('Shared temporary failure')
      }
      return { ok: true, attempts }
    })

    await bootstrapApp(async ({ inject }) => {
      const first = inject(flakyRef)
      const second = inject(flakyRef)

      expect(first).toBe(second)
      await expect(Promise.all([first, second])).rejects.toThrow('Shared temporary failure')

      const recovered = await inject(flakyRef)
      expect(recovered).toEqual({ ok: true, attempts: 2 })
    })

    expect(attempts).toBe(2)
  })

  test('async local providers stay scoped to their subtree', async () => {
    const tenantToken = token<string>('Tenant')
    let counter = 0

    const clientRef = provide(async ({ inject }) => {
      const tenant = inject(tenantToken)
      await new Promise(resolve => setTimeout(resolve, 5))
      return { id: ++counter, tenant }
    })

    const tenantAppRef = provide(
      async ({ inject }) => {
        const a = await inject(clientRef)
        const b = await inject(clientRef)
        return { a, b }
      },
      {
        providers: [provideFor(tenantToken, () => 'tenant-a')],
      },
    )

    const result = await bootstrapApp(async ({ inject }) => inject(tenantAppRef))

    expect(result.a).toBe(result.b)
    expect(result.a.tenant).toBe('tenant-a')
    expect(counter).toBe(1)
  })

  test('async provideFor bindings can be awaited by user code', async () => {
    const settingsToken = token<Promise<{ ready: boolean }>>('Settings')
    const serviceRef = provide(async ({ inject }) => {
      const settings = await inject(settingsToken)
      return {
        ready: settings.ready,
      }
    })

    const result = await bootstrapApp(
      async ({ inject }) => {
        const service = await inject(serviceRef)
        return service.ready
      },
      {
        providers: [
          provideFor(settingsToken, async () => {
            await new Promise(resolve => setTimeout(resolve, 5))
            return { ready: true }
          }),
        ],
      },
    )

    expect(result).toBe(true)
  })

  test('sync factories can reuse an already pending async dependency', async () => {
    const asyncRef = provide(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return 'async value'
    })
    const syncRef = provide(({ inject }) => inject(asyncRef))

    await bootstrapApp(async ({ inject }) => {
      const pending = inject(asyncRef)

      expect(await inject(syncRef)).toBe('async value')
      expect(await pending).toBe('async value')
    })
  })

  test('concurrent async circular dependencies reject instead of hanging', async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 0))
    let bRef!: Ref<Promise<unknown>>
    const aRef: Ref<Promise<unknown>> = provide(async function AsyncServiceA({ inject }): Promise<unknown> {
      await wait()
      return await inject(bRef)
    })
    bRef = provide(async function AsyncServiceB({ inject }): Promise<unknown> {
      await wait()
      return await inject(aRef)
    })

    const result = bootstrapApp(async ({ inject }) => {
      await Promise.all([inject(aRef), inject(bRef)])
    })
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for circular dependency detection')), 50)
    })

    await expect(Promise.race([result, timeout])).rejects.toThrow('Circular dependency detected')
  })

  test('concurrent async circular dependencies include longer pending paths', async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 0))
    let bRef!: Ref<Promise<unknown>>
    let cRef!: Ref<Promise<unknown>>
    const aRef: Ref<Promise<unknown>> = provide(async function AsyncServiceA({ inject }): Promise<unknown> {
      await wait()
      return await inject(bRef)
    })
    bRef = provide(async function AsyncServiceB({ inject }): Promise<unknown> {
      await wait()
      return await inject(cRef)
    })
    cRef = provide(async function AsyncServiceC({ inject }): Promise<unknown> {
      await wait()
      return await inject(aRef)
    })

    const result = bootstrapApp(async ({ inject }) => {
      await Promise.all([inject(aRef), inject(bRef), inject(cRef)])
    })
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for circular dependency detection')), 50)
    })

    await expect(Promise.race([result, timeout])).rejects.toThrow('Circular dependency detected')
  })
})

describe('IoC Container - Installation Functions', () => {
  function provideOpenTelemetry(options: { runtimeKind: string }) {
    const openTelemetryToken = token<{ runtimeKind: string; id: number }>('OpenTelemetryRuntime')
    const optionsToken = token<{ runtimeKind: string }>('OpenTelemetryOptions')
    let counter = 0

    return {
      openTelemetryToken,
      providers: bundleProviders(
        provideFor(optionsToken, () => options),
        provideFor(openTelemetryToken, ({ inject }) => ({
          id: ++counter,
          runtimeKind: inject(optionsToken).runtimeKind,
        })),
      ),
    }
  }

  test('installation functions can be used at app level', async () => {
    const telemetry = provideOpenTelemetry({ runtimeKind: 'http' })
    const serverRef = provide(({ inject }) => inject(telemetry.openTelemetryToken))

    const result = await bootstrapApp(
      ({ inject }) => {
        const a = inject(serverRef)
        const b = inject(serverRef)
        return { a, b }
      },
      {
        providers: [telemetry.providers],
      },
    )

    expect(result.a).toBe(result.b)
    expect(result.a.runtimeKind).toBe('http')
  })

  test('installation functions can be reinstalled deeper for a new subtree instance', async () => {
    const telemetryToken = token<{ runtimeKind: string; id: number }>('OpenTelemetryRuntime')
    const optionsToken = token<{ runtimeKind: string }>('OpenTelemetryOptions')
    let counter = 0

    function provideOpenTelemetry(options: { runtimeKind: string }) {
      return bundleProviders(
        provideFor(optionsToken, () => options),
        provideFor(telemetryToken, ({ inject }) => ({
          id: ++counter,
          runtimeKind: inject(optionsToken).runtimeKind,
        })),
      )
    }

    const leafRef = provide(({ inject }) => inject(telemetryToken))
    const childRef = provide(
      ({ inject }) => ({
        leaf: inject(leafRef),
        self: inject(telemetryToken),
      }),
      {
        providers: [provideOpenTelemetry({ runtimeKind: 'worker' })],
      },
    )
    const parentRef = provide(
      ({ inject }) => ({
        child: inject(childRef),
        self: inject(telemetryToken),
      }),
      {
        providers: [provideOpenTelemetry({ runtimeKind: 'http' })],
      },
    )

    const result = await bootstrapApp(({ inject }) => inject(parentRef))

    expect(result.self.runtimeKind).toBe('http')
    expect(result.child.self.runtimeKind).toBe('worker')
    expect(result.child.leaf.runtimeKind).toBe('worker')
    expect(result.self.id).not.toBe(result.child.self.id)
  })
})

describe('IoC Container - Type-friendly shapes', () => {
  test('tokens work with explicit interfaces', async () => {
    interface UserRepository {
      findById(id: number): string
    }

    const userRepositoryToken = token<UserRepository>('UserRepository')

    const result = await bootstrapApp(({ inject }) => inject(userRepositoryToken).findById(1), {
      providers: [
        provideFor(userRepositoryToken, () => ({
          findById: id => `user:${id}`,
        })),
      ],
    })

    expect(result).toBe('user:1')
  })

  test('refs can still be used as the primary public abstraction', async () => {
    const configRef = provide(() => ({ baseUrl: 'https://api.example.com' }))
    const userServiceRef = provide(({ inject }) => ({
      getUserUrl: (id: number) => `${inject(configRef).baseUrl}/users/${id}`,
    }))

    const result = await bootstrapApp(({ inject }) => inject(userServiceRef).getUserUrl(7))

    expect(result).toBe('https://api.example.com/users/7')
  })

  test('invalid provider input throws a clear error', async () => {
    await expect(
      bootstrapApp(() => 'ok', {
        providers: [123 as unknown as never],
      }),
    ).rejects.toThrow('Invalid provider input received')
  })

  test('invalid inject key throws a clear error', async () => {
    await expect(bootstrapApp(({ inject }) => inject(123 as unknown as Token<number>))).rejects.toThrow('Invalid inject key received')
  })
})
