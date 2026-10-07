# dn-ioc

<p align="center">
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/v/dn-ioc?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/dn-ioc"><img src="https://img.shields.io/npm/dm/dn-ioc?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MunMunMiao/dn-ioc/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/MunMunMiao/dn-ioc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MunMunMiao/dn-ioc?color=%23000&style=flat-square" alt="license"></a>
</p>

`dn-ioc` is a small TypeScript dependency-injection kernel. A provider is a factory. `provide()` makes a `Ref` with a default factory. `token()` makes a key that must be bound. `inject()` resolves either one. There is no container, no decorators, and no reflection.

It does not provide modules, request-scoped containers, multi-bindings, or runtime signal listeners.

Documentation: <https://dn-ioc.lyz.cloud/>

## Install

```bash
npm install dn-ioc
pnpm add dn-ioc
yarn add dn-ioc
bun add dn-ioc
deno add npm:dn-ioc
```

Deno can also import `npm:dn-ioc` without installing. The package is ESM-only.

## Start

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

This graph holds no resources, so it does not need `stop()`. Scopes, cleanup, async factories, and the public API are in the docs.

## Development

```bash
bun install
bun test
bun run test:coverage
bun run type-check
bun run lint
bun run build
```
