import { beforeEach, describe, expect, test } from 'bun:test'
import { provide, runInInjectionContext, isProvideRef, resetGlobalInstances, type Context, type Ref } from './index'

beforeEach(() => {
  resetGlobalInstances()
})

describe('IoC Container', () => {
  test('basic provide and inject', () => {
    const ref = provide(() => 'test value')

    runInInjectionContext(({ inject }) => {
      const value = inject(ref)
      expect(value).toBe('test value')
    })
  })

  test('factory receives inject as parameter', () => {
    const configRef = provide(() => ({ apiUrl: 'https://api.example.com' }))

    const serviceRef = provide(({ inject }) => {
      const config = inject(configRef)
      return {
        getEndpoint: (path: string) => `${config.apiUrl}${path}`,
      }
    })

    runInInjectionContext(({ inject }) => {
      const service = inject(serviceRef)
      expect(service.getEndpoint('/users')).toBe('https://api.example.com/users')
    })
  })

  test('no global state - concurrent async operations are safe', async () => {
    let counterA = 0
    let counterB = 0

    const refA = provide(() => ({ id: ++counterA, name: 'A' }), { mode: 'standalone' })
    const refB = provide(() => ({ id: ++counterB, name: 'B' }), { mode: 'standalone' })

    const [resultA, resultB] = await Promise.all([
      runInInjectionContext(async ({ inject }) => {
        await new Promise(r => setTimeout(r, 50))
        const a = inject(refA)
        await new Promise(r => setTimeout(r, 50))
        return a
      }),
      runInInjectionContext(async ({ inject }) => {
        await new Promise(r => setTimeout(r, 25))
        const b = inject(refB)
        await new Promise(r => setTimeout(r, 25))
        return b
      }),
    ])

    expect(resultA.name).toBe('A')
    expect(resultB.name).toBe('B')
  })

  test('global mode shares instances across contexts', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }))

    let value1: { id: number } | undefined
    let value2: { id: number } | undefined

    runInInjectionContext(({ inject }) => {
      value1 = inject(ref)
    })

    runInInjectionContext(({ inject }) => {
      value2 = inject(ref)
    })

    expect(value1).toBe(value2)
    expect(counter).toBe(1)
  })

  test('standalone mode creates new instances per context', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }), { mode: 'standalone' })

    let value1: { id: number } | undefined
    let value2: { id: number } | undefined

    runInInjectionContext(({ inject }) => {
      value1 = inject(ref)
    })

    runInInjectionContext(({ inject }) => {
      value2 = inject(ref)
    })

    expect(value1).not.toBe(value2)
    expect(counter).toBe(2)
  })

  test('nested dependencies with inject parameter', () => {
    const dbRef = provide(() => ({ query: (sql: string) => `Result: ${sql}` }))

    const userRepoRef = provide(({ inject }) => {
      const db = inject(dbRef)
      return {
        findUser: (id: number) => db.query(`SELECT * FROM users WHERE id = ${id}`),
      }
    })

    const userServiceRef = provide(({ inject }) => {
      const userRepo = inject(userRepoRef)
      return {
        getUser: (id: number) => userRepo.findUser(id),
      }
    })

    runInInjectionContext(({ inject }) => {
      const userService = inject(userServiceRef)
      expect(userService.getUser(1)).toBe('Result: SELECT * FROM users WHERE id = 1')
    })
  })

  test('local providers override global providers', () => {
    const configRef = provide(() => 'global config')

    const serviceRef = provide(
      ({ inject }) => {
        const config = inject(configRef)
        return { config }
      },
      {
        providers: [provide(() => 'local config', { overrides: configRef })],
      },
    )

    runInInjectionContext(({ inject }) => {
      const globalConfig = inject(configRef)
      const service = inject(serviceRef)

      expect(globalConfig).toBe('global config')
      expect(service.config).toBe('local config')
    })
  })

  test('type safety with inject parameter', () => {
    interface User {
      id: number
      name: string
    }

    const userRef = provide<User>(() => ({ id: 1, name: 'Alice' }))

    runInInjectionContext(({ inject }) => {
      const user = inject(userRef)
      expect(user.id).toBe(1)
      expect(user.name).toBe('Alice')
    })
  })

  test('context can be passed to helper functions', () => {
    const ref = provide(() => 'value')

    function helperFunction(ctx: Context) {
      return ctx.inject(ref)
    }

    runInInjectionContext(ctx => {
      const result = helperFunction(ctx)
      expect(result).toBe('value')
    })
  })

  test('complex real-world scenario: multi-tenant', () => {
    interface Tenant {
      id: string
      name: string
    }

    const defaultTenantRef = provide<Tenant>(() => ({ id: 'default', name: 'Default' }))

    const apiServiceRef = provide(({ inject }) => {
      const tenant = inject(defaultTenantRef)
      return {
        getTenantInfo: () => `${tenant.name} (${tenant.id})`,
      }
    })

    const tenant1AppRef = provide(
      ({ inject }) => {
        const api = inject(apiServiceRef)
        return { info: api.getTenantInfo() }
      },
      {
        providers: [
          provide<Tenant>(() => ({ id: 't1', name: 'Tenant 1' }), { overrides: defaultTenantRef }),
        ],
      },
    )

    const tenant2AppRef = provide(
      ({ inject }) => {
        const api = inject(apiServiceRef)
        return { info: api.getTenantInfo() }
      },
      {
        providers: [
          provide<Tenant>(() => ({ id: 't2', name: 'Tenant 2' }), { overrides: defaultTenantRef }),
        ],
      },
    )

    runInInjectionContext(({ inject }) => {
      const app1 = inject(tenant1AppRef)
      const app2 = inject(tenant2AppRef)

      expect(app1.info).toBe('Tenant 1 (t1)')
      expect(app2.info).toBe('Tenant 2 (t2)')
    })
  })

  test('isProvideRef correctly identifies Ref', () => {
    const ref = provide(() => 'value')
    expect(isProvideRef(ref)).toBe(true)
    expect(isProvideRef({})).toBe(false)
    expect(isProvideRef(null)).toBe(false)
  })

  test('circular dependency throws error with name', () => {
    const aRef: Ref<unknown> = provide(
      function ServiceA({ inject }) { return inject(bRef) }
    )
    const bRef: Ref<unknown> = provide(
      function ServiceB({ inject }) { return inject(aRef) }
    )

    runInInjectionContext(({ inject }) => {
      expect(() => inject(aRef)).toThrow('Circular dependency detected: ServiceA')
    })
  })

  test('circular dependency throws error without name', () => {
    const aRef: Ref<unknown> = provide(({ inject }) => inject(bRef))
    const bRef: Ref<unknown> = provide(({ inject }) => inject(aRef))

    runInInjectionContext(({ inject }) => {
      expect(() => inject(aRef)).toThrow('Circular dependency detected: <anonymous>')
    })
  })

  test('self-referencing circular dependency', () => {
    const selfRef: Ref<unknown> = provide(
      function SelfRef({ inject }) { return inject(selfRef) }
    )

    runInInjectionContext(({ inject }) => {
      expect(() => inject(selfRef)).toThrow('Circular dependency detected: SelfRef')
    })
  })

  test('resetGlobalInstances clears cached instances', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }))

    runInInjectionContext(({ inject }) => {
      const value1 = inject(ref)
      expect(value1.id).toBe(1)
    })

    resetGlobalInstances()

    runInInjectionContext(({ inject }) => {
      const value2 = inject(ref)
      expect(value2.id).toBe(2)
    })
  })
})

