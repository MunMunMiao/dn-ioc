# dn-ioc

<p align="center">
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/v/dn-ioc?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/dm/dn-ioc?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MunMunMiao/dn-ioc/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MunMunMiao/dn-ioc?color=%23000&style=flat-square" alt="license"></a>
</p>
<p align="center">
  A lightweight, type-safe IoC container for TypeScript.<br>
  No decorators, no reflection, no token registration — just functions and direct references.
</p>

## Installation

```bash
npm install dn-ioc
# or
pnpm add dn-ioc
# or
bun add dn-ioc
```

## Quick Start

```typescript
import { provide, runInInjectionContext } from 'dn-ioc'

// Define dependencies with direct references
const configRef = provide(() => ({ apiUrl: 'https://api.example.com' }))

const serviceRef = provide(({ inject }) => {
  const config = inject(configRef)
  return {
    fetch: (path: string) => fetch(`${config.apiUrl}${path}`)
  }
})

// Run within injection context
runInInjectionContext(({ inject }) => {
  const service = inject(serviceRef)
  service.fetch('/users')
})
```

## vs Traditional DI

This library takes a fundamentally different approach from traditional DI frameworks like Angular, NestJS, or Spring.

### Traditional DI (Token-based)

```typescript
// 1. Define a token (indirect reference)
const CONFIG_TOKEN = new InjectionToken<Config>('config')

// 2. Register in a module (separate step)
@Module({
  providers: [{ provide: CONFIG_TOKEN, useValue: { apiUrl: '...' } }]
})
class AppModule {}

// 3. Inject via token (runtime lookup)
@Injectable()
class UserService {
  constructor(@Inject(CONFIG_TOKEN) private config: Config) {}
}
```

**Characteristics:**
- **Indirect reference**: Dependencies are identified by tokens (strings/Symbols/classes)
- **Registration required**: Must register providers in a container/module
- **Runtime resolution**: Container looks up matching provider at runtime
- **Can fail**: Token not registered → runtime error

### This Library (Reference-based)

```typescript
// 1. Define = Provide (direct reference)
const configRef = provide(() => ({ apiUrl: '...' }))

// 2. Use directly (no registration needed)
const userServiceRef = provide(({ inject }) => {
  const config = inject(configRef)  // Direct reference to configRef
  return new UserService(config)
})
```

**Characteristics:**
- **Direct reference**: `configRef` is a concrete object, not a lookup key
- **No registration**: `provide()` creates the provider immediately
- **Compile-time safety**: TypeScript knows the type of `configRef`
- **Cannot fail**: If the reference exists, the dependency exists

### Comparison Table

| Aspect | Traditional DI | This Library |
|--------|---------------|--------------|
| Reference | Indirect (token) | Direct (Ref object) |
| Type Safety | Weak (runtime) | Strong (compile-time) |
| Registration | Required | Not needed |
| Failure Mode | Possible (token not found) | Impossible |
| Complexity | High (tokens, modules, providers) | Low (just provide/inject) |

### Is Direct Reference Still Dependency Injection?

**Yes!** The core principles of DI are preserved:

| DI Principle | Traditional | This Library |
|--------------|-------------|--------------|
| **Inversion of Control** | ✅ Container creates instances | ✅ `inject()` creates instances |
| **Dependencies provided externally** | ✅ Container injects | ✅ `inject` function injects |
| **Decouple creation from use** | ✅ No direct `new` | ✅ No direct factory calls |
| **Testability** | ✅ Mock providers | ✅ `overrides` option |
| **Lifecycle management** | ✅ singleton/transient | ✅ `global`/`standalone` |

The key insight: **Direct reference ≠ Tight coupling**

```typescript
// Although it's a "direct reference", the dependency relationship is declarative
const serviceRef = provide(({ inject }) => {
  const config = inject(configRef)  // Declares: "I need config"
  // ...
})
```

The component declares *what* it needs, not *how* to get it. This is dependency injection.

### Similar Modern Approaches

This design aligns with modern DI patterns:

- **React Context** — Direct reference to Context objects
- **Vue provide/inject** — Direct reference to Symbol keys
- **Go Wire** — Compile-time dependency injection with direct function references

