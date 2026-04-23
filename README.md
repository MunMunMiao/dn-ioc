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

`dn-ioc` is a lightweight, type-safe dependency injection library for TypeScript.

It keeps the functional core of the library, but uses a more Angular-like installation model:

- `bootstrapApp(fn, { providers })` is the app entry point
- `provide(factory, { providers })` installs local providers for a subtree
- `provideXxx()` style helpers return provider bundles
- `token()` and `provideFor()` are available for pure contracts and explicit binding

## Installation

```bash
bun add dn-ioc
```

## Quick Start

```ts
import { bootstrapApp, provide } from 'dn-ioc'

const configRef = provide(() => ({ greeting: 'hello' }))

const greeterRef = provide(({ inject }) => {
  const config = inject(configRef)

  return {
    greet(name: string) {
      return `${config.greeting}, ${name}`
    },
  }
})

await bootstrapApp(({ inject }) => {
  const greeter = inject(greeterRef)
  console.log(greeter.greet('world'))
})
```

## Mental Model

`dn-ioc` is not a full container framework like Spring or Nest.

It is a DI kernel with two public installation points:

- `bootstrapApp(fn, { providers })`
- `provide(factory, { providers })`

The key rule is:

**Providers are shared within the installation scope where they are installed.**

That means:

- install at app level -> shared by the app root subtree
- install inside a provider -> shared only by that provider subtree
- install again deeper -> the deeper subtree gets a new instance

## Runtime Handles and Security Boundary

`dn-ioc` returns opaque frozen handles from `token()`, `provide()`, `provideFor()`, and `bundleProviders()`.

The public handle objects do not expose internal fields such as factory, id, local providers, or bundle items. Normal user code cannot reassign those internals or forge a valid handle by copying an object shape.

This is still an in-process DI kernel for trusted application code. It is not a JavaScript sandbox and should not be used as the only isolation boundary for untrusted plugins or third-party code.

## Ref vs Token

`Ref` and `Token` look similar from the outside, but they have different jobs.

- `Token<T>`
  - pure contract
  - has no default implementation
  - must be installed explicitly with `provideFor(...)`
- `Ref<T>`
  - self-providing key
  - has a default factory
  - if it is first resolved inside a scope that does not already bind it, that scope gets the default binding

This is why `provide(...)` is still the main abstraction for everyday code, while `token(...)` is better for framework helpers and pure contracts.

## How Scope Is Chosen

When `inject(key)` runs:

1. `dn-ioc` first looks upward for an existing binding.
2. If the key is a `Token`, it must find an explicit binding or it throws.
3. If the key is a `Ref`, it can install its own default factory into the current active installation scope.
4. The resulting instance is cached inside that scope.

This keeps the rule simple:

- explicit installation decides visibility
- first resolution decides where a self-providing `Ref` binds by default

Local providers do not retroactively change a consumer `Ref` that has already been bound or cached in a parent scope. If a local override must affect a consumer service, install or rebind both the dependency and that consumer `Ref` in the same local `providers` list.

## Public API

```ts
interface Token<T> {}
interface Ref<T> extends Token<T> {}

type InjectKey<T> = Token<T> | Ref<T>

type ProviderInput = Ref<unknown> | ProviderDef<unknown> | ProviderBundle | readonly ProviderInput[]

type BootstrapAppFn<TResult> = (ctx: Context) => TResult | Promise<TResult>

interface BootstrapAppOptions {
  providers?: ProviderInput[]
}

interface Context {
  inject<T>(key: InjectKey<T>): T
}

function token<T>(description?: string): Token<T>

function provide<T>(
  factory: (ctx: Context) => T,
  options?: { providers?: ProviderInput[] },
): Ref<T>

function provideFor<T>(
  key: InjectKey<T>,
  factory: (ctx: Context) => T,
  options?: { providers?: ProviderInput[] },
): ProviderDef<T>

function bundleProviders(...inputs: ProviderInput[]): ProviderBundle

function bootstrapApp<TResult>(
  fn: BootstrapAppFn<TResult>,
  options?: BootstrapAppOptions,
): Promise<TResult>
```

## Recommended Authoring Style

The default style is:

- resolve dependencies once at the top of the factory
- return an object that closes over those dependencies

```ts
const formatterRef = provide(({ inject }) => {
  const prefix = inject(prefixRef)
  const suffix = inject(suffixRef)

  return {
    format(value: string) {
      return `${prefix}${value}${suffix}`
    },
  }
})
```

This is the recommended shape for service objects, application services, repositories, and DDD-style orchestration code.

Method-level `inject()` is still valid, but it should be reserved for:

- lazy loading a heavy dependency
- intentionally reading from a deeper local binding
- breaking a circular dependency

## App-Level Installation

Use `bootstrapApp(..., { providers })` when a provider should be visible to the whole app tree.

