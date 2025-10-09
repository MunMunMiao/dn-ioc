# dn-ioc

A lightweight, type-safe Inversion of Control (IoC) dependency injection library for TypeScript, built with a functional programming paradigm.

## Features

- 🎯 **Type-Safe**: Full TypeScript support with excellent type inference
- 🪶 **Lightweight**: Minimal codebase with zero dependencies
- 🔧 **Functional**: Pure functional API design
- 🏗️ **Hierarchical**: Support for hierarchical dependency injection
- 🔄 **Flexible**: Global and standalone instance modes
- ✨ **Optional Dependencies**: Graceful handling of optional dependencies
- 🎪 **Context-Based**: Runtime injection contexts for scope management

## Installation

```bash
npm install dn-ioc
# or
yarn add dn-ioc
# or
pnpm add dn-ioc
# or
bun add dn-ioc
```

## Core Concepts

### Token

A **Token** is a type-safe identifier for a dependency. It carries the type information without requiring a class or constructor.

```typescript
import { createToken } from 'dn-ioc';

const API_URL_TOKEN = createToken<string>('API URL');
const USER_SERVICE_TOKEN = createToken<UserService>('User Service');
```

### Ref

A **Ref** (Reference) represents a provided dependency. It's created by either:
- `provideToken()` - for direct values
- `provideFactory()` - for lazy-initialized values

### Injection Context

An **Injection Context** is a runtime scope where dependencies are resolved and cached. Use `runInInjectionContext()` to establish a context.

## Basic Usage

### Creating Tokens

```typescript
import { createToken } from 'dn-ioc';

// Token with description (recommended for debugging)
const ConfigToken = createToken<{ apiUrl: string }>('App Config');

// Token without description
const CounterToken = createToken<number>();
```

### Providing Values

#### Direct Values with `provideToken`

```typescript
import { provideToken } from 'dn-ioc';

const configRef = provideToken(ConfigToken, {
  apiUrl: 'https://api.example.com'
});
```

#### Factory Functions with `provideFactory`

```typescript
import { provideFactory } from 'dn-ioc';

const serviceRef = provideFactory(() => {
  return {
    fetchUser: (id: string) => fetch(`/users/${id}`)
  };
});
```

### Injecting Dependencies

```typescript
import { inject, runInInjectionContext } from 'dn-ioc';

runInInjectionContext(() => {
  const config = inject(configRef);
  const service = inject(serviceRef);
  
  console.log(config.apiUrl); // https://api.example.com
  service.fetchUser('123');
});
```

### Complete Example

```typescript
import {
  createToken,
  provideToken,
  provideFactory,
  inject,
  runInInjectionContext
} from 'dn-ioc';

// Define tokens
const API_URL = createToken<string>('API URL');
const AUTH_TOKEN = createToken<string>('Auth Token');

// Provide values
const apiUrlRef = provideToken(API_URL, 'https://api.example.com');
const authTokenRef = provideToken(AUTH_TOKEN, 'secret-token');

// Create a service that depends on other values
const apiServiceRef = provideFactory(() => {
  const apiUrl = inject(apiUrlRef);
  const authToken = inject(authTokenRef);
  
  return {
    fetchData: async (endpoint: string) => {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      return response.json();
    }
  };
});

// Use the service
runInInjectionContext(async () => {
  const apiService = inject(apiServiceRef);
  const data = await apiService.fetchData('/users');
  console.log(data);
});
```

## Advanced Usage

### Global vs Standalone Modes

By default, dependencies are provided in **global mode**, meaning they are singletons shared across all injection contexts.

#### Global Mode (Default)

```typescript
const counterRef = provideFactory(() => ({ count: 0 }));
// or explicitly
const counterRef = provideFactory(() => ({ count: 0 }), { mode: 'global' });

let counter1, counter2;

runInInjectionContext(() => {
  counter1 = inject(counterRef);
  counter1.count = 5;
});

runInInjectionContext(() => {
  counter2 = inject(counterRef);
  console.log(counter2.count); // 5 - same instance!
});

console.log(counter1 === counter2); // true
```

#### Standalone Mode

In **standalone mode**, each injection context gets its own instance.

```typescript
const counterRef = provideFactory(
  () => ({ count: 0 }),
  { mode: 'standalone' }
);

let counter1, counter2;

runInInjectionContext(() => {
  counter1 = inject(counterRef);
  counter1.count = 5;
});

runInInjectionContext(() => {
  counter2 = inject(counterRef);
  console.log(counter2.count); // 0 - different instance!
});

console.log(counter1 === counter2); // false
```

**Use Cases:**
- **Global mode**: Configuration, singleton services, shared state
- **Standalone mode**: Request-scoped data, isolated test environments, per-user state

### Hierarchical Dependency Injection

Inspired by Angular's hierarchical DI, you can provide local overrides within a factory function using the `providers` option.