describe('IoC Container - Async Support', () => {
  test('async factory function', async () => {
    const asyncRef = provide(async () => {
      await new Promise(r => setTimeout(r, 10))
      return { data: 'async value' }
    })

    const result = await runInInjectionContext(async ({ inject }) => {
      const value = await inject(asyncRef)
      return value.data
    })

    expect(result).toBe('async value')
  })

  test('async factory with dependencies', async () => {
    const configRef = provide(() => ({ delay: 10 }))

    const asyncServiceRef = provide(async ({ inject }) => {
      const config = inject(configRef)
      await new Promise(r => setTimeout(r, config.delay))
      return { status: 'loaded' }
    })

    const result = await runInInjectionContext(async ({ inject }) => {
      const service = await inject(asyncServiceRef)
      return service.status
    })

    expect(result).toBe('loaded')
  })

  test('mixed sync and async dependencies', async () => {
    const syncRef = provide(() => 'sync')
    const asyncRef = provide(async () => {
      await new Promise(r => setTimeout(r, 5))
      return 'async'
    })

    const combinedRef = provide(async ({ inject }) => {
      const syncValue = inject(syncRef)
      const asyncValue = await inject(asyncRef)
      return `${syncValue}-${asyncValue}`
    })

    const result = await runInInjectionContext(async ({ inject }) => {
      return await inject(combinedRef)
    })

    expect(result).toBe('sync-async')
  })
})