## Core Concepts

### Ref

A `Ref` is both a dependency definition and its identifier:

```typescript
const dbRef = provide(() => new Database())
```

### Context

Dependencies are resolved within a context. The `inject` function is passed as a parameter:

```typescript
runInInjectionContext(({ inject }) => {
  const db = inject(dbRef)
})
```

### Instance Modes

- **`global`** (default): Singleton across all contexts
- **`standalone`**: New instance per context

```typescript
const singleton = provide(() => new Service())                    // global
const perContext = provide(() => new Service(), { mode: 'standalone' })
```

## Nested Dependencies

```typescript
const dbRef = provide(() => new Database())

const repoRef = provide(({ inject }) => {
  const db = inject(dbRef)
  return new UserRepository(db)
})

const serviceRef = provide(({ inject }) => {
  const repo = inject(repoRef)
  return new UserService(repo)
})
```

## Local Providers (Overrides)

Override dependencies for testing or specific use cases:

```typescript
const configRef = provide(() => ({ env: 'production' }))

const serviceRef = provide(
  ({ inject }) => {
    const config = inject(configRef)
    return { env: config.env }
  },
  {
    providers: [
      provide(() => ({ env: 'test' }), { overrides: configRef })
    ]
  }
)

runInInjectionContext(({ inject }) => {
  inject(configRef)   // { env: 'production' }
  inject(serviceRef)  // { env: 'test' }
})
```

### Override Behavior with Instance Modes

Understanding how `providers` interacts with `global`/`standalone` modes is important:

```typescript
const urlRef = provide(() => ({ url: 'https://google.com' }))

const httpClientRef = provide(({ inject }) => {
  const config = inject(urlRef)
  return { baseUrl: config.url }
})  // global mode (default)

const serverRef = provide(({ inject }) => {
  const client = inject(httpClientRef)
  return { client }
})  // global mode (default)

// Try to override urlRef
const customServerRef = provide(
  ({ inject }) => inject(serverRef),
  {
    providers: [
      provide(() => ({ url: 'https://bing.com' }), { overrides: urlRef })
    ]
  }
)
```

**Behavior depends on whether dependencies were already created:**

| Scenario | httpClient uses | Reason |
|----------|----------------|--------|
| First call is `inject(customServerRef)` | bing.com ✅ | Dependencies created fresh with override |
| `inject(serverRef)` called before | google.com ❌ | `httpClientRef` already cached as singleton |

**This is consistent with traditional DI frameworks** (Angular, NestJS, Spring) — singletons are created once and never rebuilt.

### Solution: Use `standalone` Mode

If you need overrides to always apply, use `standalone` mode for the dependency chain:

```typescript
const httpClientRef = provide(({ inject }) => {
  const config = inject(urlRef)
  return { baseUrl: config.url }
}, { mode: 'standalone' })  // New instance per context

const serverRef = provide(({ inject }) => {
  const client = inject(httpClientRef)
  return { client }
}, { mode: 'standalone' })  // New instance per context

// Now override always works
const customServerRef = provide(
  ({ inject }) => inject(serverRef),
  {
    providers: [
      provide(() => ({ url: 'https://bing.com' }), { overrides: urlRef })
    ]
  }
)

runInInjectionContext(({ inject }) => {
  inject(customServerRef).client.baseUrl  // Always 'https://bing.com'
})
```

### Advantage Over Traditional DI

This library offers **more granular control** than traditional DI frameworks:

| Traditional DI | This Library |
|----------------|--------------|
| Override at module/scope level | Override at individual `provide()` level |
| Need to create new Module/Injector | Just add `providers` option |
| Complex scope hierarchy | Simple parent-child context |

```typescript
// Traditional DI: Need a new module to override
@Module({
  providers: [{ provide: URL_TOKEN, useValue: 'https://bing.com' }]
})
class CustomModule {}

// This library: Override inline, no extra constructs
const customRef = provide(
  ({ inject }) => inject(serverRef),
  { providers: [provide(() => 'https://bing.com', { overrides: urlRef })] }
)
```
```

## Async Support

```typescript
const asyncRef = provide(async () => {
  const data = await fetchData()
  return data
})

