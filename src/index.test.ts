import { describe, test, expect } from 'bun:test';
import {
  createToken,
  provideToken,
  provideFactory,
  inject,
  runInInjectionContext,
  isInInjectionContext,
  isInjectToken,
  isProvideRef,
} from './index';

describe('IoC Container', () => {
  test('createToken with description', () => {
    const token = createToken<string>('string token');
    expect(token.desc).toBe('string token');
  });

  test('createToken without description', () => {
    const token = createToken<number>();
    expect(token.desc).toBeUndefined();
  });

  test('provideToken and inject', () => {
    const token = createToken<string>();
    const ref = provideToken(token, 'test value');

    runInInjectionContext(() => {
      const value = inject(ref);
      expect(value).toBe('test value');
    });
  });

  test('provideFactory and inject', () => {
    const ref = provideFactory(() => ({ id: 1, name: 'John' }));

    runInInjectionContext(() => {
      const value = inject(ref);
      expect(value).toEqual({ id: 1, name: 'John' });
    });
  });

  test('isInInjectionContext returns false outside context', () => {
    expect(isInInjectionContext()).toBe(false);
  });

  test('isInInjectionContext returns true inside context', () => {
    runInInjectionContext(() => {
      expect(isInInjectionContext()).toBe(true);
    });
  });

  test('inject throws error outside injection context', () => {
    const ref = provideToken(createToken<string>(), 'value');
    expect(() => inject(ref)).toThrow('inject() must be called within an injection context');
  });

  test('global mode shares instances across contexts', () => {
    let counter = 0;
    const ref = provideFactory(() => ({ id: ++counter }));

    let value1, value2;
    runInInjectionContext(() => {
      value1 = inject(ref);
    });

    runInInjectionContext(() => {
      value2 = inject(ref);
    });

    expect(value1).toBe(value2);
    expect(counter).toBe(1);
  });

  test('standalone mode creates new instances per context', () => {
    let counter = 0;
    const ref = provideFactory(() => ({ id: ++counter }), { mode: 'standalone' });

    let value1, value2;
    runInInjectionContext(() => {
      value1 = inject(ref);
    });

    runInInjectionContext(() => {
      value2 = inject(ref);
    });

    expect(value1).not.toBe(value2);
    expect(counter).toBe(2);
  });

  test('mode can be explicitly set to global', () => {
    let counter = 0;
    const ref = provideFactory(() => ({ id: ++counter }), { mode: 'global' });

    let value1, value2;
    runInInjectionContext(() => {
      value1 = inject(ref);
    });

    runInInjectionContext(() => {
      value2 = inject(ref);
    });

    expect(value1).toBe(value2);
    expect(counter).toBe(1);
  });

  test('mode can be explicitly set to standalone', () => {
    let counter = 0;
    const ref = provideFactory(() => ({ id: ++counter }), { mode: 'standalone' });

    let value1, value2;
    runInInjectionContext(() => {
      value1 = inject(ref);
    });

    runInInjectionContext(() => {
      value2 = inject(ref);
    });

    expect(value1).not.toBe(value2);
    expect(counter).toBe(2);
  });

  test('type inference works correctly', () => {
    const stringToken = createToken<string>('default');
    const stringRef = provideToken(stringToken, 'value');

    runInInjectionContext(() => {
      const value: string = inject(stringRef);
      expect(typeof value).toBe('string');
    });

    const objectRef = provideFactory(() => ({ id: 1, name: 'test' }));

    runInInjectionContext(() => {
      const value: { id: number; name: string } = inject(objectRef);
      expect(value.id).toBe(1);
      expect(value.name).toBe('test');
    });
  });

  test('complex usage scenario from dev.ts', () => {
    const tk = createToken<string>('hello');
    const ref1 = provideToken(tk, 'world');
    const ref2 = provideFactory(() => ({ id: 1, name: 'John' }));

    function test() {
      const value = inject(ref1);
      const value2 = inject(ref2);
      expect(value).toBe('world');
      expect(value2).toEqual({ id: 1, name: 'John' });
      return { value, value2 };
    }

    const result = runInInjectionContext(test);
    expect(result.value).toBe('world');
    expect(result.value2).toEqual({ id: 1, name: 'John' });
  });

  test('nested contexts work correctly', () => {
    const ref = provideFactory(() => ({ id: Math.random() }), { mode: 'standalone' });

    runInInjectionContext(() => {
      const value1 = inject(ref);

      runInInjectionContext(() => {
        const value2 = inject(ref);
        expect(value1).not.toBe(value2);
      });
    });
  });

  test('multiple injects in same context return same instance', () => {
    const ref = provideFactory(() => ({ id: Math.random() }));

    runInInjectionContext(() => {
      const value1 = inject(ref);
      const value2 = inject(ref);
      expect(value1).toBe(value2);
    });
  });

  test('isInjectToken correctly identifies Token', () => {
    const token = createToken<string>('test');
    expect(isInjectToken(token)).toBe(true);
    expect(isInjectToken({})).toBe(false);
    expect(isInjectToken(null)).toBe(false);
    expect(isInjectToken(undefined)).toBe(false);
    expect(isInjectToken('string')).toBe(false);
    expect(isInjectToken(123)).toBe(false);
  });

  test('isProvideRef correctly identifies Ref', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    expect(isProvideRef(ref)).toBe(true);
    
    const ref2 = provideFactory(() => 'value');
    expect(isProvideRef(ref2)).toBe(true);
    
    expect(isProvideRef({})).toBe(false);
    expect(isProvideRef(null)).toBe(false);
    expect(isProvideRef(undefined)).toBe(false);
    expect(isProvideRef('string')).toBe(false);
    expect(isProvideRef(123)).toBe(false);
  });

  test('isInjectToken and isProvideRef distinguish between Token and Ref', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    expect(isInjectToken(token)).toBe(true);
    expect(isProvideRef(token)).toBe(false);
    
    expect(isProvideRef(ref)).toBe(true);
    expect(isInjectToken(ref)).toBe(false);
  });
});

