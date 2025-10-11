# dn-ioc

<p align="center">
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/v/dn-ioc?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/dm/dn-ioc?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MunMunMiao/dn-ioc/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MunMunMiao/dn-ioc?color=%23000&style=flat-square" alt="license"></a>
</p>
<p align="center">
  A lightweight, type-safe IoC container for TypeScript. No decorators, no reflection - just functions and closures.
</p>

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

### The Ref

A `Ref` is both a dependency provider and its identifier. Think of it as a factory function wrapped in an object that can be used as a key.

```typescript
const config = provide(() => ({ apiUrl: '/api' }));
```

That's it. No tokens, no decorators. The `Ref` itself is the identity.

### Injection Context

Dependencies are resolved within an injection context. **You create one context at your application's entry point - it wraps your entire application and lives for its entire lifetime.**

```typescript
// main.ts - runInInjectionContext is the application shell
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { provide, inject, runInInjectionContext } from 'dn-ioc';

runInInjectionContext(() => {
  const app = inject(appProvider);
  serve(app, { port: 3000 });
});
```

`runInInjectionContext` supports both **sync and async** functions:

```typescript
// Async example
runInInjectionContext(async () => {
  const app = inject(appProvider);
  await app.initialize();
  serve(app, { port: 3000 });
});
```

This is similar to how dependency injection works in [Go Kratos](https://raw.githubusercontent.com/go-kratos/kratos-layout/refs/heads/main/cmd/server/main.go) - you wire up dependencies **once at startup**, not per-request.

### Instance Modes

**Global mode** (default): Singleton across all contexts. First context to request it creates it, everyone else gets the same instance.

**Standalone mode**: Each context gets its own instance. Useful for testing isolated scenarios.

```typescript
// Singleton (default)
const db = provide(() => new Database());

// Per-context
const testDb = provide(() => new MockDatabase(), { mode: 'standalone' });
```

## Basic Usage

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { provide, inject, runInInjectionContext } from 'dn-ioc';

// Define dependencies
const logger = provide(() => console);

const db = provide(() => {
  const log = inject(logger);
  log.log('Creating database connection...');
  return new Database();
});

const app = provide(() => {
  const database = inject(db);
  const log = inject(logger);
  
  const hono = new Hono();
  
  hono.get('/', (c) => c.text('Hello Hono!'));
  
  hono.get('/users', async (c) => {
    const users = await database.query('SELECT * FROM users');
    return c.json(users);
  });
  
  return hono;
});

// Bootstrap application - runInInjectionContext wraps your entire app
runInInjectionContext(() => {
  const application = inject(app);
  serve(application, { port: 3000 });
});
```

## MVC Architecture Example

Let's build a typical backend MVC setup with [Hono](https://hono.dev/docs/).

### Models and Repositories

```typescript
// domain/models/user.ts
export interface User {
  id: string;
  email: string;
  tenantId: string;
}

// infrastructure/repositories/userRepository.ts
import { provide, inject } from 'dn-ioc';

const db = provide(() => new Database());

export const userRepository = provide(() => {
  const database = inject(db);
  
  return {
    findById: async (id: string): Promise<User | null> => {
      return database.queryOne('SELECT * FROM users WHERE id = ?', [id]);
    },
    
    findByTenantId: async (tenantId: string): Promise<User[]> => {
      return database.query('SELECT * FROM users WHERE tenant_id = ?', [tenantId]);
    },
    
    create: async (email: string, tenantId: string): Promise<User> => {
      const id = generateId();
      await database.query(
        'INSERT INTO users (id, email, tenant_id) VALUES (?, ?, ?)',
        [id, email, tenantId]
      );
      return { id, email, tenantId };
    }
  };
});
```

### Services

```typescript
// application/services/userService.ts
import { provide, inject } from 'dn-ioc';
import { userRepository } from '../../infrastructure/repositories/userRepository';

export const userService = provide(() => {
  const repo = inject(userRepository);
  
  return {
    getUsersByTenant: async (tenantId: string) => {
      return repo.findByTenantId(tenantId);
    },
    
    createUser: async (email: string, tenantId: string) => {
      return repo.create(email, tenantId);
    }
  };
});
```

### Controllers

```typescript
// api/controllers/userController.ts
import { provide, inject } from 'dn-ioc';
import { userService } from '../../application/services/userService';

export const userController = provide(() => {
  const service = inject(userService);
  
  return {
    index: async (tenantId: string) => {
      return service.getUsersByTenant(tenantId);
    },
    
    create: async (tenantId: string, email: string) => {
      return service.createUser(email, tenantId);
    }
  };
});
```

### Application Bootstrap

```typescript
// main.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { runInInjectionContext, inject } from 'dn-ioc';
import { userController } from './api/controllers/userController';

// Bootstrap application - runInInjectionContext wraps your entire app
runInInjectionContext(() => {
  const controller = inject(userController);
  const app = new Hono();
  
  app.get('/users', async (c) => {
    const tenantId = c.req.header('x-tenant-id')!;
    const users = await controller.index(tenantId);
    return c.json(users);
  });
  
  app.post('/users', async (c) => {
    const tenantId = c.req.header('x-tenant-id')!;
    const { email } = await c.req.json();
    const user = await controller.create(tenantId, email);
    return c.json(user, 201);
  });
  
  serve(app, { port: 3000 });
});
```

This follows the [Kratos pattern](https://raw.githubusercontent.com/go-kratos/kratos-layout/refs/heads/main/cmd/server/main.go) where you wire up dependencies once at startup, then pass request-scoped data (like tenant ID) as function parameters.

## Domain-Driven Design Example

A complete DDD architecture with aggregates, repositories, and domain services.

### Domain Layer

```typescript
// domain/order/order.ts
export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly items: OrderItem[],
    public status: OrderStatus
  ) {}
  
  addItem(item: OrderItem): void {
    if (this.status !== 'draft') {
      throw new Error('Cannot add items to non-draft order');
    }
    this.items.push(item);
  }
  
  submit(): void {
    if (this.items.length === 0) {
      throw new Error('Cannot submit empty order');
    }
    this.status = 'submitted';
  }
  
  getTotalAmount(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
}

