# dn-ioc

<p align="center">
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/v/dn-ioc?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/dm/dn-ioc?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MunMunMiao/dn-ioc/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MunMunMiao/dn-ioc?color=%23000&style=flat-square" alt="license"></a>
</p>

`dn-ioc` is a small TypeScript dependency-injection kernel. A provider is a factory that creates a value; `provide()` creates a `Ref` with a default factory, while `token()` creates a key that must be bound explicitly. `inject()` resolves a `Ref` or `Token`. `bootstrapApp()` returns an app handle: `app.start()` runs the root factory, and `app.stop()` closes dependency resolution and releases registered resources. The root factory returns nothing — it wires the graph and does the work, it is not an expression that produces a value.

It has no decorators, reflection, runtime dependencies, or global container.

Use it for app, worker, CLI, and browser-shell graphs where providers need explicit scope, test overrides, and async factories. It does not provide modules, request-scoped containers, multi-bindings, or runtime signal listeners.

## Install

```bash
# Choose one package manager:
npm install dn-ioc
pnpm add dn-ioc
yarn add dn-ioc
bun add dn-ioc
deno add npm:dn-ioc
```

Deno can skip the install and import directly:

```ts
import { bootstrapApp } from 'npm:dn-ioc'
```

### Browser via CDN

The package is ESM and has no dependencies, so a browser can import it straight from a CDN — no install step and no bundler:

```html
<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      import { bootstrapApp, provide, provideFor, token } from 'https://cdn.jsdelivr.net/npm/dn-ioc@0.3.0'

      const greetingToken = token('Greeting')

      const greeterRef = provide(({ inject }) => {
        const greeting = inject(greetingToken)
        return { greet: name => `${greeting}, ${name}` }
      })

      const app = bootstrapApp(
        ({ inject }) => {
          document.body.textContent = inject(greeterRef).greet('world') // hello, world
        },
        { providers: [provideFor(greetingToken, () => 'hello')] },
      )

      await app.start()
    </script>
  </body>
</html>
```

Any of these entry points work:

| CDN      | URL                                         | Serves                            |
| -------- | ------------------------------------------- | --------------------------------- |
| jsDelivr | `https://cdn.jsdelivr.net/npm/dn-ioc@0.3.0` | `index.min.js` — 4.8 kB, 1.9 kB gzipped |
| unpkg    | `https://unpkg.com/dn-ioc@0.3.0`            | `index.min.js` — same file        |
| esm.sh   | `https://esm.sh/dn-ioc@0.3.0`               | esm.sh's own transpiled build     |

Pin the version. Drop the `@0.3.0` and the CDN serves whatever is newest, so a release you did not ask for can change a page you already shipped.

An import map keeps the specifier bare, so the same source runs with or without a bundler:

```html
<script type="importmap">
  { "imports": { "dn-ioc": "https://cdn.jsdelivr.net/npm/dn-ioc@0.3.0" } }
</script>
<script type="module">
  import { bootstrapApp } from 'dn-ioc'
</script>
```