```ts
import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

const prefixToken = token<string>('Prefix')

const formatterRef = provide(({ inject }) => {
  const prefix = inject(prefixToken)

  return {
    format(value: string) {
      return `${prefix}${value}`
    },
  }
})

await bootstrapApp(
  ({ inject }) => {
    const formatter = inject(formatterRef)
    console.log(formatter.format('demo'))
  },
  {
    providers: [provideFor(prefixToken, () => '[app] ')],
  },
)
```

## Local Installation

Use `provide(factory, { providers })` when a dependency should be visible only to one subtree.

```ts
import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

const labelToken = token<string>('Label')

const rendererRef = provide(({ inject }) => {
  const label = inject(labelToken)
  return { label }
})

const localDemoRef = provide(
  ({ inject }) => {
    const renderer = inject(rendererRef)
    return {
      label: inject(labelToken),
      renderer,
    }
  },
  {
    providers: [provideFor(labelToken, () => 'local-demo')],
  },
)

await bootstrapApp(({ inject }) => {
  const demo = inject(localDemoRef)
  console.log(demo.label)
  console.log(demo.renderer.label)
})
```

The local `labelToken` binding is only visible inside `localDemoRef` and its descendants.

## Installation Functions

Angular-style installation helpers should return a provider bundle.

```ts
import { bundleProviders, provideFor, token } from 'dn-ioc'

const themeToken = token<{ palette: string }>('Theme')
const themeOptionsToken = token<{ palette: string }>('ThemeOptions')

export function provideDemoTheme(options: { palette: string }) {
  return bundleProviders(
    provideFor(themeOptionsToken, () => options),
    provideFor(themeToken, ({ inject }) => {
      const themeOptions = inject(themeOptionsToken)
      return {
        palette: themeOptions.palette,
      }
    }),
  )
}
```

Install it at app level:

```ts
const previewRef = provide(({ inject }) => {
  const theme = inject(themeToken)
  return { theme }
})

await bootstrapApp(
  ({ inject }) => {
    const preview = inject(previewRef)
    console.log(preview.theme.palette)
  },
  {
    providers: [provideDemoTheme({ palette: 'ocean' })],
  },
)
```

Or install it locally:

```ts
const sandboxRef = provide(
  ({ inject }) => {
    const theme = inject(themeToken)
    return { theme }
  },
  {
    providers: [provideDemoTheme({ palette: 'sunset' })],
  },
)
```

If a lower subtree needs a new instance, install `provideDemoTheme(...)` again in that subtree.

## Testing

`provideFor()` is the main test replacement API.

```ts
import { bootstrapApp, provide, provideFor } from 'dn-ioc'

const storageRef = provide(() => ({
  read(key: string) {
    return `prod:${key}`
  },
}))

const serviceRef = provide(({ inject }) => {
  const storage = inject(storageRef)

  return {
    load(key: string) {
      return storage.read(key)
    },
  }
})

const result = await bootstrapApp(
  ({ inject }) => inject(serviceRef).load('demo'),
  {
    providers: [
      provideFor(storageRef, () => ({
        read(key: string) {
          return `mock:${key}`
        },
      })),
    ],
  },
)
```

## Async Inject Semantics

`inject()` always returns the real value produced by the factory.

- sync factory -> sync value
- async factory -> promise

That means users can write:

```ts
const settingsRef = provide(async () => {
  return { ready: true }
})

await bootstrapApp(async ({ inject }) => {
  const settings = await inject(settingsRef)
  console.log(settings.ready)
})
```

The same rule also applies to `provideFor(...)`.

For a pure async contract, put the promise in the token type:

```ts
type Settings = { ready: boolean }

const settingsToken = token<Promise<Settings>>('Settings')

await bootstrapApp(
  async ({ inject }) => {
    const settings = await inject(settingsToken)
    console.log(settings.ready)
  },
  {
    providers: [
      provideFor(settingsToken, async () => {
        return { ready: true }
      }),
    ],
  },
)
```

Using `Token<Settings>` with an async factory is a type error, because `inject(settingsToken)` would otherwise look synchronous while actually returning a promise.

Async results are cached inside the same installation scope. If an async provider rejects, the failure is not cached and a later injection can retry.

## Migration Notes

This version intentionally moves away from the old API:

- `runInInjectionContext` -> replaced by `bootstrapApp`
- `resetGlobalInstances` -> removed
- `overrides` -> replaced by `provideFor`
- `mode: 'global' | 'standalone'` -> removed from the public API

The new rule is:

- install at the root when you want app-level sharing
- install locally when you want subtree sharing
- reinstall deeper when you want a new subtree instance

## Why This Shape

The design borrows the most useful ideas from mainstream DI systems:

- Angular: hierarchical installation and `provideXxx()` helpers
- Spring / .NET: instances belong to a container or scope, not to the whole program
- lightweight TS DI libraries: factory-first, explicit bindings, no heavy reflection

At the same time, it avoids heavier container features such as:

- module graphs
- public service locator APIs
- decorator-driven registration
- large lifecycle matrices

That keeps `dn-ioc` small, explicit, and easy to reason about.