// domain/order/orderRepository.ts (interface)
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  findByCustomerId(customerId: string): Promise<Order[]>;
}
```

### Infrastructure Layer

```typescript
// infrastructure/persistence/orderRepository.ts
import { provide, inject } from 'dn-ioc';
import type { OrderRepository } from '../../domain/order/orderRepository';

const db = provide(() => new Database());

export const orderRepository = provide<OrderRepository>(() => {
  const database = inject(db);
  
  return {
    findById: async (id: string) => {
      const row = await database.queryOne('SELECT * FROM orders WHERE id = ?', [id]);
      if (!row) return null;
      return mapRowToOrder(row);
    },
    
    save: async (order: Order) => {
      await database.query(
        'INSERT INTO orders ... ON CONFLICT UPDATE ...',
        [order.id, order.customerId, order.status, JSON.stringify(order.items)]
      );
    },
    
    findByCustomerId: async (customerId: string) => {
      const rows = await database.query(
        'SELECT * FROM orders WHERE customer_id = ?',
        [customerId]
      );
      return rows.map(mapRowToOrder);
    }
  };
});

function mapRowToOrder(row: any): Order {
  return new Order(row.id, row.customer_id, JSON.parse(row.items), row.status);
}
```

### Application Layer

```typescript
// application/services/orderService.ts
import { provide, inject } from 'dn-ioc';
import { orderRepository } from '../../infrastructure/persistence/orderRepository';
import { Order } from '../../domain/order/order';

const eventBus = provide(() => new EventBus());

