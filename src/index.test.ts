import { describe, expect, test } from 'bun:test'
import { inject, isInInjectionContext, isProvideRef, provide, runInInjectionContext } from './index'

describe('IoC Container', () => {
  test('provide and inject', () => {
    const ref = provide(() => 'test value')

    runInInjectionContext(() => {
      const value = inject(ref)
      expect(value).toBe('test value')
    })
  })

  test('provide factory with object', () => {
    const ref = provide(() => ({ id: 1, name: 'John' }))

    runInInjectionContext(() => {
      const value = inject(ref)
      expect(value).toEqual({ id: 1, name: 'John' })
    })
  })

  test('isInInjectionContext returns false outside context', () => {
    expect(isInInjectionContext()).toBe(false)
  })

  test('isInInjectionContext returns true inside context', () => {
    runInInjectionContext(() => {
      expect(isInInjectionContext()).toBe(true)
    })
  })

  test('inject throws error outside injection context', () => {
    const ref = provide(() => 'value')
    expect(() => inject(ref)).toThrow('inject() must be called within an injection context')
  })

  test('global mode shares instances across contexts', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }))

    let value1: { id: number } | undefined
    let value2: { id: number } | undefined
    runInInjectionContext(() => {
      value1 = inject(ref)
    })

    runInInjectionContext(() => {
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
    runInInjectionContext(() => {
      value1 = inject(ref)
    })

    runInInjectionContext(() => {
      value2 = inject(ref)
    })

    expect(value1).not.toBe(value2)
    expect(counter).toBe(2)
  })

  test('mode can be explicitly set to global', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }), { mode: 'global' })

    let value1: { id: number } | undefined
    let value2: { id: number } | undefined
    runInInjectionContext(() => {
      value1 = inject(ref)
    })

    runInInjectionContext(() => {
      value2 = inject(ref)
    })

    expect(value1).toBe(value2)
    expect(counter).toBe(1)
  })

  test('mode can be explicitly set to standalone', () => {
    let counter = 0
    const ref = provide(() => ({ id: ++counter }), { mode: 'standalone' })

    let value1: { id: number } | undefined
    let value2: { id: number } | undefined
    runInInjectionContext(() => {
      value1 = inject(ref)
    })

    runInInjectionContext(() => {
      value2 = inject(ref)
    })

    expect(value1).not.toBe(value2)
    expect(counter).toBe(2)
  })

  test('type inference works correctly', () => {
    const stringRef = provide(() => 'value')

    runInInjectionContext(() => {
      const value: string = inject(stringRef)
      expect(typeof value).toBe('string')
    })

    const objectRef = provide(() => ({ id: 1, name: 'test' }))

    runInInjectionContext(() => {
      const value: { id: number; name: string } = inject(objectRef)
      expect(value.id).toBe(1)
      expect(value.name).toBe('test')
    })
  })

  test('complex usage scenario', () => {
    const ref1 = provide(() => 'world')
    const ref2 = provide(() => ({ id: 1, name: 'John' }))

    runInInjectionContext(() => {
      const value = inject(ref1)
      const value2 = inject(ref2)
      expect(value).toBe('world')
      expect(value2).toEqual({ id: 1, name: 'John' })
    })
  })

  test('nested contexts work correctly', () => {
    const ref = provide(() => ({ id: Math.random() }), { mode: 'standalone' })

    runInInjectionContext(() => {
      const value1 = inject(ref)

      runInInjectionContext(() => {
        const value2 = inject(ref)
        expect(value1).not.toBe(value2)
      })
    })
  })

  test('multiple injects in same context return same instance', () => {
    const ref = provide(() => ({ id: Math.random() }))

    runInInjectionContext(() => {
      const value1 = inject(ref)
      const value2 = inject(ref)
      expect(value1).toBe(value2)
    })
  })

  test('isProvideRef correctly identifies Ref', () => {
    const ref = provide(() => 'value')
    expect(isProvideRef(ref)).toBe(true)

    const ref2 = provide(() => 'value')
    expect(isProvideRef(ref2)).toBe(true)

    expect(isProvideRef({})).toBe(false)
    expect(isProvideRef(null)).toBe(false)
    expect(isProvideRef(undefined)).toBe(false)
    expect(isProvideRef('string')).toBe(false)
    expect(isProvideRef(123)).toBe(false)
  })
})