#### Basic Override

```typescript
const CONFIG_TOKEN = createToken<string>('Config');
const globalConfigRef = provideToken(CONFIG_TOKEN, 'global-value');

const serviceRef = provideFactory(
  () => {
    const config = inject(globalConfigRef);
    return { config };
  },
  {
    providers: [
      provideToken(CONFIG_TOKEN, 'local-value')
    ]
  }
);

runInInjectionContext(() => {
  const globalConfig = inject(globalConfigRef); // 'global-value'
  const service = inject(serviceRef);
  console.log(service.config); // 'local-value'
});
```

#### Multi-Level Hierarchy

```typescript
const LEVEL_TOKEN = createToken<number>('Level');
const rootRef = provideToken(LEVEL_TOKEN, 0);

const level1Ref = provideFactory(
  () => inject(rootRef),
  { providers: [provideToken(LEVEL_TOKEN, 1)] }
);

const level2Ref = provideFactory(
  () => {
    const l1 = inject(level1Ref);
    const current = inject(rootRef);
    return { l1, current };
  },
  { providers: [provideToken(LEVEL_TOKEN, 2)] }
);

const level3Ref = provideFactory(
  () => {
    const l2 = inject(level2Ref);
    const current = inject(rootRef);
    return { ...l2, l3: current };
  },
  { providers: [provideToken(LEVEL_TOKEN, 3)] }
);

runInInjectionContext(() => {
  const result = inject(level3Ref);
  console.log(result.l1);      // 1
  console.log(result.current); // 2
  console.log(result.l3);      // 3
});
```

#### Real-World Example: Multi-Tenant Application

```typescript
interface Tenant {
  id: string;
  name: string;
}

interface Config {
  apiUrl: string;
  timeout: number;
}

const TENANT_TOKEN = createToken<Tenant>('Tenant');
const CONFIG_TOKEN = createToken<Config>('Config');

// Global defaults
const defaultTenantRef = provideToken(TENANT_TOKEN, {
  id: 'default',
  name: 'Default Tenant'
});
const defaultConfigRef = provideToken(CONFIG_TOKEN, {
  apiUrl: '/api',
  timeout: 5000
});

// Shared service that uses tenant and config
const apiServiceRef = provideFactory(() => {
  const tenant = inject(defaultTenantRef);
  const config = inject(defaultConfigRef);
  
  return {
    getTenantInfo: () => `${tenant.name} (${tenant.id})`,
    getEndpoint: (path: string) => `${config.apiUrl}${path}`,
    getTimeout: () => config.timeout
  };
});

// Tenant 1 with custom config
const tenant1AppRef = provideFactory(
  () => {
    const api = inject(apiServiceRef);
    return {
      info: api.getTenantInfo(),
      endpoint: api.getEndpoint('/users')
    };
  },
  {
    providers: [
      provideToken(TENANT_TOKEN, { id: 't1', name: 'Tenant 1' }),
      provideToken(CONFIG_TOKEN, { apiUrl: '/t1/api', timeout: 3000 })
    ]
  }
);

// Tenant 2 with custom config
const tenant2AppRef = provideFactory(
  () => {
    const api = inject(apiServiceRef);
    return {
      info: api.getTenantInfo(),
      endpoint: api.getEndpoint('/users')
    };
  },
  {
    providers: [
      provideToken(TENANT_TOKEN, { id: 't2', name: 'Tenant 2' }),
      provideToken(CONFIG_TOKEN, { apiUrl: '/t2/api', timeout: 10000 })
    ]
  }
);

runInInjectionContext(() => {
  const app1 = inject(tenant1AppRef);
  console.log(app1.info);     // Tenant 1 (t1)
  console.log(app1.endpoint); // /t1/api/users
  
  const app2 = inject(tenant2AppRef);
  console.log(app2.info);     // Tenant 2 (t2)
  console.log(app2.endpoint); // /t2/api/users
});
```

### Optional Dependencies

Sometimes you want to gracefully handle missing dependencies instead of throwing errors. Use the `optional` flag for this.

#### Basic Optional Injection

```typescript
const LOGGER_TOKEN = createToken<Logger>('Logger');
const loggerRef = provideToken(LOGGER_TOKEN, consoleLogger);

const serviceRef = provideFactory(() => {
  // Won't throw if logger is not provided
  const logger = inject(loggerRef, { optional: true });
  
  return {
    doWork: () => {
      logger?.log('Working...');
      return 'Done';
    }
  };
});
```

#### Feature Flags with Optional Dependencies

