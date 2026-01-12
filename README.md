# dn-ioc

<p align="center">
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/v/dn-ioc?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/dm/dn-ioc?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MunMunMiao/dn-ioc/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MunMunMiao/dn-ioc?color=%23000&style=flat-square" alt="license"></a>
</p>
<p align="center">
  <a href="https://deepwiki.com/MunMunMiao/dn-ioc"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
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

const configRef = provide(() => ({ apiUrl: 'https://api.example.com' }))

const serviceRef = provide(({ inject }) => {
  const config = inject(configRef)
  return {
    fetch: (path: string) => fetch(`\${config.apiUrl}\${path}`)
  }
})

runInInjectionContext(({ inject }) => {
  const service = inject(serviceRef)
  service.fetch('/users')
})
```

## Design Philosophy

### Reference-based vs Token-based DI

Traditional DI frameworks (Angular, NestJS, Spring) use **token-based** dependency resolution:

```typescript
// Token-based: indirect reference
const CONFIG_TOKEN = new InjectionToken<Config>('config')

@Module({
  providers: [{ provide: CONFIG_TOKEN, useValue: { apiUrl: '...' } }]
})
class AppModule {}

@Injectable()
class UserService {
  constructor(@Inject(CONFIG_TOKEN) private config: Config) {}
}
```

This library uses **reference-based** dependency resolution:

```typescript
// Reference-based: direct reference
const configRef = provide(() => ({ apiUrl: '...' }))

const userServiceRef = provide(({ inject }) => {
  const config = inject(configRef)
  return new UserService(config)
})
```

### Comparison

| Aspect | Token-based DI | Reference-based DI |
|--------|---------------|-------------------|
| Reference type | Indirect (token) | Direct (Ref object) |
| Type safety | Runtime | Compile-time |
| Registration | Required | Not needed |
| Failure mode | Token not found error | Impossible |
| Complexity | High | Low |

### DI Principles Preserved

| Principle | Implementation |
|-----------|---------------|
| Inversion of Control | `inject()` creates instances |
| External dependencies | `inject` function provides dependencies |
| Decoupled creation | No direct factory calls |
| Testability | `overrides` option for mocking |
| Lifecycle management | `global`/`standalone` modes |

### Related Patterns

- **React Context**: Direct reference to Context objects
- **Vue provide/inject**: Direct reference to Symbol keys
- **Go Wire**: Compile-time DI with direct function references

## Core Concepts

### Ref

A `Ref` serves as both a dependency definition and its identifier:

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

| Mode | Behavior |
|------|----------|
| `global` (default) | Singleton for the program lifetime |
| `standalone` | New instance per `inject` call |

```typescript
const singleton = provide(() => new Service())
const perContext = provide(() => new Service(), { mode: 'standalone' })
```

## Usage

### Nested Dependencies

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

### Local Providers (Overrides)

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

When using `global` mode (default), singletons are cached **program-wide** after first creation. If a singleton is first created inside an override scope, that overridden instance becomes the global singleton for that ref.

```typescript
const urlRef = provide(() => ({ url: 'https://google.com' }))

const httpClientRef = provide(({ inject }) => {
  const config = inject(urlRef)
  return { baseUrl: config.url }
})

const serverRef = provide(({ inject }) => {
  const client = inject(httpClientRef)
  return { client }
})

const customServerRef = provide(
  ({ inject }) => inject(serverRef),
  {
    providers: [
      provide(() => ({ url: 'https://bing.com' }), { overrides: urlRef })
    ]
  }
)
```

| Scenario | Result | Reason |
|----------|--------|--------|
| First call: `inject(customServerRef)` | bing.com | Singleton created with override |
| `inject(serverRef)` called before | google.com | Singleton already cached |

To ensure overrides always apply without affecting global singletons, use `standalone` mode for the dependent providers (note: it creates a new instance per `inject`).

### Async Factories

```typescript
const asyncRef = provide(async () => {
  const data = await fetchData()
  return data
})

await runInInjectionContext(async ({ inject }) => {
  const data = await inject(asyncRef)
})
```

## Architecture Examples

### MVC Pattern

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

**Repository Layer**

```typescript
// repositories/userRepository.ts
import { provide } from 'dn-ioc'

const dbRef = provide(() => new Database())

export const userRepositoryRef = provide(({ inject }) => {
  const db = inject(dbRef)
  
  return {
    findById: (id: string) => db.queryOne('SELECT * FROM users WHERE id = ?', [id]),
    findAll: () => db.query('SELECT * FROM users'),
    create: async (email: string, name: string) => {
      const id = crypto.randomUUID()
      await db.query('INSERT INTO users VALUES (?, ?, ?)', [id, email, name])
      return { id, email, name }
    }
  }
})
```

**Service Layer**

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
      if (!email.includes('@')) throw new Error('Invalid email')
      return repo.create(email, name)
    }
  }
})
```

**Controller Layer**

```typescript
// controllers/userController.ts
import { provide } from 'dn-ioc'
import { userServiceRef } from '../services/userService'

export const userControllerRef = provide(({ inject }) => {
  const service = inject(userServiceRef)
  
  return {
    index: async () => ({ users: await service.listUsers() }),
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
  
  app.get('/users', async (c) => c.json(await userController.index()))
  app.get('/users/:id', async (c) => c.json(await userController.show(c.req.param('id'))))
  app.post('/users', async (c) => c.json(await userController.create(await c.req.json()), 201))
  
  serve(app, { port: 3000 })
})
```