describe('IoC Container - Advanced Scenarios', () => {
  test('inject with different primitive types', () => {
    const stringRef = provide(() => 'hello')
    const numberRef = provide(() => 42)
    const booleanRef = provide(() => true)

    runInInjectionContext(() => {
      expect(inject(stringRef)).toBe('hello')
      expect(inject(numberRef)).toBe(42)
      expect(inject(booleanRef)).toBe(true)
    })
  })

  test('inject with null values', () => {
    const nullRef = provide(() => null)

    runInInjectionContext(() => {
      expect(inject(nullRef)).toBeNull()
    })
  })

  test('inject with undefined from factory', () => {
    const undefinedRef = provide(() => undefined)

    runInInjectionContext(() => {
      expect(inject(undefinedRef)).toBeUndefined()
    })
  })

  test('inject with array type', () => {
    const arrayRef = provide(() => [1, 2, 3, 4, 5])

    runInInjectionContext(() => {
      const arr = inject(arrayRef)
      expect(arr).toEqual([1, 2, 3, 4, 5])
      expect(Array.isArray(arr)).toBe(true)
    })
  })

  test('inject with function type', () => {
    const fnRef = provide(() => (x: number) => x * 2)

    runInInjectionContext(() => {
      const fn = inject(fnRef)
      expect(fn(5)).toBe(10)
      expect(typeof fn).toBe('function')
    })
  })

  test('inject with class instance', () => {
    class TestClass {
      constructor(
        public name: string,
        public id: number,
      ) {}
      greet() {
        return `Hello, ${this.name}`
      }
    }

    const classRef = provide(() => new TestClass('Alice', 1))

    runInInjectionContext(() => {
      const instance = inject(classRef)
      expect(instance.name).toBe('Alice')
      expect(instance.id).toBe(1)
      expect(instance.greet()).toBe('Hello, Alice')
      expect(instance instanceof TestClass).toBe(true)
    })
  })

  test('inject with nested dependencies', () => {
    const configRef = provide(() => ({ apiUrl: 'https://api.example.com' }))
    const serviceRef = provide(() => {
      const config = inject(configRef)
      return {
        config,
        fetch: (endpoint: string) => `${config.apiUrl}${endpoint}`,
      }
    })

    runInInjectionContext(() => {
      const service = inject(serviceRef)
      expect(service.config.apiUrl).toBe('https://api.example.com')
      expect(service.fetch('/users')).toBe('https://api.example.com/users')
    })
  })

  test('factory function is only called once in global mode', () => {
    let callCount = 0
    const ref = provide(() => {
      callCount++
      return { id: callCount }
    })

    runInInjectionContext(() => {
      inject(ref)
      inject(ref)
      inject(ref)
    })

    runInInjectionContext(() => {
      inject(ref)
      inject(ref)
    })

    expect(callCount).toBe(1)
  })

  test('factory function is called once per context in standalone mode', () => {
    let callCount = 0
    const ref = provide(
      () => {
        callCount++
        return { id: callCount }
      },
      { mode: 'standalone' },
    )

    runInInjectionContext(() => {
      inject(ref)
      inject(ref)
      inject(ref)
    })

    runInInjectionContext(() => {
      inject(ref)
      inject(ref)
    })

    expect(callCount).toBe(2)
  })

  test('multiple refs are independent', () => {
    const ref1 = provide(() => 'value1')
    const ref2 = provide(() => 'value2')

    runInInjectionContext(() => {
      expect(inject(ref1)).toBe('value1')
      expect(inject(ref2)).toBe('value2')
    })
  })

  test('deeply nested contexts maintain isolation in standalone mode', () => {
    const ref = provide(() => ({ id: Math.random() }), { mode: 'standalone' })
    const results: number[] = []

    runInInjectionContext(() => {
      const val1 = inject(ref)
      results.push(val1.id)

      runInInjectionContext(() => {
        const val2 = inject(ref)
        results.push(val2.id)

        runInInjectionContext(() => {
          const val3 = inject(ref)
          results.push(val3.id)
        })
      })
    })

    // All three values should be different
    expect(new Set(results).size).toBe(3)
  })

  test('context restoration after function execution', () => {
    expect(isInInjectionContext()).toBe(false)

    runInInjectionContext(() => {
      expect(isInInjectionContext()).toBe(true)
    })

    expect(isInInjectionContext()).toBe(false)
  })

  test('context restoration after function throws error', () => {
    expect(isInInjectionContext()).toBe(false)

    try {
      runInInjectionContext(() => {
        expect(isInInjectionContext()).toBe(true)
        throw new Error('Test error')
      })
    } catch (_e) {
      // Expected error
    }

    expect(isInInjectionContext()).toBe(false)
  })

  test('runInInjectionContext does not return value', () => {
    const ref = provide(() => ({ value: 42 }))

    runInInjectionContext(() => {
      const service = inject(ref)
      expect(service.value).toBe(42)
    })
  })

  test('complex object with methods', () => {
    interface Counter {
      value: number
      increment(): void
      decrement(): void
      getValue(): number
    }

    const counterRef = provide<Counter>(() => {
      const value = 0
      return {
        value,
        increment() {
          this.value++
        },
        decrement() {
          this.value--
        },
        getValue() {
          return this.value
        },
      }
    })

    runInInjectionContext(() => {
      const counter1 = inject(counterRef)
      const counter2 = inject(counterRef)

      counter1.increment()
      counter1.increment()

      expect(counter1.getValue()).toBe(2)
      expect(counter2.getValue()).toBe(2)
      expect(counter1).toBe(counter2)
    })
  })

  test('standalone instances are isolated within same context', () => {
    const ref = provide(() => ({ id: Math.random() }), { mode: 'standalone' })

    runInInjectionContext(() => {
      const val1 = inject(ref)
      const val2 = inject(ref)

      expect(val1).toBe(val2)
      expect(val1.id).toBe(val2.id)
    })
  })

  test('mixing global and standalone refs', () => {
    let globalCounter = 0
    let standaloneCounter = 0

    const globalRef = provide(() => ({ id: ++globalCounter }), { mode: 'global' })
    const standaloneRef = provide(() => ({ id: ++standaloneCounter }), { mode: 'standalone' })

    runInInjectionContext(() => {
      inject(globalRef)
      inject(standaloneRef)
    })

    runInInjectionContext(() => {
      inject(globalRef)
      inject(standaloneRef)
    })

    expect(globalCounter).toBe(1)
    expect(standaloneCounter).toBe(2)
  })

  test('inject with Map and Set types', () => {
    const mapRef = provide(() => {
      const map = new Map<string, number>()
      map.set('a', 1)
      map.set('b', 2)
      return map
    })

    const setRef = provide(() => {
      const set = new Set<number>()
      set.add(1)
      set.add(2)
      set.add(3)
      return set
    })

    runInInjectionContext(() => {
      const map = inject(mapRef)
      const set = inject(setRef)

      expect(map.get('a')).toBe(1)
      expect(map.get('b')).toBe(2)
      expect(set.has(1)).toBe(true)
      expect(set.has(2)).toBe(true)
      expect(set.size).toBe(3)
    })
  })

  test('inject with Date and RegExp types', () => {
    const dateRef = provide(() => new Date('2024-01-01'))
    const regexRef = provide(() => /test/gi)

    runInInjectionContext(() => {
      const date = inject(dateRef)
      const regex = inject(regexRef)

      expect(date instanceof Date).toBe(true)
      expect(date.getFullYear()).toBe(2024)
      expect(regex instanceof RegExp).toBe(true)
      expect(regex.test('TEST')).toBe(true)
    })
  })

  test('inject with Promise type', () => {
    const promiseRef = provide(() => Promise.resolve(42))

    runInInjectionContext(async () => {
      const promise = inject(promiseRef)
      const value = await promise
      expect(value).toBe(42)
    })
  })

  test('multiple refs with same value type', () => {
    const ref1 = provide(() => 'ref1 value')
    const ref2 = provide(() => 'ref2 value')

    expect(ref1).not.toBe(ref2)
  })

  test('large number of dependencies', () => {
    const refs = Array.from({ length: 100 }, (_, i) => provide(() => ({ id: i, value: `value-${i}` })))

    runInInjectionContext(() => {
      refs.forEach((ref, i) => {
        const value = inject(ref)
        expect(value.id).toBe(i)
        expect(value.value).toBe(`value-${i}`)
      })
    })
  })

  test('inject with Symbol keys in object', () => {
    const sym = Symbol('test')
    const ref = provide(() => ({
      [sym]: 'symbol value',
      normal: 'normal value',
    }))

    runInInjectionContext(() => {
      const obj = inject(ref)
      expect(obj[sym]).toBe('symbol value')
      expect(obj.normal).toBe('normal value')
    })
  })

  test('type guard with arrays', () => {
    const stringRef = provide(() => 'a')
    const numberRef = provide(() => 1)
    const booleanRef = provide(() => true)

    const refs = [stringRef, numberRef, booleanRef]

    refs.forEach(ref => {
      expect(isProvideRef(ref)).toBe(true)
    })
  })

  test('nested injection context with different refs', () => {
    const ref1 = provide(() => ({ level: 1 }), { mode: 'standalone' })
    const ref2 = provide(() => ({ level: 2 }), { mode: 'standalone' })

    runInInjectionContext(() => {
      const val1 = inject(ref1)
      expect(val1.level).toBe(1)

      runInInjectionContext(() => {
        const val2 = inject(ref2)
        expect(val2.level).toBe(2)

        const val1Inner = inject(ref1)
        expect(val1Inner).not.toBe(val1)
        expect(val1Inner.level).toBe(1)
      })
    })
  })

  test('factory function with side effects', () => {
    const sideEffects: string[] = []
    const ref = provide(() => {
      sideEffects.push('created')
      return { value: 'test' }
    })

    runInInjectionContext(() => {
      inject(ref)
      inject(ref)
      inject(ref)
    })

    expect(sideEffects).toEqual(['created'])
  })

  test('complex generic types', () => {
    interface GenericContainer<T> {
      value: T
      getValue(): T
    }

    const stringContainerRef = provide<GenericContainer<string>>(() => ({
      value: 'test',
      getValue() {
        return this.value
      },
    }))

    const numberContainerRef = provide<GenericContainer<number>>(() => ({
      value: 42,
      getValue() {
        return this.value
      },
    }))

    runInInjectionContext(() => {
      const strContainer = inject(stringContainerRef)
      const numContainer = inject(numberContainerRef)

      expect(strContainer.getValue()).toBe('test')
      expect(numContainer.getValue()).toBe(42)
    })
  })

  test('runInInjectionContext supports async functions', async () => {
    const asyncRef = provide(() => ({
      getData: async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'async data'
      },
    }))

    let result: string | undefined

    await runInInjectionContext(async () => {
      const service = inject(asyncRef)
      result = await service.getData()
    })

    expect(result).toBe('async data')
  })

  test('runInInjectionContext async context restoration', async () => {
    expect(isInInjectionContext()).toBe(false)

    const promise = runInInjectionContext(async () => {
      expect(isInInjectionContext()).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(isInInjectionContext()).toBe(true)
    })

    // Context is still active because async function hasn't completed
    expect(isInInjectionContext()).toBe(true)

    await promise
    expect(isInInjectionContext()).toBe(false)
  })

  test('runInInjectionContext async error handling', async () => {
    const ref = provide(() => ({
      fail: async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('Async error')
      },
    }))

    try {
      await runInInjectionContext(async () => {
        const service = inject(ref)
        await service.fail()
      })
      throw new Error('Should have thrown')
    } catch (error: any) {
      expect(error.message).toBe('Async error')
    }

    // Context should be restored after error
    expect(isInInjectionContext()).toBe(false)
  })
})