If the graph holds resources — a socket, a poller — read [Wiring `stop()` to the runtime](#wiring-stop-to-the-runtime) before deciding where `app.stop()` goes: a page has no shutdown hook a browser will reliably wait on.

### Module format

Version 0.3.0 is ESM-only; use `import` in your application. TypeScript consumers should use `moduleResolution: "bundler"`. NodeNext and Node16 declaration resolution are not supported.

The kernel itself uses no platform APIs — no `process`, no DOM, no timers — so it runs unchanged on Node.js, Bun, Deno, browsers, workers, and edge runtimes. Only shutdown differs, because signals do; see [Wiring `stop()` to the runtime](#wiring-stop-to-the-runtime).

## Start an app

`bootstrapApp()` builds the graph and returns a handle without running anything. `app.start()` runs the root factory, and rejects if it fails. The root factory is your app's entry point, not an expression: it returns `void`, so anything a caller needs is reached through the graph rather than handed back.

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const configRef = provide(() => ({ greeting: 'hello' }))
const greeterRef = provide(({ inject }) => {
  const config = inject(configRef)
  return { greet: (name: string) => `${config.greeting}, ${name}` }
})

const app = bootstrapApp(({ inject }) => {
  console.log(inject(greeterRef).greet('world')) // hello, world
})

await app.start()
```

This graph holds no resources, so it never needs `stop()`. See [When you need `stop()`](#when-you-need-stop) for the cases that do.

For an async provider, await `inject()` inside the root factory so startup includes it:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const settingsRef = provide(async () => ({ greeting: 'hello' }))
const app = bootstrapApp(async ({ inject }) => {
  const settings = await inject(settingsRef)
  console.log(`${settings.greeting}, world`) // hello, world
})

await app.start()
```

Starting is separate from building so the caller can register shutdown handling before any provider runs. `start()` is idempotent: repeated calls return the same Promise and run the root factory once.

## Providers and scopes

A `Ref<T>` from `provide()` has a default factory and self-installs the first time it is injected in a scope. A `Token<T>` from `token()` has no default and must be bound with `provideFor()`.

Bindings are searched from the active scope toward its parents. Each binding is cached in its owning scope, or in its attached private scope when it has nested `providers`. An unbound ref self-installs in the scope that first resolves it; it is not a global singleton. Install shared providers at bootstrap so sibling subtrees reuse the same instance:

```ts
import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

const prefixToken = token<string>('Prefix')
const formatterRef = provide(({ inject }) => {
  const prefix = inject(prefixToken)
  return { format: (value: string) => `${prefix}${value}` }
})

const app = bootstrapApp(
  ({ inject }) => {
    console.log(inject(formatterRef).format('demo')) // [app] demo
  },
  { providers: [provideFor(prefixToken, () => '[app] '), formatterRef] },
)

await app.start()
await app.stop()
```

A provider can install a private subtree with `providers`:

```ts
import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

const labelToken = token<string>('Label')
const rendererRef = provide(({ inject }) => ({ label: inject(labelToken) }))
const localDemoRef = provide(
  ({ inject }) => ({
    label: inject(labelToken),
    renderer: inject(rendererRef),
  }),
  { providers: [provideFor(labelToken, () => 'local')] },
)

const app = bootstrapApp(
  ({ inject }) => {
    const demo = inject(localDemoRef)
    console.log(demo.label, demo.renderer.label) // local local
  },
  { providers: [provideFor(labelToken, () => 'app')] },
)

await app.start()
await app.stop()
```

The local binding is visible to that provider and its descendants. Sibling subtrees stay isolated. A consumer that is already installed or bound in a parent scope resolves its dependencies there, so a child override does not change that consumer. Rebind the consumer and its dependency together in the child scope when both need to change.

`provideFor()` accepts the same `providers` option when an explicit token or ref binding owns the private subtree.

Installation follows three rules:

- **Snapshotting.** Provider arrays and bundles are copied when their owning ref, binding, or bundle is created. Later edits to those arrays do not change that definition.
- **Order.** Provider inputs are flattened in source order, nested arrays and bundles included.
- **Last-write-wins.** If the same key is installed twice in one scope, the later binding silently replaces the earlier one, including its nested providers.

Bundles are ordinary provider inputs:

```ts
import { bootstrapApp, bundleProviders, provide, provideFor, token } from 'dn-ioc'

const themeToken = token<{ palette: string }>('Theme')
const optionsToken = token<{ palette: string }>('ThemeOptions')

function provideDemoTheme(options: { palette: string }) {
  return bundleProviders(
    provideFor(optionsToken, () => options),
    provideFor(themeToken, ({ inject }) => ({ palette: inject(optionsToken).palette })),
  )
}

const previewRef = provide(({ inject }) => inject(themeToken))
const app = bootstrapApp(
  ({ inject }) => {
    console.log(inject(previewRef).palette) // ocean
  },
  { providers: [provideDemoTheme({ palette: 'ocean' })] },
)

await app.start()
await app.stop()
```

## Cleanup

A provider registers cleanup with `onDispose()`. A successful `start()` never stops the app on its own; the caller decides when to call `stop()`.

`stop()` synchronously closes `inject()` across the entire app, then runs registered cleanup hooks newest-first. All subsequent injections throw `Cannot inject after the app has stopped`, including cached instances and private subtrees. Capture dependencies before registering a cleanup hook:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const storeRef = provide(() => ({ closed: false }))
const serviceRef = provide(({ inject, onDispose }) => {
  const store = inject(storeRef)
  onDispose(async () => {
    store.closed = true
  })
  return { read: () => inject(storeRef).closed }
})

let service!: { read: () => boolean }
const app = bootstrapApp(({ inject }) => {
  service = inject(serviceRef)
})

await app.start()
service.read() // false: deferred injection is allowed while the app is running
await app.stop()
try {
  service.read()
  throw new Error('expected service.read() to throw after stop')
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Cannot inject after the app has stopped') {
    throw error
  }
}
```

### When you need `stop()`

Not every app does. Call it when something outlives the graph:

- **Long-running processes** — a server, queue consumer, or CLI daemon holding sockets, timers, or file handles. Shutdown correctness depends on `stop()`.
- **Tests** — one app per test, stopped in teardown, so timers and connections do not leak between cases.
- **Sub-apps in a page** — a micro-frontend, widget, or route-scoped graph mounted and unmounted while the page lives on.

A short-lived script or a page-wide graph that only ends when the tab closes does not need it: the runtime reclaims everything anyway. The quick-start example above is in that category.

### Wiring `stop()` to the runtime

The kernel installs no listeners. Shutdown signals have no common subset across runtimes, so the caller owns them:

| Runtime | Trigger | Async cleanup |
| --- | --- | --- |
| Node.js, Bun | `process.on('SIGINT' \| 'SIGTERM', handler)` | Awaited, if the handler keeps the process alive |
| Deno | `Deno.addSignalListener('SIGINT', handler)` | Awaited |
| Browser page | `addEventListener('pagehide', handler)` | **Not reliable** — see below |
| Browser sub-app | Your own unmount/teardown call | Awaited |
| Web Worker | A message from the host before `worker.terminate()` | Only if the host waits before terminating |
| Serverless, edge | End of the request or invocation you scoped the app to | Depends on the platform's keep-alive API |

A server on Node or Bun:

```ts
import { createServer } from 'node:http'
import { bootstrapApp, provide } from 'dn-ioc'

const serverRef = provide(({ onDispose }) => {
  const server = createServer().listen(3000)
  onDispose(() => new Promise<void>(resolve => server.close(() => resolve())))
  return server
})

const app = bootstrapApp(({ inject }) => {
  inject(serverRef)
})

// Registered before start(), because bootstrapApp() runs no provider yet.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.stop())
}