### DDD Pattern

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

**Domain Entity**

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
  get totalAmount(): number {
    return this._items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
  
  addItem(item: OrderItem): void {
    if (this._status !== 'draft') throw new Error('Cannot modify non-draft order')
    this._items.push(item)
  }
  
  submit(): void {
    if (this._items.length === 0) throw new Error('Cannot submit empty order')
    this._status = 'submitted'
  }
}
```

**Domain Repository Interface**

```typescript
// domain/repositories/orderRepository.ts
import type { Order } from '../entities/order'

export interface OrderRepository {
  findById(id: string): Promise<Order | null>
  save(order: Order): Promise<void>
  findByCustomerId(customerId: string): Promise<Order[]>
}
```

**Infrastructure Implementation**

```typescript
// infrastructure/persistence/orderRepositoryImpl.ts
import { provide } from 'dn-ioc'
import type { OrderRepository } from '../../domain/repositories/orderRepository'

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
        `INSERT INTO orders (id, customer_id, items, status) VALUES (?, ?, ?, ?)
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
```

**Application Service**

```typescript
// application/services/orderService.ts
import { provide } from 'dn-ioc'
import { orderRepositoryRef } from '../../infrastructure/persistence/orderRepositoryImpl'
import { eventBusRef } from '../../infrastructure/events/eventBus'
import { Order } from '../../domain/entities/order'

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
    submitOrder: async (orderId: string) => {
      const order = await repo.findById(orderId)
      if (!order) throw new Error('Order not found')
      order.submit()
      await repo.save(order)
      events.publish('order.submitted', { orderId, total: order.totalAmount })
      return order
    }
  }
})
```

## Testing

### Mocking Dependencies

```typescript
import { beforeEach, describe, test, expect, mock } from 'bun:test'
import { provide, resetGlobalInstances, runInInjectionContext } from 'dn-ioc'

const dbRef = provide(() => new RealDatabase())

const repoRef = provide(({ inject }) => {
  const db = inject(dbRef)
  return new UserRepository(db)
})

beforeEach(() => {
  resetGlobalInstances()
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

## API Reference

### Types

```typescript
interface Ref<T> {
  [PROVIDE_REF]: unknown
}

type ProvideOptions<T = unknown> = {
  mode?: 'global' | 'standalone'
  providers?: Ref<unknown>[]
  overrides?: Ref<T>
}

interface InjectFn {
  <T>(ref: Ref<T>): T
}

interface Context {
  inject: InjectFn
}

type Factory<T> = (ctx: Context) => T
```

### Functions

#### `provide<T>(factory, options?): Ref<T>`

Creates a dependency provider.

| Parameter | Type | Description |
|-----------|------|-------------|
| `factory` | `(ctx: Context) => T` | Factory function. Function name is used in error messages. |
| `options.mode` | `'global' \| 'standalone'` | Instance mode. `global` is singleton for program lifetime; `standalone` creates a new instance per `inject`. Default: `'global'` |
| `options.providers` | `Ref<unknown>[]` | Local providers for this factory's scope |
| `options.overrides` | `Ref<T>` | Which Ref this provider overrides |

**Returns:** `Ref<T>`

```typescript
// Named function for better error messages
const configRef = provide(function Config() {
  return { apiUrl: '/api' }
})

// Arrow function uses variable name
const loggerRef = provide(() => new Logger(), { mode: 'standalone' })
```

#### `runInInjectionContext<T>(fn): T | Promise<T>`

Creates an injection context and executes the function within it.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(ctx: Context) => T` | Function to execute |

**Returns:** Return value of `fn`

```typescript
// Sync
const result = runInInjectionContext(({ inject }) => {
  return inject(serviceRef).getData()
})

// Async
const result = await runInInjectionContext(async ({ inject }) => {
  return await inject(serviceRef).fetchData()
})
```

#### `isProvideRef(value): boolean`

Type guard to check if a value is a valid `Ref`.

```typescript
isProvideRef(ref)   // true
isProvideRef({})    // false
isProvideRef(null)  // false
```

#### `resetGlobalInstances(): void`

Clears cached global instances. Useful for test isolation or when you want to re-create singletons during runtime.

```typescript
import { provide, resetGlobalInstances, runInInjectionContext } from 'dn-ioc'

const ref = provide(() => ({ id: Math.random() }))

runInInjectionContext(({ inject }) => {
  const a = inject(ref)
  resetGlobalInstances()
  const b = inject(ref)
  // a !== b
})
```

## Error Handling

### Circular Dependency Detection

Circular dependencies are detected at runtime with descriptive error messages.

The function name is used for identification:

```typescript
// Named function
const aRef = provide(function ServiceA({ inject }) {
  return inject(bRef)
})
const bRef = provide(function ServiceB({ inject }) {
  return inject(aRef)
})
// Error: "Circular dependency detected: ServiceA"

// Arrow function uses variable name
const userService = provide(({ inject }) => inject(authService))
const authService = provide(({ inject }) => inject(userService))
// Error: "Circular dependency detected: userService"

// Anonymous function
provide(({ inject }) => inject(ref))
// Error: "Circular dependency detected: <anonymous>"
```

## License

MIT