runInInjectionContext(async ({ inject }) => {
  const data = await inject(asyncRef)
})
```

## Architecture Examples

### MVC Architecture

A typical Model-View-Controller setup with repository pattern.

```
src/
├── models/
│   └── user.ts
├── repositories/
│   └── userRepository.ts
├── services/
│   └── userService.ts
├── controllers/
│   └── userController.ts
└── main.ts
```

**Models**

```typescript
// models/user.ts
export interface User {
  id: string
  email: string
  name: string
}
```

**Repositories**

```typescript
// repositories/userRepository.ts
import { provide } from 'dn-ioc'
import type { User } from '../models/user'

const dbRef = provide(() => new Database())

export const userRepositoryRef = provide(({ inject }) => {
  const db = inject(dbRef)
  
  return {
    findById: (id: string): Promise<User | null> => 
      db.queryOne('SELECT * FROM users WHERE id = ?', [id]),
    
    findAll: (): Promise<User[]> => 
      db.query('SELECT * FROM users'),
    
    create: async (email: string, name: string): Promise<User> => {
      const id = crypto.randomUUID()
      await db.query('INSERT INTO users VALUES (?, ?, ?)', [id, email, name])
      return { id, email, name }
    }
  }
})
```

**Services**

```typescript
// services/userService.ts
import { provide } from 'dn-ioc'
import { userRepositoryRef } from '../repositories/userRepository'

export const userServiceRef = provide(({ inject }) => {
  const repo = inject(userRepositoryRef)
  
  return {
    getUser: (id: string) => repo.findById(id),
    
    listUsers: () => repo.findAll(),
    
    createUser: async (email: string, name: string) => {
      // Business logic: validate email
      if (!email.includes('@')) {
        throw new Error('Invalid email')
      }
      return repo.create(email, name)
    }
  }
})
```

**Controllers**

```typescript
// controllers/userController.ts
import { provide } from 'dn-ioc'
import { userServiceRef } from '../services/userService'

export const userControllerRef = provide(({ inject }) => {
  const service = inject(userServiceRef)
  
  return {
    index: async () => {
      const users = await service.listUsers()
      return { users }
    },
    
    show: async (id: string) => {
      const user = await service.getUser(id)
      if (!user) throw new Error('User not found')
      return { user }
    },
    
    create: async (body: { email: string; name: string }) => {
      const user = await service.createUser(body.email, body.name)
      return { user }
    }
  }
})
```

**Application Entry**

```typescript
// main.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { runInInjectionContext } from 'dn-ioc'
import { userControllerRef } from './controllers/userController'

runInInjectionContext(({ inject }) => {
  const userController = inject(userControllerRef)
  const app = new Hono()
  
  app.get('/users', async (c) => {
    const result = await userController.index()
    return c.json(result)
  })
  
  app.get('/users/:id', async (c) => {
    const result = await userController.show(c.req.param('id'))
    return c.json(result)
  })
  
  app.post('/users', async (c) => {
    const body = await c.req.json()
    const result = await userController.create(body)
    return c.json(result, 201)
  })
  
  serve(app, { port: 3000 })
})
```

---

### DDD Architecture (Domain-Driven Design)

A layered architecture with domain entities, repositories, application services, and infrastructure.

```
src/
├── domain/
│   ├── entities/
│   │   └── order.ts
│   └── repositories/
│       └── orderRepository.ts      (interface)
├── application/
│   └── services/
│       └── orderService.ts
├── infrastructure/
│   ├── persistence/
│   │   └── orderRepositoryImpl.ts
│   └── events/
│       └── eventBus.ts
└── main.ts
```

**Domain Layer - Entities**

```typescript
// domain/entities/order.ts
export type OrderStatus = 'draft' | 'submitted' | 'completed'

export interface OrderItem {
  productId: string
  quantity: number
  price: number
}