describe('IoC Container - Local Providers', () => {
  test('nested local providers', () => {
    const valueRef = provide(() => 'root')

    const level1Ref = provide(
      ({ inject }) => `L1:${inject(valueRef)}`,
      {
        providers: [provide(() => 'level1', { overrides: valueRef })]
      }
    )

    const level2Ref = provide(
      ({ inject }) => `L2:${inject(level1Ref)}`,
      {
        providers: [provide(() => 'level2', { overrides: valueRef })]
      }
    )

    runInInjectionContext(({ inject }) => {
      expect(inject(valueRef)).toBe('root')
      expect(inject(level1Ref)).toBe('L1:level1')
      expect(inject(level2Ref)).toBe('L2:L1:level1')
    })
  })

  test('multiple providers in single ref', () => {
    const aRef = provide(() => 'A')
    const bRef = provide(() => 'B')

    const combinedRef = provide(
      ({ inject }) => `${inject(aRef)}-${inject(bRef)}`,
      {
        providers: [
          provide(() => 'X', { overrides: aRef }),
          provide(() => 'Y', { overrides: bRef })
        ]
      }
    )

    runInInjectionContext(({ inject }) => {
      expect(inject(aRef)).toBe('A')
      expect(inject(bRef)).toBe('B')
      expect(inject(combinedRef)).toBe('X-Y')
    })
  })

  test('provider without overrides creates new ref', () => {
    const originalRef = provide(() => 'original')

    const serviceRef = provide(
      ({ inject }) => {
        const val = inject(originalRef)
        return `service:${val}`
      },
      {
        providers: [provide(() => 'new')]
      }
    )

    runInInjectionContext(({ inject }) => {
      expect(inject(originalRef)).toBe('original')
      expect(inject(serviceRef)).toBe('service:original')
    })
  })

  test('deep dependency chain with override', () => {
    const configRef = provide(() => ({ url: 'prod.com' }))

    const httpRef = provide(({ inject }) => {
      const config = inject(configRef)
      return { baseUrl: config.url }
    }, { mode: 'standalone' })

    const apiRef = provide(({ inject }) => {
      const http = inject(httpRef)
      return { endpoint: `https://${http.baseUrl}/api` }
    }, { mode: 'standalone' })

    const appRef = provide(
      ({ inject }) => inject(apiRef),
      {
        providers: [
          provide(() => ({ url: 'test.com' }), { overrides: configRef })
        ]
      }
    )

    runInInjectionContext(({ inject }) => {
      expect(inject(appRef).endpoint).toBe('https://test.com/api')
    })
  })
})

