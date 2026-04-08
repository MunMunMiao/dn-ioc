import { describe, expect, test } from 'bun:test'
import { bootstrapApp, bundleProviders, type Context, isProvideRef, provide, provideFor, type Token, token } from './ioc'

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
    const aRef = provide(function ServiceA({ inject }) {
      return inject(bRef)
    })
    const bRef = provide(function ServiceB({ inject }) {
      return inject(aRef)
    })

    await expect(bootstrapApp(({ inject }) => inject(aRef))).rejects.toThrow(
      'Circular dependency detected: ServiceA -> ServiceB -> ServiceA',
    )
  })

  test('anonymous circular dependency also uses <anonymous> in the cycle path', async () => {
    const aRef = provide(({ inject }) => inject(bRef))
    const bRef = provide(({ inject }) => inject(aRef))

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
    const settingsToken = token<{ ready: boolean }>('Settings')
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