export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    private _items: OrderItem[] = [],
    private _status: OrderStatus = 'draft'
  ) {}
  
  get items(): ReadonlyArray<OrderItem> { return this._items }
  get status(): OrderStatus { return this._status }
  
  addItem(item: OrderItem): void {
    if (this._status !== 'draft') {
      throw new Error('Cannot modify non-draft order')
    }
    this._items.push(item)
  }
  
  submit(): void {
    if (this._items.length === 0) {
      throw new Error('Cannot submit empty order')
    }
    this._status = 'submitted'
  }
  
  get totalAmount(): number {
    return this._items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}
```

**Domain Layer - Repository Interface**

```typescript
// domain/repositories/orderRepository.ts
import type { Order } from '../entities/order'

export interface OrderRepository {
  findById(id: string): Promise<Order | null>
  save(order: Order): Promise<void>
  findByCustomerId(customerId: string): Promise<Order[]>
}
```

**Infrastructure Layer - Repository Implementation**

```typescript
// infrastructure/persistence/orderRepositoryImpl.ts
import { provide } from 'dn-ioc'
import type { OrderRepository } from '../../domain/repositories/orderRepository'
import { Order } from '../../domain/entities/order'

const dbRef = provide(() => new Database())

export const orderRepositoryRef = provide<OrderRepository>(({ inject }) => {
  const db = inject(dbRef)
  
  return {
    findById: async (id) => {
      const row = await db.queryOne('SELECT * FROM orders WHERE id = ?', [id])
      return row ? hydrate(row) : null
    },
    
    save: async (order) => {
      await db.query(
        `INSERT INTO orders (id, customer_id, items, status) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET items = ?, status = ?`,
        [order.id, order.customerId, JSON.stringify(order.items), order.status,
         JSON.stringify(order.items), order.status]
      )
    },
    
    findByCustomerId: async (customerId) => {
      const rows = await db.query('SELECT * FROM orders WHERE customer_id = ?', [customerId])
      return rows.map(hydrate)
    }
  }
})

function hydrate(row: any): Order {
  return new Order(row.id, row.customer_id, JSON.parse(row.items), row.status)
}
```

**Infrastructure Layer - Event Bus**

```typescript
// infrastructure/events/eventBus.ts
import { provide } from 'dn-ioc'

type EventHandler = (payload: any) => void

export const eventBusRef = provide(() => {
  const handlers = new Map<string, EventHandler[]>()
  
  return {
    publish: (event: string, payload: any) => {
      handlers.get(event)?.forEach(fn => fn(payload))
    },
    
    subscribe: (event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push(handler)
    }
  }
})
```

**Application Layer - Service**

```typescript
// application/services/orderService.ts
import { provide } from 'dn-ioc'
import { orderRepositoryRef } from '../../infrastructure/persistence/orderRepositoryImpl'
import { eventBusRef } from '../../infrastructure/events/eventBus'
import { Order, type OrderItem } from '../../domain/entities/order'

export const orderServiceRef = provide(({ inject }) => {
  const repo = inject(orderRepositoryRef)
  const events = inject(eventBusRef)
  
  return {
    createOrder: async (customerId: string) => {
      const order = new Order(crypto.randomUUID(), customerId)
      await repo.save(order)
      events.publish('order.created', { orderId: order.id })
      return order
    },
    
    addItem: async (orderId: string, item: OrderItem) => {
      const order = await repo.findById(orderId)
      if (!order) throw new Error('Order not found')
      
      order.addItem(item)
      await repo.save(order)
      events.publish('order.itemAdded', { orderId, item })
      return order
    },
    
    submitOrder: async (orderId: string) => {
      const order = await repo.findById(orderId)
      if (!order) throw new Error('Order not found')
      
      order.submit()
      await repo.save(order)
      events.publish('order.submitted', { orderId, total: order.totalAmount })
      return order
    },
    
    getOrder: (orderId: string) => repo.findById(orderId),
    
    getCustomerOrders: (customerId: string) => repo.findByCustomerId(customerId)
  }
})
```

**Application Entry**

```typescript
// main.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { runInInjectionContext } from 'dn-ioc'
import { orderServiceRef } from './application/services/orderService'
import { eventBusRef } from './infrastructure/events/eventBus'