describe('IoC Container - Edge Cases', () => {
  test('inject same ref multiple times returns same instance', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }))

    runInInjectionContext(({ inject }) => {
      const a = inject(ref)
      const b = inject(ref)
      const c = inject(ref)

      expect(a).toBe(b)
      expect(b).toBe(c)
      expect(counter).toBe(1)
    })
  })

  test('standalone ref in same context returns same instance', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }), { mode: 'standalone' })

    runInInjectionContext(({ inject }) => {
      const a = inject(ref)
      const b = inject(ref)

      expect(a).toBe(b)
      expect(counter).toBe(1)
    })
  })

  test('factory returning primitive values', () => {
    const numRef = provide(() => 42)
    const strRef = provide(() => 'hello')
    const boolRef = provide(() => true)
    const nullRef = provide(() => null)
    const undefinedRef = provide(() => undefined)

    runInInjectionContext(({ inject }) => {
      expect(inject(numRef)).toBe(42)
      expect(inject(strRef)).toBe('hello')
      expect(inject(boolRef)).toBe(true)
      expect(inject(nullRef)).toBe(null)
      expect(inject(undefinedRef)).toBe(undefined)
    })
  })

  test('factory returning function', () => {
    const fnRef = provide(() => (x: number) => x * 2)

    runInInjectionContext(({ inject }) => {
      const fn = inject(fnRef)
      expect(fn(5)).toBe(10)
    })
  })

  test('factory returning array', () => {
    const arrRef = provide(() => [1, 2, 3])

    runInInjectionContext(({ inject }) => {
      const arr = inject(arrRef)
      expect(arr).toEqual([1, 2, 3])
    })
  })

  test('factory throwing error', () => {
    const errorRef = provide(() => {
      throw new Error('Factory error')
    })

    runInInjectionContext(({ inject }) => {
      expect(() => inject(errorRef)).toThrow('Factory error')
    })
  })

  test('factory error does not corrupt state', () => {
    let shouldThrow = true
    let counter = 0

    const ref = provide(() => {
      counter++
      if (shouldThrow) {
        throw new Error('Temporary error')
      }
      return { id: counter }
    })

    runInInjectionContext(({ inject }) => {
      expect(() => inject(ref)).toThrow('Temporary error')

      shouldThrow = false
      const value = inject(ref)
      expect(value.id).toBe(2)
    })
  })

  test('empty providers array', () => {
    const ref = provide(() => 'value', { providers: [] })

    runInInjectionContext(({ inject }) => {
      expect(inject(ref)).toBe('value')
    })
  })
})

describe('IoC Container - Mode Inheritance', () => {
  test('global dependency used by standalone parent', () => {
    let globalCounter = 0
    const globalRef = provide(() => ({ id: ++globalCounter }))
    const standaloneRef = provide(({ inject }) => {
      return { global: inject(globalRef) }
    }, { mode: 'standalone' })

    let result1: { global: { id: number } } | undefined
    let result2: { global: { id: number } } | undefined

    runInInjectionContext(({ inject }) => {
      result1 = inject(standaloneRef)
    })

    runInInjectionContext(({ inject }) => {
      result2 = inject(standaloneRef)
    })

    // Standalone creates new wrapper, but global dependency is shared
    expect(result1).not.toBe(result2)
    expect(result1!.global).toBe(result2!.global)
    expect(globalCounter).toBe(1)
  })

  test('standalone dependency used by global parent', () => {
    let standaloneCounter = 0
    const standaloneRef = provide(() => ({ id: ++standaloneCounter }), { mode: 'standalone' })
    const globalRef = provide(({ inject }) => {
      return { standalone: inject(standaloneRef) }
    })

    let result1: { standalone: { id: number } } | undefined
    let result2: { standalone: { id: number } } | undefined

    runInInjectionContext(({ inject }) => {
      result1 = inject(globalRef)
    })

    runInInjectionContext(({ inject }) => {
      result2 = inject(globalRef)
    })

    // Global parent is cached, so standalone is only created once
    expect(result1).toBe(result2)
    expect(result1!.standalone).toBe(result2!.standalone)
    expect(standaloneCounter).toBe(1)
  })
})