try {
  await app.start()
} catch (error) {
  console.error(error)
  await app.stop()
}
```

The same graph on Deno only changes the listener:

```ts
Deno.addSignalListener('SIGINT', () => void app.stop())
```

In a browser, prefer scoping the app to something you unmount yourself, so cleanup runs while the page is still alive:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const socketRef = provide(({ onDispose }) => {
  const socket = new WebSocket('wss://example.com')
  onDispose(() => socket.close())
  return socket
})

const app = bootstrapApp(({ inject }) => {
  inject(socketRef)
})
await app.start()

// Call this from your framework's teardown: a React effect cleanup, Vue's onScopeDispose,
// a custom element's disconnectedCallback, or a router leave hook.
async function unmount() {
  await app.stop()
}
```

Page unload is a weaker guarantee. `pagehide` is the most reliable unload event, but the browser may discard the page before an async hook resolves, and `beforeunload` is worse — the back/forward cache can skip it entirely. If a resource must be released on unload, keep that hook synchronous:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const sessionRef = provide(({ onDispose }) => {
  const id = crypto.randomUUID()
  // Synchronous on purpose: an unloading page may not run a single further microtask.
  // Braces because a hook returns nothing, and sendBeacon returns a boolean.
  onDispose(() => {
    navigator.sendBeacon('/session/end', id)
  })
  return id
})

const app = bootstrapApp(({ inject }) => {
  inject(sessionRef)
})
await app.start()

addEventListener('pagehide', () => void app.stop())
```

### `await using`

`App` implements `AsyncDisposable`, so a scoped app can drop the explicit `stop()`:

```ts
{
  await using app = bootstrapApp(({ inject }) => {
    inject(serverRef)
  })
  await app.start()
} // app.stop() runs when this scope exits, including on throw
```

This needs explicit resource management: TypeScript 5.2+, or a runtime that supports the syntax natively. When TypeScript downlevels it, the lookup falls back to `Symbol.for('Symbol.asyncDispose')`; `dn-ioc` implements both keys, so it works on runtimes without a native `Symbol.asyncDispose`.

### Rules

**Hooks.** They may be synchronous or async, and run newest-first. A hook must resolve to nothing — `void`, or a `Promise<void>` that `stop()` awaits before it resolves. Returning anything else is a type error, including `async () => 42`. A cleanup call that has a return value is therefore discarded on purpose rather than by accident:

```ts
onDispose(() => { server.close() })         // braces discard the returned Server
onDispose(async () => { await pool.end() }) // awaited by stop()
``` Concurrent and repeated `stop()` calls return the same Promise and run each hook once. If a hook fails the remaining hooks still run: one failure is rethrown unchanged, several produce an `AggregateError` with the original errors. A hook must not await `app.stop()` — that is its own completion and would deadlock.

**Registration window.** `onDispose` is callable only while its own factory is running, and only before `stop()`. A synchronous factory closes the window when it returns or throws; an async factory closes it when its result settles. Registering later throws `onDispose can only be called while the factory is running`, or `Cannot register cleanup after the app has stopped` when the app is already stopping. A factory still running at `stop()` therefore fails rather than registering cleanup nobody would await — stop accepting new work before shutting down.

**Startup failure.** `start()` stops the app, then rejects. A lone failure is rethrown unchanged; a startup failure plus cleanup failures produce an `AggregateError`. A successful `start()` never stops the app on its own, and neither do runtime failures afterwards.

**What `stop()` does not do.** It does not wait for unfinished factories or cancel their I/O. A detached factory that started before shutdown keeps running and reports through the Promise `inject()` returned. Already-held JavaScript objects are not revoked. Request admission, task cancellation, and shutdown ordering stay with the application.

## Async factories

`inject()` preserves synchronous values and returns a shared Promise for an async provider. Repeated injection in the same resolution scope reuses that Promise. A rejected provider is removed from the cache so a later injection can retry while the app is running.

`start()` follows the root factory and the Promises it actually awaits or returns. Await the providers required for startup before returning:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const settingsRef = provide(async () => ({ ready: true }))
const app = bootstrapApp(async ({ inject }) => {
  const settings = await inject(settingsRef)
  console.log(settings.ready) // true
})

await app.start()
await app.stop()
```