```typescript
interface AnalyticsService {
  trackEvent(name: string, data?: any): void;
}

const ANALYTICS_TOKEN = createToken<AnalyticsService>('Analytics');

// Only provide analytics in production
const analyticsRef = process.env.NODE_ENV === 'production'
  ? provideToken(ANALYTICS_TOKEN, new GoogleAnalytics())
  : undefined;

const appRef = provideFactory(() => {
  const analytics = inject(ANALYTICS_TOKEN, { optional: true });
  
  return {
    handleClick: () => {
      // Analytics only tracked in production
      analytics?.trackEvent('button_click');
      // Rest of the logic always runs
      console.log('Button clicked');
    }
  };
});
```

#### Graceful Degradation

```typescript
interface CacheService {
  get(key: string): any;
  set(key: string, value: any): void;
}

const CACHE_TOKEN = createToken<CacheService>('Cache');

const dataServiceRef = provideFactory(() => {
  const cache = inject(CACHE_TOKEN, { optional: true });
  
  return {
    fetchData: async (id: string) => {
      // Try cache first if available
      if (cache) {
        const cached = cache.get(id);
        if (cached) return cached;
      }
      
      // Fetch from API
      const data = await fetch(`/api/data/${id}`).then(r => r.json());
      
      // Cache if available
      cache?.set(id, data);
      
      return data;
    }
  };
});

// Works with cache
runInInjectionContext(() => {
  // If CACHE_TOKEN is provided, caching is enabled
  const service = inject(dataServiceRef);
  await service.fetchData('123');
});

// Works without cache
const cacheRef = provideToken(CACHE_TOKEN, new RedisCache());
runInInjectionContext(() => {
  const service = inject(dataServiceRef);
  await service.fetchData('123'); // Uses cache
});
```

#### Type Safety with Optional Injection

```typescript
const TOKEN = createToken<string>('test');
const ref = provideToken(TOKEN, 'value');

runInInjectionContext(() => {
  // Type is string | undefined
  const optional = inject(ref, { optional: true });
  if (optional) {
    console.log(optional.toUpperCase()); // Safe
  }
  
  // Type is string (never undefined)
  const required = inject(ref);
  console.log(required.toUpperCase()); // No check needed
  
  // Explicit non-optional
  const explicit = inject(ref, { optional: false });
  console.log(explicit.toUpperCase()); // No check needed
});
```

### Checking Context State

```typescript
import { isInInjectionContext } from 'dn-ioc';

console.log(isInInjectionContext()); // false

runInInjectionContext(() => {
  console.log(isInInjectionContext()); // true
});

console.log(isInInjectionContext()); // false
```

### Type Guards

```typescript
import { isInjectToken, isProvideRef } from 'dn-ioc';

const token = createToken<string>('test');
const ref = provideToken(token, 'value');

console.log(isInjectToken(token)); // true
console.log(isProvideRef(token));  // false

console.log(isInjectToken(ref));   // false
console.log(isProvideRef(ref));    // true
```

## API Reference

### `createToken<T>(desc?: string): Token<T>`

Creates a type-safe token for identifying a dependency.

**Parameters:**
- `desc` (optional): A description for debugging purposes

**Returns:** A `Token<T>` instance

**Example:**
```typescript
const UserToken = createToken<User>('Current User');
const ConfigToken = createToken<Config>();
```

---

### `provideToken<T>(token: Token<T>, value: T, options?: ProvideOptions): Ref<T>`

Provides a direct value for a token.

**Parameters:**
- `token`: The token to provide a value for
- `value`: The value to provide
- `options` (optional): Provider options
  - `mode`: `'global'` (default) or `'standalone'`
  - `providers`: Local provider overrides

**Returns:** A `Ref<T>` instance

**Example:**
```typescript
const configRef = provideToken(ConfigToken, { apiUrl: '/api' });
```

---

### `provideFactory<T>(factory: () => T, options?: ProvideOptions): Ref<T>`

Provides a lazily-initialized value using a factory function.

**Parameters:**
- `factory`: A function that returns the value
- `options` (optional): Provider options
  - `mode`: `'global'` (default) or `'standalone'`
  - `providers`: Local provider overrides

**Returns:** A `Ref<T>` instance

**Example:**
```typescript
const serviceRef = provideFactory(() => new UserService());
```

---

### `inject<T>(ref: Ref<T>, options?: InjectOptions): T | undefined`

Injects a dependency from the current injection context.

**Parameters:**
- `ref`: The reference to inject
- `options` (optional): Injection options
  - `optional`: If `true`, returns `undefined` instead of throwing when dependency is missing (default: `false`)

**Returns:** The injected value, or `undefined` if optional and not found

**Throws:** Error if called outside an injection context (unless `optional: true`)

**Example:**
```typescript
runInInjectionContext(() => {
  const config = inject(configRef);
  const logger = inject(loggerRef, { optional: true });
});
```

---

### `runInInjectionContext<R>(fn: () => R): R`

Establishes an injection context and runs a function within it.

**Parameters:**
- `fn`: The function to run within the injection context

**Returns:** The return value of the function

