---
name: dn-ioc
description: Use when writing, refactoring, reviewing, testing, or debugging TypeScript code that uses dn-ioc for dependency injection, provider scoping, async factories, layered MVC/DDD wiring, or app lifecycle cleanup.
---

# dn-ioc

Small, zero-dependency, ESM-only TypeScript DI kernel. Providers are factory functions; no decorators, reflection, or global container. TypeScript consumers require `"moduleResolution": "bundler"` (`NodeNext`/`Node16` unsupported).

## Do Not Invent

- No decorators, reflection, global container, modules, request-scoped containers, multi-bindings, or signal listeners.
- `stop()` does not await unfinished detached factories, cancel I/O, or revoke held references.
- Handles from `token`, `provide`, `provideFor`, and `bundleProviders` are frozen opaque objects; never spread or clone them.

## Public API

```ts
token<T>(description?: string): Token<T>
provide<T>(factory: (ctx: Context) => T, options?: ProviderOptions): Ref<T>
provideFor<T>(key: InjectKey<T>, factory: (ctx: Context) => T, options?: ProviderOptions): ProviderDef<T>
bundleProviders(...inputs: ProviderInput[]): ProviderBundle
isProvideRef(value: unknown): value is Ref<unknown>
bootstrapApp(fn: (ctx: Context) => void | Promise<void>, options?: BootstrapAppOptions): App
```

- `Context = { inject: <T>(key: InjectKey<T>) => T; onDispose: (fn: () => void | Promise<void>) => void }`
- `App extends AsyncDisposable { start(): Promise<void>; stop(): Promise<void> }`
- Utility type: `RefType<T>` extracts `U` from `Ref<U>`.

## Ref vs Token Rule

Choose by import direction:
- **`Ref` (`provide()`)** when callers may import the implementation (MVC layers, application services). Self-installs on first `inject()` in the active scope; list shared/stateful refs in root `providers` so sibling subtrees reuse one instance.
- **`Token` (`token()` + `provideFor()`)** when the implementation lives in an outer layer (DDD / Clean Architecture). Put interfaces + tokens in `domain/`, inject tokens in `application/`, bind adapters via `provideFor()` and group via `bundleProviders()` in `infra/`, and pass `[infraProviders]` in `main.ts`. Never import `infra/` refs from `domain/` or `application/`.

## Core Invariants

- **Lazy boot & idempotent `start()`:** `bootstrapApp()` validates root `providers` and runs nothing. `start()` runs the root factory once and returns a shared `Promise`. Root factory must return `void | Promise<void>`.
- **Scopes:** Lookups walk active scope to root. `options.providers` creates an isolated private subtree. A consumer bound in a parent scope resolves dependencies there; to change a dependency for that consumer in a child scope, rebind both in the child scope.
- **Overrides & snapshots:** Provider arrays/bundles snapshot at creation and flatten in order. Duplicate keys in one scope: **later binding wins silently**.
- **Async factories:** `inject()` returns a shared `Promise` and evicts rejected promises from cache so later injections can retry. Type async tokens with `Promise`: `token<Promise<Config>>('Config')`.
- **Diagnostics:** Name tokens after their interface; pass named functions to `provide(function UserService(ctx) { ... })` so errors avoid `<anonymous>`.

## Lifecycle & Testing

- **Cleanup (`stop()`):** Synchronously closes `inject()` app-wide, then runs `onDispose` hooks LIFO. Always capture dependencies in local variables before `onDispose()`.
- **Hook rules:** Call `onDispose` only while its factory is running and before `stop()`. Return `void | Promise<void>` (use `{ server.close() }` to discard return values). Never `await app.stop()` inside a hook.
- **Rollback & `await using`:** Failed `start()` auto-calls `stop()` before rejecting; successful `start()` never auto-stops. Prefer `await using app = bootstrapApp(...)` in tests and scoped tasks. Wire OS/framework shutdown (`SIGINT`/`SIGTERM`, unmount, sync-only `pagehide`) yourself.
- **Testing:** `provideFor()` overrides both refs and tokens.
  - Unit tests: install only fakes (missing token fake rejects `start()`; missing ref fake runs the real ref).
  - Integration tests: place real bundle first, overrides after: `[infraProviders, provideFor(key, fake)]`.

## Exact Runtime Errors

- `No provider for token: Name`
- `Circular dependency detected: A -> B -> A`
- `Invalid inject key received`
- `Invalid provider input received`
- `Cannot inject after the app has stopped`
- `onDispose can only be called while the factory is running`
- `Cannot register cleanup after the app has stopped`
- `Cannot start an app that has been stopped`

## Minimal Pattern

```ts
import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

const clockToken = token<() => number>('Clock')
const serviceRef = provide(function Service({ inject }) {
  const now = inject(clockToken)
  return { stamp: () => now() }
})

await using app = bootstrapApp(({ inject }) => {
  inject(serviceRef).stamp()
}, { providers: [provideFor(clockToken, () => Date.now)] })
await app.start()
```

Full reference: https://dn-ioc.lyz.cloud/llms.txt