For work started without awaiting it in the root, retain and observe the Promise returned by `inject()`. It reports that provider's own outcome and does not wait for unrelated providers, even after `stop()` has settled. If the factory never finishes, its Promise never reports an outcome; `stop()` can still finish.

Give that Promise an owner outside the root factory, so the caller can still observe it:

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const backgroundRef = provide(async () => 'done')

let background!: Promise<string>
const app = bootstrapApp(({ inject }) => {
  background = inject(backgroundRef)
})

await app.start()
console.log(await background) // done
await app.stop()
```

For an async token, put the Promise in the token type:

```ts
import { bootstrapApp, provideFor, token } from 'dn-ioc'

const settingsToken = token<Promise<{ ready: boolean }>>('Settings')
const app = bootstrapApp(
  async ({ inject }) => {
    const settings = await inject(settingsToken)
    console.log(settings.ready) // true
  },
  { providers: [provideFor(settingsToken, async () => ({ ready: true }))] },
)

await app.start()
await app.stop()
```

## Errors

| Situation | Result |
| --- | --- |
| Unbound `Token` | `No provider for token: Name` |
| Construction-time or concurrent async cycle | `Circular dependency detected: A -> B -> A` |
| Invalid inject key | `Invalid inject key received` |
| Invalid root provider input | `Invalid provider input received` thrown by `bootstrapApp()` before an `App` exists |
| `inject` after `stop()` | `Cannot inject after the app has stopped`, before cache lookup or key validation |
| `onDispose` after factory completion | `onDispose can only be called while the factory is running` |
| `onDispose` after `stop()` | `Cannot register cleanup after the app has stopped` |
| `start()` on a stopped app | `Cannot start an app that has been stopped` |
| Synchronous provider failure | `inject()` throws; the caller may catch it |
| Async provider failure | Its `inject()` Promise rejects; the caller may catch it |
| Root factory failure | `start()` rejects after registered cleanup runs |
| Root factory returns a value | Type error: the root factory must return `void` |
| Cleanup failure | Rejects `stop()`, and `start()` too when it triggered the stop |

Handles returned by `token`, `provide`, `provideFor`, and `bundleProviders` are frozen opaque objects. A copied object is rejected. This is an in-process kernel for trusted application code, not a JavaScript sandbox.

Nested provider inputs are validated when their subtree is first resolved. Invalid nested input throws from that `inject()` call; if the root does not handle the error, `start()` rejects.

## Public API

Signatures below omit the opaque brands on handles; create them with the exported functions.

```ts
interface Token<T> {}
interface Ref<T> extends Token<T> {}
interface ProviderDef<T> {}
interface ProviderBundle {}

type RefType<T> = T extends Ref<infer U> ? U : never
type InjectKey<T> = Token<T> | Ref<T>
type ProviderInput = Ref<unknown> | ProviderDef<unknown> | ProviderBundle | readonly ProviderInput[]
type ProviderOptions = { providers?: readonly ProviderInput[] }
type InjectFn = <T>(key: InjectKey<T>) => T
type OnDisposeFn = (fn: () => void | Promise<void>) => void

interface Context {
  inject: InjectFn
  onDispose: OnDisposeFn
}

type Factory<T> = (ctx: Context) => T
type BootstrapAppFn = (ctx: Context) => void | Promise<void>
interface BootstrapAppOptions { providers?: readonly ProviderInput[] }

interface App extends AsyncDisposable {
  start(): Promise<void>                 // idempotent; rejects once the app is stopped
  stop(): Promise<void>                  // idempotent
  [Symbol.asyncDispose](): Promise<void> // same operation as stop()
}

function token<T>(description?: string): Token<T>
function provide<T>(factory: Factory<T>, options?: ProviderOptions): Ref<T>
function provideFor<T>(key: InjectKey<T>, factory: Factory<T>, options?: ProviderOptions): ProviderDef<T>
function bundleProviders(...inputs: ProviderInput[]): ProviderBundle
function isProvideRef(value: unknown): value is Ref<unknown>
function bootstrapApp(fn: BootstrapAppFn, options?: BootstrapAppOptions): App
```

## Development

Install repository dependencies before running the checks:

```bash
bun install
bun test
bun run test:coverage
bun run type-check
bun run lint
bun run build
```