runInInjectionContext(({ inject }) => {
  const orderService = inject(orderServiceRef)
  const events = inject(eventBusRef)
  
  // Subscribe to domain events
  events.subscribe('order.submitted', ({ orderId, total }) => {
    console.log(`Order ${orderId} submitted with total: $${total}`)
  })
  
  const app = new Hono()
  
  app.post('/orders', async (c) => {
    const { customerId } = await c.req.json()
    const order = await orderService.createOrder(customerId)
    return c.json(order, 201)
  })
  
  app.post('/orders/:id/items', async (c) => {
    const item = await c.req.json()
    const order = await orderService.addItem(c.req.param('id'), item)
    return c.json(order)
  })
  
  app.post('/orders/:id/submit', async (c) => {
    const order = await orderService.submitOrder(c.req.param('id'))
    return c.json(order)
  })
  
  app.get('/orders/:id', async (c) => {
    const order = await orderService.getOrder(c.req.param('id'))
    if (!order) return c.json({ error: 'Not found' }, 404)
    return c.json(order)
  })
  
  serve(app, { port: 3000 })
})
```

**Testing DDD with Mocks**

```typescript
// tests/orderService.test.ts
import { describe, test, expect, mock } from 'bun:test'
import { provide, runInInjectionContext } from 'dn-ioc'
import { orderServiceRef } from '../application/services/orderService'
import { orderRepositoryRef } from '../infrastructure/persistence/orderRepositoryImpl'
import { eventBusRef } from '../infrastructure/events/eventBus'

describe('OrderService', () => {
  test('createOrder publishes event', async () => {
    const mockRepo = {
      save: mock(() => Promise.resolve()),
      findById: mock(() => Promise.resolve(null)),
      findByCustomerId: mock(() => Promise.resolve([]))
    }
    
    const mockEvents = {
      publish: mock(() => {}),
      subscribe: mock(() => {})
    }
    
    const testServiceRef = provide(
      ({ inject }) => inject(orderServiceRef),
      {
        providers: [
          provide(() => mockRepo, { overrides: orderRepositoryRef }),
          provide(() => mockEvents, { overrides: eventBusRef })
        ]
      }
    )
    
    await runInInjectionContext(async ({ inject }) => {
      const service = inject(testServiceRef)
      const order = await service.createOrder('customer-123')
      
      expect(order.customerId).toBe('customer-123')
      expect(mockRepo.save).toHaveBeenCalled()
      expect(mockEvents.publish).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({ orderId: order.id })
      )
    })
  })
})
```

## API Reference

### Types

```typescript
/**
 * A reference to a dependency provider.
 * Used as both identifier and accessor for dependencies.
 */
interface Ref<T> {
  [PROVIDE_REF]: unknown
}

/**
 * Options for creating a provider.
 */
type ProvideOptions<T = unknown> = {
  /** Instance mode: 'global' (singleton) or 'standalone' (per-context) */
  mode?: 'global' | 'standalone'
  /** Local providers available within this provider's factory */
  providers?: Ref<unknown>[]
  /** Which Ref this provider overrides in child contexts */
  overrides?: Ref<T>
}

/**
 * The inject function signature.
 */
interface InjectFn {
  <T>(ref: Ref<T>): T
}

/**
 * Context object passed to factory functions.
 */
interface Context {
  inject: InjectFn
}

/**
 * Factory function type.
 */
type Factory<T> = (ctx: Context) => T
```

### Functions

#### `provide<T>(factory, options?): Ref<T>`

Creates a dependency provider.

```typescript
function provide<T>(
  factory: (ctx: Context) => T,
  options?: ProvideOptions<T>
): Ref<T>
```

**Parameters:**
- `factory` - Function that creates the dependency instance. Receives `Context` with `inject` function. The function name is used for error messages (e.g., circular dependency detection).
- `options.mode` - `'global'` (default): singleton across all contexts. `'standalone'`: new instance per context.
- `options.providers` - Array of local providers available within this factory's scope.
- `options.overrides` - Specifies which `Ref` this provider should override in child contexts.

**Returns:** A `Ref<T>` that can be used with `inject()`.

**Example:**
```typescript
// Use named functions for better error messages
const configRef = provide(function Config() {
  return { apiUrl: '/api' }
})