**Example:**
```typescript
const result = runInInjectionContext(() => {
  const service = inject(serviceRef);
  return service.getData();
});
```

---

### `isInInjectionContext(): boolean`

Checks if currently within an injection context.

**Returns:** `true` if within a context, `false` otherwise

**Example:**
```typescript
if (isInInjectionContext()) {
  const value = inject(ref);
}
```

---

### `isInjectToken(value: unknown): value is Token<unknown>`

Type guard to check if a value is a Token.

**Parameters:**
- `value`: The value to check

**Returns:** `true` if value is a Token

**Example:**
```typescript
if (isInjectToken(something)) {
  // something is definitely a Token
}
```

---

### `isProvideRef(value: unknown): value is Ref<unknown>`

Type guard to check if a value is a Ref.

**Parameters:**
- `value`: The value to check

**Returns:** `true` if value is a Ref

**Example:**
```typescript
if (isProvideRef(something)) {
  // something is definitely a Ref
}
```

## Best Practices

### 1. Use Descriptive Token Names

```typescript
// Good
const USER_SERVICE = createToken<UserService>('User Service');
const API_CONFIG = createToken<ApiConfig>('API Configuration');

// Avoid
const token1 = createToken<any>();
const t = createToken<SomeService>();
```

### 2. Organize Tokens in a Dedicated File

```typescript
// tokens.ts
export const AUTH_TOKEN = createToken<AuthService>('Auth Service');
export const LOGGER_TOKEN = createToken<Logger>('Logger');
export const CONFIG_TOKEN = createToken<Config>('App Config');
```

### 3. Use Factory Functions for Complex Dependencies

```typescript
// Good - lazy initialization
const dbRef = provideFactory(() => {
  return new Database(process.env.DB_URL);
});

// Avoid - immediate initialization
const db = new Database(process.env.DB_URL);
const dbRef = provideToken(DB_TOKEN, db);
```

### 4. Leverage Type Inference

```typescript
// TypeScript infers the type automatically
const serviceRef = provideFactory(() => ({
  doSomething: () => 'done'
}));

runInInjectionContext(() => {
  const service = inject(serviceRef);
  service.doSomething(); // Fully typed!
});
```

### 5. Use Standalone Mode for Testing

```typescript
// production.ts
const userServiceRef = provideFactory(
  () => new RealUserService(),
  { mode: 'standalone' }
);

// test.ts
const mockUserServiceRef = provideFactory(
  () => new MockUserService(),
  { mode: 'standalone' }
);
```

### 6. Use Optional Dependencies for Non-Critical Features

```typescript
const analyticsRef = provideFactory(() => new Analytics(), {
  mode: 'global'
});

const appRef = provideFactory(() => {
  // Analytics is optional - app works without it
  const analytics = inject(analyticsRef, { optional: true });
  
  return {
    doWork: () => {
      analytics?.track('work_done');
      // Core functionality
    }
  };
});
```

### 7. Combine Hierarchical Injection with Feature Modules

```typescript
// Each feature module can override dependencies
const featureARef = provideFactory(
  () => new FeatureA(inject(sharedServiceRef)),
  {
    providers: [
      provideToken(CONFIG_TOKEN, featureAConfig)
    ]
  }
);

const featureBRef = provideFactory(
  () => new FeatureB(inject(sharedServiceRef)),
  {
    providers: [
      provideToken(CONFIG_TOKEN, featureBConfig)
    ]
  }
);
```

## Common Patterns

### Singleton Services

```typescript
const loggerRef = provideFactory(() => new Logger(), {
  mode: 'global' // Default
});
```

### Request-Scoped Data

```typescript
const requestContextRef = provideFactory(() => ({
  requestId: generateId(),
  timestamp: Date.now()
}), {
  mode: 'standalone'
});
```

### Conditional Dependencies

```typescript
const isDevelopment = process.env.NODE_ENV === 'development';

const loggerRef = isDevelopment
  ? provideFactory(() => new ConsoleLogger())
  : provideFactory(() => new ProductionLogger());
```

### Dependency Composition

```typescript
const dbRef = provideFactory(() => new Database());
const cacheRef = provideFactory(() => new Cache());

const userRepositoryRef = provideFactory(() => {
  const db = inject(dbRef);
  const cache = inject(cacheRef);
  return new UserRepository(db, cache);
});
```

## TypeScript Support

This library is built with TypeScript and provides full type safety:

```typescript
interface User {
  id: string;
  name: string;
}

const userToken = createToken<User>('User');
const userRef = provideToken(userToken, {
  id: '123',
  name: 'John'
});

runInInjectionContext(() => {
  const user = inject(userRef);
  // user is fully typed as User
  console.log(user.name.toUpperCase());
  
  // TypeScript error: Property 'foo' does not exist
  // console.log(user.foo);
});
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