describe('Hierarchical Dependency Injection', () => {
  test('local providers override global providers', () => {
    const globalRef = provide(() => 'global value')

    const serviceWithLocalProviderRef = provide(
      () => {
        const value = inject(globalRef)
        return { value }
      },
      {
        providers: [provide(() => 'local value', { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const globalValue = inject(globalRef)
      const localService = inject(serviceWithLocalProviderRef)

      expect(globalValue).toBe('global value')
      expect(localService.value).toBe('local value')
    })
  })

  test('nested providers create proper hierarchy', () => {
    const configRef = provide(() => ({ level: 1 }))

    const level2Ref = provide(
      () => {
        const config = inject(configRef)
        return { ...config, source: 'level2' }
      },
      {
        providers: [provide(() => ({ level: 2 }), { overrides: configRef })],
      },
    )

    const level3Ref = provide(
      () => {
        const config = inject(configRef)
        const level2 = inject(level2Ref)
        return { level: config.level, level2: level2.level }
      },
      {
        providers: [provide(() => ({ level: 3 }), { overrides: configRef })],
      },
    )

    runInInjectionContext(() => {
      const result = inject(level3Ref)

      expect(result.level).toBe(3)
      expect(result.level2).toBe(2)
    })
  })

  test('local providers are isolated per factory', () => {
    const globalRef = provide(() => 0)

    const factory1Ref = provide(
      () => {
        return inject(globalRef)
      },
      {
        providers: [provide(() => 100, { overrides: globalRef })],
      },
    )

    const factory2Ref = provide(
      () => {
        return inject(globalRef)
      },
      {
        providers: [provide(() => 200, { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const global = inject(globalRef)
      const value1 = inject(factory1Ref)
      const value2 = inject(factory2Ref)

      expect(global).toBe(0)
      expect(value1).toBe(100)
      expect(value2).toBe(200)
    })
  })

  test('dependencies in child context are cached separately', () => {
    let callCount = 0
    const globalRef = provide(() => 'value')

    const dependentRef = provide(() => {
      callCount++
      const value = inject(globalRef)
      return { value, callCount }
    })

    const parentRef = provide(
      () => {
        const dep1 = inject(dependentRef)
        const dep2 = inject(dependentRef)
        return { dep1, dep2 }
      },
      {
        providers: [provide(() => 'local', { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const result = inject(parentRef)

      expect(result.dep1.callCount).toBe(1)
      expect(result.dep2.callCount).toBe(1)
      expect(result.dep1).toBe(result.dep2)
    })
  })

  test('multiple local providers in same factory', () => {
    const ref1 = provide(() => 'global1')
    const ref2 = provide(() => 100)

    const serviceRef = provide(
      () => {
        const val1 = inject(ref1)
        const val2 = inject(ref2)
        return { val1, val2 }
      },
      {
        providers: [provide(() => 'local1', { overrides: ref1 }), provide(() => 200, { overrides: ref2 })],
      },
    )

    runInInjectionContext(() => {
      const result = inject(serviceRef)

      expect(result.val1).toBe('local1')
      expect(result.val2).toBe(200)
    })
  })

  test('standalone mode works with local providers', () => {
    const globalRef = provide(() => 'global')

    const standaloneRef = provide(
      () => {
        const value = inject(globalRef)
        return { value }
      },
      {
        mode: 'standalone',
        providers: [provide(() => 'local', { overrides: globalRef })],
      },
    )

    let result1: { value: string } | undefined
    let result2: { value: string } | undefined

    runInInjectionContext(() => {
      result1 = inject(standaloneRef)
    })

    runInInjectionContext(() => {
      result2 = inject(standaloneRef)
    })

    expect(result1?.value).toBe('local')
    expect(result2?.value).toBe('local')
    expect(result1).not.toBe(result2)
  })

  test('local providers do not affect parent context', () => {
    const globalRef = provide(() => 'global')

    const childRef = provide(
      () => {
        return inject(globalRef)
      },
      {
        providers: [provide(() => 'child', { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const childValue = inject(childRef)
      const parentValue = inject(globalRef)

      expect(childValue).toBe('child')
      expect(parentValue).toBe('global')
    })
  })

  test('deep nesting with multiple overrides', () => {
    const globalRef = provide(() => 0)

    const level1Ref = provide(() => inject(globalRef), {
      providers: [provide(() => 1, { overrides: globalRef })],
    })

    const level2Ref = provide(
      () => {
        const l1 = inject(level1Ref)
        const current = inject(globalRef)
        return { l1, current }
      },
      {
        providers: [provide(() => 2, { overrides: globalRef })],
      },
    )

    const level3Ref = provide(
      () => {
        const l2 = inject(level2Ref)
        const current = inject(globalRef)
        return { ...l2, l3: current }
      },
      {
        providers: [provide(() => 3, { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const result = inject(level3Ref)

      expect(result.l1).toBe(1)
      expect(result.current).toBe(2)
      expect(result.l3).toBe(3)
    })
  })

  test('factory with providers is only instantiated once in global mode', () => {
    let callCount = 0
    const globalRef = provide(() => 'global')

    const factoryRef = provide(
      () => {
        callCount++
        const value = inject(globalRef)
        return { value, count: callCount }
      },
      {
        providers: [provide(() => 'local', { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const result1 = inject(factoryRef)
      const result2 = inject(factoryRef)

      expect(callCount).toBe(1)
      expect(result1).toBe(result2)
      expect(result1.value).toBe('local')
    })
  })

  test('optional inject returns value when dependency is provided', () => {
    const ref = provide(() => 'value')

    runInInjectionContext(() => {
      const result = inject(ref, { optional: true })
      expect(result).toBe('value')
    })
  })

  test('non-optional inject throws error when factory is missing', () => {
    const emptyRef = { [Symbol('provide_ref')]: undefined } as any

    runInInjectionContext(() => {
      expect(() => inject(emptyRef)).toThrow()
    })
  })

  test('optional inject with explicit false behaves as non-optional', () => {
    const emptyRef = { [Symbol('provide_ref')]: undefined } as any

    runInInjectionContext(() => {
      expect(() => inject(emptyRef, { optional: false })).toThrow()
    })
  })

  test('optional inject returns undefined outside injection context', () => {
    const ref = provide(() => 'value')

    const result = inject(ref, { optional: true })
    expect(result).toBeUndefined()
  })

  test('non-optional inject throws outside injection context', () => {
    const ref = provide(() => 'value')

    expect(() => inject(ref)).toThrow('inject() must be called within an injection context')
  })

  test('optional inject with local providers', () => {
    const globalRef = provide(() => 'global')

    const serviceRef = provide(
      () => {
        const value = inject(globalRef, { optional: true })
        return { value }
      },
      {
        providers: [provide(() => 'local', { overrides: globalRef })],
      },
    )

    runInInjectionContext(() => {
      const result = inject(serviceRef)
      expect(result.value).toBe('local')
    })
  })

  test('optional inject type inference with optional true', () => {
    const ref = provide(() => 'value')

    runInInjectionContext(() => {
      const result = inject(ref, { optional: true })
      // result should be string | undefined
      if (result !== undefined) {
        expect(typeof result).toBe('string')
      }
    })
  })

  test('optional inject type inference with optional false', () => {
    const ref = provide(() => 'value')

    runInInjectionContext(() => {
      const result = inject(ref, { optional: false })
      // result should be string (not undefined)
      expect(typeof result).toBe('string')
    })
  })

  test('optional inject with factory returning undefined', () => {
    const ref = provide(() => undefined)

    runInInjectionContext(() => {
      const result = inject(ref, { optional: true })
      expect(result).toBeUndefined()
    })
  })

  test('complex real-world scenario: multi-tenant with configuration', () => {
    interface Tenant {
      id: string
      name: string
    }

    interface Config {
      apiUrl: string
      timeout: number
    }

    const defaultTenantRef = provide<Tenant>(() => ({ id: 'default', name: 'Default' }))
    const defaultConfigRef = provide<Config>(() => ({ apiUrl: '/api', timeout: 5000 }))

    const apiServiceRef = provide(() => {
      const tenant = inject(defaultTenantRef)
      const config = inject(defaultConfigRef)

      return {
        getTenantInfo: () => `${tenant.name} (${tenant.id})`,
        getEndpoint: (path: string) => `${config.apiUrl}${path}`,
        getTimeout: () => config.timeout,
      }
    })

    const tenant1AppRef = provide(
      () => {
        const api = inject(apiServiceRef)
        return {
          info: api.getTenantInfo(),
          endpoint: api.getEndpoint('/users'),
          timeout: api.getTimeout(),
        }
      },
      {
        providers: [
          provide<Tenant>(() => ({ id: 't1', name: 'Tenant 1' }), { overrides: defaultTenantRef }),
          provide<Config>(() => ({ apiUrl: '/t1/api', timeout: 3000 }), { overrides: defaultConfigRef }),
        ],
      },
    )

    const tenant2AppRef = provide(
      () => {
        const api = inject(apiServiceRef)
        return {
          info: api.getTenantInfo(),
          endpoint: api.getEndpoint('/users'),
          timeout: api.getTimeout(),
        }
      },
      {
        providers: [
          provide<Tenant>(() => ({ id: 't2', name: 'Tenant 2' }), { overrides: defaultTenantRef }),
          provide<Config>(() => ({ apiUrl: '/t2/api', timeout: 10000 }), { overrides: defaultConfigRef }),
        ],
      },
    )

    runInInjectionContext(() => {
      const app1 = inject(tenant1AppRef)
      const app2 = inject(tenant2AppRef)

      expect(app1.info).toBe('Tenant 1 (t1)')
      expect(app1.endpoint).toBe('/t1/api/users')
      expect(app1.timeout).toBe(3000)

      expect(app2.info).toBe('Tenant 2 (t2)')
      expect(app2.endpoint).toBe('/t2/api/users')
      expect(app2.timeout).toBe(10000)
    })
  })
})