export const orderService = provide(() => {
  const repo = inject(orderRepository);
  const events = inject(eventBus);
  
  return {
    createOrder: async (customerId: string, currentUser: User) => {
      // Authorization check
      if (currentUser.id !== customerId && currentUser.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      
      const order = new Order(generateId(), customerId, [], 'draft');
      await repo.save(order);
      
      events.publish('order.created', { orderId: order.id });
      
      return order;
    },
    
    addItemToOrder: async (orderId: string, item: OrderItem, currentUser: User) => {
      const order = await repo.findById(orderId);
      if (!order) throw new Error('Order not found');
      
      if (currentUser.id !== order.customerId && currentUser.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      
      order.addItem(item);
      await repo.save(order);
      
      events.publish('order.itemAdded', { orderId, item });
      
      return order;
    },
    
    submitOrder: async (orderId: string, currentUser: User) => {
      const order = await repo.findById(orderId);
      if (!order) throw new Error('Order not found');
      
      if (currentUser.id !== order.customerId && currentUser.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      
      order.submit();
      await repo.save(order);
      
      events.publish('order.submitted', { 
        orderId, 
        totalAmount: order.getTotalAmount() 
      });
      
      return order;
    }
  };
});
```

### API Layer

```typescript
// main.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { provide, inject, runInInjectionContext } from 'dn-ioc';
import { orderService } from './application/services/orderService';

// Bootstrap application - runInInjectionContext wraps your entire app
runInInjectionContext(() => {
  const service = inject(orderService);
  const app = new Hono();
  
  app.post('/orders', async (c) => {
    const user = await authenticateRequest(c);
    const { customerId } = await c.req.json();
    
    try {
      const order = await service.createOrder(customerId, user);
      return c.json(order, 201);
    } catch (error) {
      if (error.message === 'Unauthorized') {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      return c.json({ error: 'Internal server error' }, 500);
    }
  });
  
  app.patch('/orders/:orderId', async (c) => {
    const user = await authenticateRequest(c);
    const orderId = c.req.param('orderId');
    const { action, item } = await c.req.json();
    
    try {
      if (action === 'addItem') {
        const order = await service.addItemToOrder(orderId, item, user);
        return c.json(order);
      } else if (action === 'submit') {
        const order = await service.submitOrder(orderId, user);
        return c.json(order);
      }
    } catch (error) {
      if (error.message === 'Unauthorized') {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      return c.json({ error: error.message }, 500);
    }
  });
  
  serve(app, { port: 3000 });
});
```

### Testing with DI

The beauty of this approach is testing becomes straightforward:

```typescript
// tests/orderService.test.ts
import { provide, inject, runInInjectionContext } from 'dn-ioc';
import { orderService } from '../application/services/orderService';
import { orderRepository } from '../infrastructure/persistence/orderRepository';
import { eventBus } from '../infrastructure/events/eventBus';

describe('Order Service', () => {
  it('should allow user to create their own order', () => {
    // Mock repository
    const mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCustomerId: jest.fn()
    };
    
    const mockEvents = {
      publish: jest.fn()
    };
    
    // Wire test dependencies
    let service: any;
    runInInjectionContext(() => {
      const testService = provide(
        () => inject(orderService),
        {
          providers: [
            provide(() => mockRepo, { overrides: orderRepository }),
            provide(() => mockEvents, { overrides: eventBus })
          ]
        }
      );
      
      service = inject(testService);
    });
    
    // Execute test
    const testUser = { id: 'user-123', role: 'customer' };
    const order = await service.createOrder('user-123', testUser);
    
    expect(order.customerId).toBe('user-123');
    expect(mockRepo.save).toHaveBeenCalledWith(order);
    expect(mockEvents.publish).toHaveBeenCalledWith(
      'order.created',
      { orderId: order.id }
    );
  });
});
```

## Multi-Tenant Architecture

Multi-tenant apps need different database connections per tenant. Here's how to handle it cleanly:

```typescript
// infrastructure/database.ts
export class Database {
  constructor(private url: string) {}
  
  async query(sql: string, params: any[]): Promise<any[]> {
    // Execute query
  }
}

// infrastructure/repositories/userRepository.ts
export interface UserRepository {
  getUsers(db: Database): Promise<User[]>;
  createUser(db: Database, email: string): Promise<User>;
}

export const userRepository = provide<UserRepository>(() => {
  return {
    getUsers: async (db: Database) => {
      return db.query('SELECT * FROM users', []);
    },
    
    createUser: async (db: Database, email: string) => {
      const id = generateId();
      await db.query('INSERT INTO users (id, email) VALUES (?, ?)', [id, email]);
      return { id, email };
    }
  };
});

// application/services/userService.ts
export const userService = provide(() => {
  const repo = inject(userRepository);
  
  return {
    getUsers: async (tenantDb: Database) => {
      return repo.getUsers(tenantDb);
    },
    
    createUser: async (tenantDb: Database, email: string) => {
      return repo.createUser(tenantDb, email);
    }
  };
});

// main.ts - Bootstrap application
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

runInInjectionContext(() => {
  const service = inject(userService);
  
  // Create database pool per tenant (loaded at startup)
  const tenantDatabases = new Map<string, Database>();
  tenantDatabases.set('tenant1', new Database('postgresql://tenant1'));
  tenantDatabases.set('tenant2', new Database('postgresql://tenant2'));
  
  const app = new Hono();
  
  app.get('/users', async (c) => {
    const tenantId = c.req.header('x-tenant-id')!;
    const db = tenantDatabases.get(tenantId);
    
    if (!db) {
      return c.json({ error: 'Invalid tenant' }, 400);
    }
    
    const users = await service.getUsers(db);
    return c.json(users);
  });
  
  app.post('/users', async (c) => {
    const tenantId = c.req.header('x-tenant-id')!;
    const db = tenantDatabases.get(tenantId);
    
    if (!db) {
      return c.json({ error: 'Invalid tenant' }, 400);
    }
    
    const { email } = await c.req.json();
    const user = await service.createUser(db, email);
    return c.json(user, 201);
  });
  
  serve(app, { port: 3000 });
});
```

## Hierarchical Injection

You can override dependencies locally using the `providers` option with `overrides`. **Use this primarily for testing**, not for runtime configuration.

### Testing Example

```typescript
import { provide, inject, runInInjectionContext } from 'dn-ioc';

const database = provide(() => new PostgresDatabase());
const userRepository = provide(() => new UserRepositoryImpl(inject(database)));

// In tests, override with mocks
describe('UserRepository', () => {
  it('should find user by id', () => {
    const mockDb = { query: jest.fn() };
    
    let repo: any;
    runInInjectionContext(() => {
      const testRepo = provide(
        () => inject(userRepository),
        {
          providers: [
            provide(() => mockDb, { overrides: database })
          ]
        }
      );
      
      repo = inject(testRepo);
    });
    
    await repo.findById('123');
    expect(mockDb.query).toHaveBeenCalled();
  });
});
```

### How Overrides Work

```typescript
const config = provide(() => ({ level: 0 }));

const service = provide(() => {
  const cfg = inject(config);
  return { level: cfg.level };
});

const overriddenService = provide(
  () => {
    const svc = inject(service); // This will use level: 1
    return svc;
  },
  {
    providers: [
      provide(() => ({ level: 1 }), { overrides: config })
    ]
  }
);

runInInjectionContext(() => {
  const cfg = inject(config);           // { level: 0 }
  const svc = inject(service);          // { level: 0 }
  const overridden = inject(overriddenService); // { level: 1 }
});
```

When `overriddenService`'s factory calls `inject(service)`, and `service`'s factory calls `inject(config)`, the injection system looks up the context hierarchy and finds the overridden config.

## When to Use Hierarchical Injection?

Following the [Kratos pattern](https://raw.githubusercontent.com/go-kratos/kratos-layout/refs/heads/main/cmd/server/main.go), you wire up dependencies **once at startup**. Request-scoped data should be passed as **function parameters**.

**✅ Use hierarchical injection for:**
- Testing (swap real implementations with mocks)
- Complex dependency graphs where you need to override shared dependencies
- Application-wide configuration overrides

**✅ Pass as parameters for:**
- Request-scoped data (current user, tenant ID, request context)
- Data that flows through your business logic
- Explicit control flow

### Good vs Bad Examples

```typescript
import { Hono } from 'hono';

// ✅ GOOD: Request data as parameters
runInInjectionContext(() => {
  const service = inject(userService);
  const app = new Hono();
  
  app.get('/users', async (c) => {
    const tenantId = c.req.header('x-tenant-id');
    const users = await service.getUsers(tenantId);
    return c.json(users);
  });
  
  serve(app, { port: 3000 });
});

// ❌ BAD: Creating new context per request
const app = new Hono();
app.get('/users', async (c) => {
  const tenantId = c.req.header('x-tenant-id');
  
  await runInInjectionContext(async () => {
    const scopedService = provide(
      () => inject(userService),
      {
        providers: [
          provide(() => tenantId, { overrides: tenantIdProvider })
        ]
      }
    );
    const service = inject(scopedService);
    const users = await service.getUsers();
    return c.json(users);
  });
});
```

The first approach is clearer, faster, and follows conventional patterns.

## API Reference

### `provide<T>(factory: () => T, options?: ProvideOptions<T>): Ref<T>`

Creates a dependency provider.

**Parameters:**
- `factory`: Function that creates the dependency
- `options` (optional):
  - `mode`: `'global'` (default) or `'standalone'`
  - `providers`: Array of providers available in the factory's context
  - `overrides`: Which provider this overrides in child contexts

**Returns:** A `Ref<T>` that can be used with `inject()`

**Example:**
```typescript
const logger = provide(() => new Logger());

const db = provide(() => new Database(), {
  mode: 'global'
});

const mockDb = provide(
  () => new MockDatabase(),
  { overrides: db }
);
```

---

### `inject<T>(ref: Ref<T>, options?: InjectOptions): T | undefined`

Injects a dependency from the current context. **Must be called within `runInInjectionContext`**.

**Parameters:**
- `ref`: The provider reference to inject
- `options` (optional):
  - `optional`: If `true`, returns `undefined` instead of throwing when unavailable

**Returns:** The injected instance, or `undefined` if optional and unavailable

**Throws:** Error if called outside injection context (unless `optional: true`)

**Example:**
```typescript
runInInjectionContext(() => {
  const db = inject(database);
  const logger = inject(loggerProvider, { optional: true });
});
```

---

### `runInInjectionContext(fn: () => void): void`
### `runInInjectionContext(fn: () => Promise<void>): Promise<void>`

Creates an injection context that wraps your **entire application**. This is the application shell.

**Parameters:**
- `fn`: Function to execute (sync or async)

**Returns:** `void` or `Promise<void>`

**Usage Pattern:**
```typescript
// main.ts - Application entry point
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

runInInjectionContext(() => {
  // Wire up all dependencies
  const app = inject(appProvider);
  const logger = inject(loggerProvider);
  
  // Start application - runs forever inside this context
  serve(app, { 
    port: 3000,
    onStart() {
      logger.log('Server started');
    }
  });
});

// Async example
runInInjectionContext(async () => {
  const db = inject(database);
  await db.connect();
  
  const app = inject(appProvider);
  serve(app, { port: 3000 });
});
```

**Important:** Call this **once** at your application's entry point, not per-request.

---

### `isInInjectionContext(): boolean`

Checks if currently within an injection context.

```typescript
if (isInInjectionContext()) {
  const value = inject(provider);
}
```

---

### `isProvideRef(value: unknown): boolean`

Type guard to check if a value is a Ref.

```typescript
if (isProvideRef(something)) {
  // something is definitely a Ref
  const value = inject(something);
}
```

## Best Practices

### 1. Clear naming without Ref suffix

```typescript
// ✅ Good - clean names
const logger = provide(() => new Logger());
const database = provide(() => new Database());
const userService = provide(() => new UserService(inject(database)));

// ❌ Avoid - redundant Ref suffix
const loggerRef = provide(() => new Logger());
const databaseRef = provide(() => new Database());
```

### 2. Use standalone mode for testing, not production

```typescript
// ✅ Good: Use for test isolation
const testDb = provide(() => new MockDatabase(), { mode: 'standalone' });

// ❌ Avoid: Don't use standalone in production for singletons
const db = provide(() => new Database(), { mode: 'standalone' });
```

### 3. Wire once at startup

```typescript
// ✅ Good: One context at app startup
runInInjectionContext(() => {
  const app = inject(appProvider);
  const logger = inject(loggerProvider);
  
  serve(app, { port: 3000 });
  logger.log('Server started');
});

// ❌ Bad: Multiple contexts or per-request contexts
app.get('/users', (c) => {
  runInInjectionContext(() => {
    // Don't do this!
  });
});
```

### 4. Type your domain interfaces

```typescript
// domain/repositories/userRepository.ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// infrastructure/repositories/postgresUserRepository.ts
export const userRepository = provide<UserRepository>(() => {
  // Implementation
});
```

This lets you swap implementations without changing business logic.

### 5. Use hierarchical injection for testing only

```typescript
// ✅ Good: Testing with mocks
describe('UserService', () => {
  it('should create user', () => {
    const mockRepo = { save: jest.fn() };
    
    let service: any;
    runInInjectionContext(() => {
      const testService = provide(
        () => inject(userService),
        { 
          providers: [
            provide(() => mockRepo, { overrides: userRepository })
          ] 
        }
      );
      service = inject(testService);
    });
    
    await service.createUser('test@example.com');
    expect(mockRepo.save).toHaveBeenCalled();
  });
});

// ❌ Avoid: Using for runtime configuration
const featureA = provide(
  () => inject(baseFeature),
  { providers: [provide(() => configA, { overrides: config })] }
);

// ✅ Better: Pass config explicitly
const featureA = provide(() => {
  const feature = inject(baseFeature);
  return feature.configure(configA);
});
```

## Common Patterns

### Application Bootstrap

Following the [Kratos framework pattern](https://raw.githubusercontent.com/go-kratos/kratos-layout/refs/heads/main/cmd/server/main.go):

```typescript
// main.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { runInInjectionContext, inject } from 'dn-ioc';

runInInjectionContext(async () => {
  // Initialize resources
  const db = inject(database);
  await db.connect();
  
  const logger = inject(loggerProvider);
  logger.info('Database connected');
  
  // Build and start app
  const app = inject(appProvider);
  
  serve(app, { 
    port: 3000,
    onStart() {
      logger.info('Server started on port 3000');
    }
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await db.close();
    process.exit(0);
  });
});
```

### Cloudflare Workers

```typescript
// worker.ts
import { Hono } from 'hono';
import { runInInjectionContext, inject, provide } from 'dn-ioc';

const app = provide(() => {
  const logger = inject(loggerProvider);
  const hono = new Hono();
  
  hono.get('/', (c) => c.text('Hello from Cloudflare!'));
  
  hono.get('/api/users', async (c) => {
    logger.log('Fetching users');
    const users = await fetchUsers();
    return c.json(users);
  });
  
  return hono;
});

// Export for Cloudflare Workers
let exportedApp: any;
runInInjectionContext(() => {
  exportedApp = inject(app);
});

export default exportedApp;
```

### Singleton Services

```typescript
// Global singletons (default mode)
const logger = provide(() => new Logger());
const database = provide(() => new Database());
const cache = provide(() => new RedisCache());
```

### Repository Pattern

```typescript
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export const userRepository = provide<UserRepository>(() => {
  const db = inject(database);
  
  return {
    findById: async (id) => {
      const row = await db.queryOne('SELECT * FROM users WHERE id = ?', [id]);
      return row ? mapToUser(row) : null;
    },
    save: async (user) => {
      await db.query('INSERT INTO users ... ON CONFLICT UPDATE ...', [user]);
    }
  };
});
```

### Service Layer

```typescript
export const userService = provide(() => {
  const repo = inject(userRepository);
  const events = inject(eventBus);
  
  return {
    createUser: async (email: string, currentUser: User) => {
      // Authorization
      if (currentUser.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      
      // Business logic
      const user = new User(generateId(), email);
      await repo.save(user);
      
      // Side effects
      events.publish('user.created', { userId: user.id });
      
      return user;
    }
  };
});
```

### Dependency Composition

```typescript
const database = provide(() => new Database());
const cache = provide(() => new Cache());

const userRepository = provide(() => {
  const db = inject(database);
  const cacheInstance = inject(cache);
  return new UserRepository(db, cacheInstance);
});
```

## Comparison with Other Frameworks

This library follows similar patterns to:

- **[Go Wire](https://github.com/google/wire)** - Compile-time dependency injection
- **[Go Kratos](https://go-kratos.dev/)** - Uses Wire for DI, see [example](https://raw.githubusercontent.com/go-kratos/kratos-layout/refs/heads/main/cmd/server/main.go)
- **InversifyJS** - Runtime DI with decorators (but we don't use decorators)
- **Awilix** - Registration-based DI (but we use refs directly)

**Key difference:** We wire dependencies **once at startup** in the main function. The entire app runs inside `runInInjectionContext()`.

## TypeScript Support

Full type safety with excellent type inference:

```typescript
interface User {
  id: string;
  name: string;
}

const user = provide<User>(() => ({
  id: '123',
  name: 'John'
}));

runInInjectionContext(() => {
  const u = inject(user);
  // u is fully typed as User
  console.log(u.name.toUpperCase());
  
  // TypeScript error: Property 'foo' does not exist
  // console.log(u.foo);
});
```

## License

MIT