describe('IoC Container - Circular Dependency Details', () => {
  test('three-way circular dependency', () => {
    const aRef: Ref<unknown> = provide(function A({ inject }) { return inject(bRef) })
    const bRef: Ref<unknown> = provide(function B({ inject }) { return inject(cRef) })
    const cRef: Ref<unknown> = provide(function C({ inject }) { return inject(aRef) })

    runInInjectionContext(({ inject }) => {
      expect(() => inject(aRef)).toThrow('Circular dependency detected: A')
    })
  })

  test('circular dependency detection clears after resolution', () => {
    const nonCircularRef = provide(function NonCircular() { return 'value' })

    const circularARef: Ref<unknown> = provide(function CircularA({ inject }) { return inject(circularBRef) })
    const circularBRef: Ref<unknown> = provide(function CircularB({ inject }) { return inject(circularARef) })

    runInInjectionContext(({ inject }) => {
      // First, circular dependency should throw
      expect(() => inject(circularARef)).toThrow('Circular dependency detected')

      // Non-circular should still work
      expect(inject(nonCircularRef)).toBe('value')
    })
  })

  test('diamond dependency pattern (not circular)', () => {
    const baseRef = provide(function Base() { return { value: 'base' } })

    const leftRef = provide(function Left({ inject }) {
      return {
        base: inject(baseRef),
        side: 'left'
      }
    })

    const rightRef = provide(function Right({ inject }) {
      return {
        base: inject(baseRef),
        side: 'right'
      }
    })

    const topRef = provide(function Top({ inject }) {
      return {
        left: inject(leftRef),
        right: inject(rightRef)
      }
    })

    runInInjectionContext(({ inject }) => {
      const top = inject(topRef)
      expect(top.left.base).toBe(top.right.base)
      expect(top.left.side).toBe('left')
      expect(top.right.side).toBe('right')
    })
  })
})

describe('IoC Container - Concurrent Safety', () => {
  test('multiple concurrent contexts with different data', async () => {
    let counter = 0
    const dataRef = provide(() => ({ id: ++counter }), { mode: 'standalone' })

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        runInInjectionContext(async ({ inject }) => {
          await new Promise(r => setTimeout(r, Math.random() * 100))
          const data = inject(dataRef)
          await new Promise(r => setTimeout(r, Math.random() * 100))
          return { index: i, id: data.id }
        }),
      ),
    )

    const ids = new Set(results.map(r => r.id))
    expect(ids.size).toBe(10)
  })

  test('context isolation during interleaved async operations', async () => {
    const contextIdRef = provide(() => Math.random(), { mode: 'standalone' })
    const results: { step: string; id: number }[] = []

    await Promise.all([
      runInInjectionContext(async ({ inject }) => {
        const id = inject(contextIdRef)
        results.push({ step: 'A-start', id })
        await new Promise(r => setTimeout(r, 30))
        results.push({ step: 'A-middle', id })
        const id2 = inject(contextIdRef)
        expect(id2).toBe(id)
        await new Promise(r => setTimeout(r, 30))
        results.push({ step: 'A-end', id })
      }),
      runInInjectionContext(async ({ inject }) => {
        const id = inject(contextIdRef)
        results.push({ step: 'B-start', id })
        await new Promise(r => setTimeout(r, 20))
        results.push({ step: 'B-middle', id })
        const id2 = inject(contextIdRef)
        expect(id2).toBe(id)
        await new Promise(r => setTimeout(r, 20))
        results.push({ step: 'B-end', id })
      }),
    ])

    const aResults = results.filter(r => r.step.startsWith('A-'))
    const bResults = results.filter(r => r.step.startsWith('B-'))

    expect(new Set(aResults.map(r => r.id)).size).toBe(1)
    expect(new Set(bResults.map(r => r.id)).size).toBe(1)
    expect(aResults[0].id).not.toBe(bResults[0].id)
  })
})