describe('IoC Container - Advanced Scenarios', () => {
  test('inject with different primitive types', () => {
    const stringRef = provideToken(createToken<string>(), 'hello');
    const numberRef = provideToken(createToken<number>(), 42);
    const booleanRef = provideToken(createToken<boolean>(), true);

    runInInjectionContext(() => {
      expect(inject(stringRef)).toBe('hello');
      expect(inject(numberRef)).toBe(42);
      expect(inject(booleanRef)).toBe(true);
    });
  });

  test('inject with null values', () => {
    const nullRef = provideToken(createToken<null>(), null);

    runInInjectionContext(() => {
      expect(inject(nullRef)).toBeNull();
    });
  });

  test('inject with undefined from factory', () => {
    const undefinedRef = provideFactory(() => undefined);

    runInInjectionContext(() => {
      expect(inject(undefinedRef)).toBeUndefined();
    });
  });

  test('inject with array type', () => {
    const arrayRef = provideFactory(() => [1, 2, 3, 4, 5]);

    runInInjectionContext(() => {
      const arr = inject(arrayRef);
      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(Array.isArray(arr)).toBe(true);
    });
  });

  test('inject with function type', () => {
    const fnRef = provideFactory(() => (x: number) => x * 2);

    runInInjectionContext(() => {
      const fn = inject(fnRef);
      expect(fn(5)).toBe(10);
      expect(typeof fn).toBe('function');
    });
  });

  test('inject with class instance', () => {
    class TestClass {
      constructor(public name: string, public id: number) {}
      greet() {
        return `Hello, ${this.name}`;
      }
    }

    const classRef = provideFactory(() => new TestClass('Alice', 1));

    runInInjectionContext(() => {
      const instance = inject(classRef);
      expect(instance.name).toBe('Alice');
      expect(instance.id).toBe(1);
      expect(instance.greet()).toBe('Hello, Alice');
      expect(instance instanceof TestClass).toBe(true);
    });
  });

  test('inject with nested dependencies', () => {
    const configRef = provideToken(createToken<{ apiUrl: string }>(), { apiUrl: 'https://api.example.com' });
    const serviceRef = provideFactory(() => {
      return runInInjectionContext(() => {
        const config = inject(configRef);
        return {
          config,
          fetch: (endpoint: string) => `${config.apiUrl}${endpoint}`,
        };
      });
    });

    runInInjectionContext(() => {
      const service = inject(serviceRef);
      expect(service.config.apiUrl).toBe('https://api.example.com');
      expect(service.fetch('/users')).toBe('https://api.example.com/users');
    });
  });

  test('factory function is only called once in global mode', () => {
    let callCount = 0;
    const ref = provideFactory(() => {
      callCount++;
      return { id: callCount };
    });

    runInInjectionContext(() => {
      inject(ref);
      inject(ref);
      inject(ref);
    });

    runInInjectionContext(() => {
      inject(ref);
      inject(ref);
    });

    expect(callCount).toBe(1);
  });

  test('factory function is called once per context in standalone mode', () => {
    let callCount = 0;
    const ref = provideFactory(() => {
      callCount++;
      return { id: callCount };
    }, { mode: 'standalone' });

    runInInjectionContext(() => {
      inject(ref);
      inject(ref);
      inject(ref);
    });

    runInInjectionContext(() => {
      inject(ref);
      inject(ref);
    });

    expect(callCount).toBe(2);
  });

  test('multiple refs for the same token value', () => {
    const token = createToken<string>('default');
    const ref1 = provideToken(token, 'value1');
    const ref2 = provideToken(token, 'value2');

    runInInjectionContext(() => {
      expect(inject(ref1)).toBe('value1');
      expect(inject(ref2)).toBe('value2');
    });
  });

  test('deeply nested contexts maintain isolation in standalone mode', () => {
    const ref = provideFactory(() => ({ id: Math.random() }), { mode: 'standalone' });
    const results: number[] = [];

    runInInjectionContext(() => {
      const val1 = inject(ref);
      results.push(val1.id);

      runInInjectionContext(() => {
        const val2 = inject(ref);
        results.push(val2.id);

        runInInjectionContext(() => {
          const val3 = inject(ref);
          results.push(val3.id);
        });
      });
    });

    // All three values should be different
    expect(new Set(results).size).toBe(3);
  });

  test('context restoration after function execution', () => {
    expect(isInInjectionContext()).toBe(false);

    runInInjectionContext(() => {
      expect(isInInjectionContext()).toBe(true);
    });

    expect(isInInjectionContext()).toBe(false);
  });

  test('context restoration after function throws error', () => {
    expect(isInInjectionContext()).toBe(false);

    try {
      runInInjectionContext(() => {
        expect(isInInjectionContext()).toBe(true);
        throw new Error('Test error');
      });
    } catch (e) {
      // Expected error
    }

    expect(isInInjectionContext()).toBe(false);
  });

  test('return value from runInInjectionContext', () => {
    const result = runInInjectionContext(() => {
      return 42;
    });

    expect(result).toBe(42);

    const objectResult = runInInjectionContext(() => {
      return { success: true, data: 'test' };
    });

    expect(objectResult).toEqual({ success: true, data: 'test' });
  });

  test('complex object with methods', () => {
    interface Counter {
      value: number;
      increment(): void;
      decrement(): void;
      getValue(): number;
    }

    const counterRef = provideFactory<Counter>(() => {
      let value = 0;
      return {
        value,
        increment() {
          this.value++;
        },
        decrement() {
          this.value--;
        },
        getValue() {
          return this.value;
        },
      };
    });

    runInInjectionContext(() => {
      const counter1 = inject(counterRef);
      const counter2 = inject(counterRef);

      counter1.increment();
      counter1.increment();

      expect(counter1.getValue()).toBe(2);
      expect(counter2.getValue()).toBe(2);
      expect(counter1).toBe(counter2);
    });
  });

  test('standalone instances are isolated within same context', () => {
    const ref = provideFactory(() => ({ id: Math.random() }), { mode: 'standalone' });

    runInInjectionContext(() => {
      const val1 = inject(ref);
      const val2 = inject(ref);

      expect(val1).toBe(val2);
      expect(val1.id).toBe(val2.id);
    });
  });

  test('mixing global and standalone refs', () => {
    let globalCounter = 0;
    let standaloneCounter = 0;

    const globalRef = provideFactory(() => ({ id: ++globalCounter }), { mode: 'global' });
    const standaloneRef = provideFactory(() => ({ id: ++standaloneCounter }), { mode: 'standalone' });

    runInInjectionContext(() => {
      inject(globalRef);
      inject(standaloneRef);
    });

    runInInjectionContext(() => {
      inject(globalRef);
      inject(standaloneRef);
    });

    expect(globalCounter).toBe(1);
    expect(standaloneCounter).toBe(2);
  });

  test('inject with Map and Set types', () => {
    const mapRef = provideFactory(() => {
      const map = new Map<string, number>();
      map.set('a', 1);
      map.set('b', 2);
      return map;
    });

    const setRef = provideFactory(() => {
      const set = new Set<number>();
      set.add(1);
      set.add(2);
      set.add(3);
      return set;
    });

    runInInjectionContext(() => {
      const map = inject(mapRef);
      const set = inject(setRef);

      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.size).toBe(3);
    });
  });

  test('inject with Date and RegExp types', () => {
    const dateRef = provideFactory(() => new Date('2024-01-01'));
    const regexRef = provideFactory(() => /test/gi);

    runInInjectionContext(() => {
      const date = inject(dateRef);
      const regex = inject(regexRef);

      expect(date instanceof Date).toBe(true);
      expect(date.getFullYear()).toBe(2024);
      expect(regex instanceof RegExp).toBe(true);
      expect(regex.test('TEST')).toBe(true);
    });
  });

  test('inject with Promise type', () => {
    const promiseRef = provideFactory(() => Promise.resolve(42));

    runInInjectionContext(async () => {
      const promise = inject(promiseRef);
      const value = await promise;
      expect(value).toBe(42);
    });
  });

  test('multiple tokens with same description', () => {
    const token1 = createToken<string>('token desc');
    const token2 = createToken<string>('token desc');

    expect(token1).not.toBe(token2);
    expect(token1.desc).toBe(token2.desc);
  });

  test('large number of dependencies', () => {
    const refs = Array.from({ length: 100 }, (_, i) => 
      provideFactory(() => ({ id: i, value: `value-${i}` }))
    );

    runInInjectionContext(() => {
      refs.forEach((ref, i) => {
        const value = inject(ref);
        expect(value.id).toBe(i);
        expect(value.value).toBe(`value-${i}`);
      });
    });
  });

  test('inject with Symbol keys in object', () => {
    const sym = Symbol('test');
    const ref = provideFactory(() => ({
      [sym]: 'symbol value',
      normal: 'normal value',
    }));

    runInInjectionContext(() => {
      const obj = inject(ref);
      expect(obj[sym]).toBe('symbol value');
      expect(obj.normal).toBe('normal value');
    });
  });

  test('type guard with arrays', () => {
    const stringToken = createToken<string>('string desc');
    const numberToken = createToken<number>('number desc');
    const booleanToken = createToken<boolean>('boolean desc');
    
    const tokens = [stringToken, numberToken, booleanToken];
    const refs = [
      provideToken(stringToken, 'a'),
      provideToken(numberToken, 1),
      provideToken(booleanToken, true),
    ];

    tokens.forEach(token => {
      expect(isInjectToken(token)).toBe(true);
    });

    refs.forEach(ref => {
      expect(isProvideRef(ref)).toBe(true);
    });
  });

  test('nested injection context with different refs', () => {
    const ref1 = provideFactory(() => ({ level: 1 }), { mode: 'standalone' });
    const ref2 = provideFactory(() => ({ level: 2 }), { mode: 'standalone' });

    runInInjectionContext(() => {
      const val1 = inject(ref1);
      expect(val1.level).toBe(1);

      runInInjectionContext(() => {
        const val2 = inject(ref2);
        expect(val2.level).toBe(2);

        const val1Inner = inject(ref1);
        expect(val1Inner).not.toBe(val1);
        expect(val1Inner.level).toBe(1);
      });
    });
  });

  test('factory function with side effects', () => {
    const sideEffects: string[] = [];
    const ref = provideFactory(() => {
      sideEffects.push('created');
      return { value: 'test' };
    });

    runInInjectionContext(() => {
      inject(ref);
      inject(ref);
      inject(ref);
    });

    expect(sideEffects).toEqual(['created']);
  });

  test('token without description', () => {
    const token = createToken<string>();
    // Token created without description
    expect(token.desc).toBeUndefined();
  });

  test('complex generic types', () => {
    interface GenericContainer<T> {
      value: T;
      getValue(): T;
    }

    const stringContainerRef = provideFactory<GenericContainer<string>>(() => ({
      value: 'test',
      getValue() {
        return this.value;
      },
    }));

    const numberContainerRef = provideFactory<GenericContainer<number>>(() => ({
      value: 42,
      getValue() {
        return this.value;
      },
    }));

    runInInjectionContext(() => {
      const strContainer = inject(stringContainerRef);
      const numContainer = inject(numberContainerRef);

      expect(strContainer.getValue()).toBe('test');
      expect(numContainer.getValue()).toBe(42);
    });
  });
});