// Provider with dependencies
const serviceRef = provide(function ApiService({ inject }) {
  const config = inject(configRef)
  return new ApiServiceImpl(config)
})

// Arrow functions use variable name automatically
const loggerRef = provide(() => new Logger(), { mode: 'standalone' })
// Error messages will show "loggerRef" as the name

// With local providers (for testing/overrides)
const testServiceRef = provide(
  ({ inject }) => inject(serviceRef),
  {
    providers: [
      provide(() => mockConfig, { overrides: configRef })
    ]
  }
)
```

---

#### `runInInjectionContext<T>(fn): T`

Creates an injection context and executes the given function within it.

```typescript
// Sync version
function runInInjectionContext<T>(fn: (ctx: Context) => T): T

// Async version
function runInInjectionContext<T>(fn: (ctx: Context) => Promise<T>): Promise<T>
```

**Parameters:**
- `fn` - Function to execute within the injection context. Receives `Context` object.

**Returns:** The return value of `fn`.

**Example:**
```typescript
// Sync
const result = runInInjectionContext(({ inject }) => {
  const service = inject(serviceRef)
  return service.getData()
})

// Async
const result = await runInInjectionContext(async ({ inject }) => {
  const service = inject(serviceRef)
  return await service.fetchData()
})
```

---

#### `isProvideRef(value): boolean`

Type guard to check if a value is a valid `Ref`.

```typescript
function isProvideRef(value: unknown): value is Ref<unknown>
```

**Parameters:**
- `value` - Any value to check.

**Returns:** `true` if value is a `Ref`, `false` otherwise.

**Example:**
```typescript
const ref = provide(() => 'value')

isProvideRef(ref)        // true
isProvideRef({})         // false
isProvideRef(null)       // false
isProvideRef(undefined)  // false
```

---

#### `resetGlobalInstances(): void`

Clears all cached global instances. Useful for testing to ensure a clean state between tests.

```typescript
function resetGlobalInstances(): void
```

**Example:**
```typescript
import { beforeEach } from 'bun:test'
import { resetGlobalInstances } from 'dn-ioc'

beforeEach(() => {
  resetGlobalInstances()
})
```

## Error Handling

### Circular Dependency Detection

The library automatically detects circular dependencies and throws a descriptive error.

The error message uses the **function name** for identification:

```typescript
// Using named functions - recommended for better error messages
const aRef = provide(function ServiceA({ inject }) {
  return inject(bRef)
})
const bRef = provide(function ServiceB({ inject }) {
  return inject(aRef)
})

runInInjectionContext(({ inject }) => {
  inject(aRef) // throws: "Circular dependency detected: ServiceA"
})
```

```typescript
// Arrow functions automatically use variable name
const userService = provide(({ inject }) => inject(authService))
const authService = provide(({ inject }) => inject(userService))

runInInjectionContext(({ inject }) => {
  inject(userService) // throws: "Circular dependency detected: userService"
})
```

```typescript
// Anonymous functions show "<anonymous>"
const ref = provide(({ inject }) => inject(ref))

runInInjectionContext(({ inject }) => {
  inject(ref) // throws: "Circular dependency detected: <anonymous>"
})
```

**Tip:** Use named functions (`function MyService() {}`) for clearer error messages in complex dependency graphs.

## Testing

```typescript
import { describe, test, expect, mock } from 'bun:test'

const dbRef = provide(() => new RealDatabase())

const repoRef = provide(({ inject }) => {
  const db = inject(dbRef)
  return new UserRepository(db)
})

describe('UserRepository', () => {
  test('with mock database', () => {
    const mockDb = { query: mock(() => []) }

    const testRepoRef = provide(
      ({ inject }) => inject(repoRef),
      {
        providers: [
          provide(() => mockDb, { overrides: dbRef })
        ]
      }
    )

    runInInjectionContext(({ inject }) => {
      const repo = inject(testRepoRef)
      repo.findAll()
      expect(mockDb.query).toHaveBeenCalled()
    })
  })
})
```

## License

MIT