describe('Hierarchical Dependency Injection', () => {
  test('local providers override global providers', () => {
    const token = createToken<string>('test token');
    const globalRef = provideToken(token, 'global value');
    
    const serviceWithLocalProviderRef = provideFactory(
      () => {
        const value = inject(globalRef);
        return { value };
      },
      {
        providers: [provideToken(token, 'local value')],
      }
    );
    
    runInInjectionContext(() => {
      const globalService = inject(globalRef);
      const localService = inject(serviceWithLocalProviderRef);
      
      expect(globalService).toBe('global value');
      expect(localService.value).toBe('local value');
    });
  });
  
  test('nested providers create proper hierarchy', () => {
    const configToken = createToken<{ level: number }>('config');
    const configRef = provideToken(configToken, { level: 1 });
    
    const level2Ref = provideFactory(
      () => {
        const config = inject(configRef);
        return { ...config, source: 'level2' };
      },
      {
        providers: [provideToken(configToken, { level: 2 })],
      }
    );
    
    const level3Ref = provideFactory(
      () => {
        const config = inject(configRef);
        const level2 = inject(level2Ref);
        return { level: config.level, level2: level2.level };
      },
      {
        providers: [provideToken(configToken, { level: 3 })],
      }
    );
    
    runInInjectionContext(() => {
      const result = inject(level3Ref);
      
      expect(result.level).toBe(3);
      expect(result.level2).toBe(2);
    });
  });
  
  test('local providers are isolated per factory', () => {
    const token = createToken<number>('counter');
    const globalRef = provideToken(token, 0);
    
    const factory1Ref = provideFactory(
      () => {
        return inject(globalRef);
      },
      {
        providers: [provideToken(token, 100)],
      }
    );
    
    const factory2Ref = provideFactory(
      () => {
        return inject(globalRef);
      },
      {
        providers: [provideToken(token, 200)],
      }
    );
    
    runInInjectionContext(() => {
      const global = inject(globalRef);
      const value1 = inject(factory1Ref);
      const value2 = inject(factory2Ref);
      
      expect(global).toBe(0);
      expect(value1).toBe(100);
      expect(value2).toBe(200);
    });
  });
  
  test('dependencies in child context are cached separately', () => {
    let callCount = 0;
    const token = createToken<string>('test');
    const globalRef = provideToken(token, 'value');
    
    const dependentRef = provideFactory(() => {
      callCount++;
      const value = inject(globalRef);
      return { value, callCount };
    });
    
    const parentRef = provideFactory(
      () => {
        const dep1 = inject(dependentRef);
        const dep2 = inject(dependentRef);
        return { dep1, dep2 };
      },
      {
        providers: [provideToken(token, 'local')],
      }
    );
    
    runInInjectionContext(() => {
      const result = inject(parentRef);
      
      expect(result.dep1.callCount).toBe(1);
      expect(result.dep2.callCount).toBe(1);
      expect(result.dep1).toBe(result.dep2);
    });
  });
  
  test('multiple local providers in same factory', () => {
    const token1 = createToken<string>('token1');
    const token2 = createToken<number>('token2');
    
    const ref1 = provideToken(token1, 'global1');
    const ref2 = provideToken(token2, 100);
    
    const serviceRef = provideFactory(
      () => {
        const val1 = inject(ref1);
        const val2 = inject(ref2);
        return { val1, val2 };
      },
      {
        providers: [
          provideToken(token1, 'local1'),
          provideToken(token2, 200),
        ],
      }
    );
    
    runInInjectionContext(() => {
      const result = inject(serviceRef);
      
      expect(result.val1).toBe('local1');
      expect(result.val2).toBe(200);
    });
  });
  
  test('standalone mode works with local providers', () => {
    const token = createToken<string>('test');
    const globalRef = provideToken(token, 'global');
    
    const standaloneRef = provideFactory(
      () => {
        const value = inject(globalRef);
        return { value };
      },
      {
        mode: 'standalone',
        providers: [provideToken(token, 'local')],
      }
    );
    
    let result1, result2;
    
    runInInjectionContext(() => {
      result1 = inject(standaloneRef);
    });
    
    runInInjectionContext(() => {
      result2 = inject(standaloneRef);
    });
    
    expect(result1.value).toBe('local');
    expect(result2.value).toBe('local');
    expect(result1).not.toBe(result2);
  });
  
  test('local providers do not affect parent context', () => {
    const token = createToken<string>('test');
    const globalRef = provideToken(token, 'global');
    
    const childRef = provideFactory(
      () => {
        return inject(globalRef);
      },
      {
        providers: [provideToken(token, 'child')],
      }
    );
    
    runInInjectionContext(() => {
      const childValue = inject(childRef);
      const parentValue = inject(globalRef);
      
      expect(childValue).toBe('child');
      expect(parentValue).toBe('global');
    });
  });
  
  test('deep nesting with multiple overrides', () => {
    const token = createToken<number>('level');
    const globalRef = provideToken(token, 0);
    
    const level1Ref = provideFactory(
      () => inject(globalRef),
      {
        providers: [provideToken(token, 1)],
      }
    );
    
    const level2Ref = provideFactory(
      () => {
        const l1 = inject(level1Ref);
        const current = inject(globalRef);
        return { l1, current };
      },
      {
        providers: [provideToken(token, 2)],
      }
    );
    
    const level3Ref = provideFactory(
      () => {
        const l2 = inject(level2Ref);
        const current = inject(globalRef);
        return { ...l2, l3: current };
      },
      {
        providers: [provideToken(token, 3)],
      }
    );
    
    runInInjectionContext(() => {
      const result = inject(level3Ref);
      
      expect(result.l1).toBe(1);
      expect(result.current).toBe(2);
      expect(result.l3).toBe(3);
    });
  });
  
  test('factory with providers is only instantiated once in global mode', () => {
    let callCount = 0;
    const token = createToken<string>('test');
    const globalRef = provideToken(token, 'global');
    
    const factoryRef = provideFactory(
      () => {
        callCount++;
        const value = inject(globalRef);
        return { value, count: callCount };
      },
      {
        providers: [provideToken(token, 'local')],
      }
    );
    
    runInInjectionContext(() => {
      const result1 = inject(factoryRef);
      const result2 = inject(factoryRef);
      
      expect(callCount).toBe(1);
      expect(result1).toBe(result2);
      expect(result1.value).toBe('local');
    });
  });
  
  test('optional inject returns undefined when dependency not provided', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    // 创建一个没有提供实际值的 ref（用于测试）
    const emptyRef = { [Symbol('provide_ref')]: undefined } as any;
    
    runInInjectionContext(() => {
      const result = inject(emptyRef, { optional: true });
      expect(result).toBeUndefined();
    });
  });
  
  test('optional inject returns value when dependency is provided', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    runInInjectionContext(() => {
      const result = inject(ref, { optional: true });
      expect(result).toBe('value');
    });
  });
  
  test('non-optional inject throws error when dependency not provided', () => {
    const emptyRef = { [Symbol('provide_ref')]: undefined } as any;
    
    runInInjectionContext(() => {
      expect(() => inject(emptyRef)).toThrow('No value or factory provided for injection');
    });
  });
  
  test('optional inject with explicit false behaves as non-optional', () => {
    const emptyRef = { [Symbol('provide_ref')]: undefined } as any;
    
    runInInjectionContext(() => {
      expect(() => inject(emptyRef, { optional: false })).toThrow('No value or factory provided for injection');
    });
  });
  
  test('optional inject returns undefined outside injection context', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    const result = inject(ref, { optional: true });
    expect(result).toBeUndefined();
  });
  
  test('non-optional inject throws outside injection context', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    expect(() => inject(ref)).toThrow('inject() must be called within an injection context');
  });
  
  test('optional inject with local providers', () => {
    const token = createToken<string>('test');
    const globalRef = provideToken(token, 'global');
    
    const serviceRef = provideFactory(
      () => {
        const value = inject(globalRef, { optional: true });
        return { value };
      },
      {
        providers: [provideToken(token, 'local')],
      }
    );
    
    runInInjectionContext(() => {
      const result = inject(serviceRef);
      expect(result.value).toBe('local');
    });
  });
  
  test('optional inject type inference with optional true', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    runInInjectionContext(() => {
      const result = inject(ref, { optional: true });
      // result should be string | undefined
      if (result !== undefined) {
        expect(typeof result).toBe('string');
      }
    });
  });
  
  test('optional inject type inference with optional false', () => {
    const token = createToken<string>('test');
    const ref = provideToken(token, 'value');
    
    runInInjectionContext(() => {
      const result = inject(ref, { optional: false });
      // result should be string (not undefined)
      expect(typeof result).toBe('string');
    });
  });
  
  test('optional inject with factory returning undefined', () => {
    const ref = provideFactory(() => undefined);
    
    runInInjectionContext(() => {
      const result = inject(ref, { optional: true });
      expect(result).toBeUndefined();
    });
  });

  test('complex real-world scenario: multi-tenant with configuration', () => {
    interface Tenant {
      id: string;
      name: string;
    }
    
    interface Config {
      apiUrl: string;
      timeout: number;
    }
    
    const TENANT_TOKEN = createToken<Tenant>('tenant');
    const CONFIG_TOKEN = createToken<Config>('config');
    
    const defaultTenantRef = provideToken(TENANT_TOKEN, { id: 'default', name: 'Default' });
    const defaultConfigRef = provideToken(CONFIG_TOKEN, { apiUrl: '/api', timeout: 5000 });
    
    const apiServiceRef = provideFactory(() => {
      const tenant = inject(defaultTenantRef);
      const config = inject(defaultConfigRef);
      
      return {
        getTenantInfo: () => `${tenant.name} (${tenant.id})`,
        getEndpoint: (path: string) => `${config.apiUrl}${path}`,
        getTimeout: () => config.timeout,
      };
    });
    
    const tenant1AppRef = provideFactory(
      () => {
        const api = inject(apiServiceRef);
        return {
          info: api.getTenantInfo(),
          endpoint: api.getEndpoint('/users'),
          timeout: api.getTimeout(),
        };
      },
      {
        providers: [
          provideToken(TENANT_TOKEN, { id: 't1', name: 'Tenant 1' }),
          provideToken(CONFIG_TOKEN, { apiUrl: '/t1/api', timeout: 3000 }),
        ],
      }
    );
    
    const tenant2AppRef = provideFactory(
      () => {
        const api = inject(apiServiceRef);
        return {
          info: api.getTenantInfo(),
          endpoint: api.getEndpoint('/users'),
          timeout: api.getTimeout(),
        };
      },
      {
        providers: [
          provideToken(TENANT_TOKEN, { id: 't2', name: 'Tenant 2' }),
          provideToken(CONFIG_TOKEN, { apiUrl: '/t2/api', timeout: 10000 }),
        ],
      }
    );
    
    runInInjectionContext(() => {
      const app1 = inject(tenant1AppRef);
      const app2 = inject(tenant2AppRef);
      
      expect(app1.info).toBe('Tenant 1 (t1)');
      expect(app1.endpoint).toBe('/t1/api/users');
      expect(app1.timeout).toBe(3000);
      
      expect(app2.info).toBe('Tenant 2 (t2)');
      expect(app2.endpoint).toBe('/t2/api/users');
      expect(app2.timeout).toBe(10000);
    });
  });
});
