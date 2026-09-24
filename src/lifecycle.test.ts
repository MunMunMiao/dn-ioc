import { expect, test } from 'bun:test'
import { bootstrapApp, bundleProviders, type InjectFn, type OnDisposeFn, provide, provideFor, token } from './index'

const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const stopped = 'Cannot inject after the app has stopped'

test('stop immediately closes root, cached, pending, parent and private injection without acquisition', async () => {
  let acquired = 0
  const warm = provide(() => ({ ready: true }))
  const cold = provide(() => ++acquired)
  const gate = Promise.withResolvers<void>()
  const pending = provide(async () => {
    await gate.promise
    return 'pending value'
  })
  const localKey = token<number>('local')
  const localCold = token<number>('local cold')
  const child = provide(({ inject }) => inject, {
    providers: [
      bundleProviders(
        provideFor(localKey, () => 7),
        provideFor(localCold, () => ++acquired),
      ),
    ],
  })
  let service!: { inject: InjectFn; child: InjectFn; warm: { ready: boolean }; pending: Promise<string> }
  const app = bootstrapApp(({ inject }) => {
    service = { inject, child: inject(child), warm: inject(warm), pending: inject(pending) }
  })
  await app.start()
  expect(service.child(localKey)).toBe(7)
  expect(service.child(warm)).toBe(service.warm)

  const stopping = app.stop()
  for (const inject of [service.inject, service.child]) {
    for (const key of [warm, cold, pending]) {
      expect(() => inject(key as typeof cold)).toThrow(stopped)
    }
  }
  expect(() => service.child(localKey)).toThrow(stopped)
  expect(() => service.child(localCold)).toThrow(stopped)
  expect(acquired).toBe(0)

  gate.resolve()
  await expect(service.pending).resolves.toBe('pending value')
  await stopping
})

test('a cleanup cannot inject cached dependencies and later hooks still execute', async () => {
  const order: string[] = []
  const dependency = provide(() => 'cached')
  const app = bootstrapApp(({ inject, onDispose }) => {
    inject(dependency)
    onDispose(() => {
      order.push('remaining')
    })
    onDispose(() => {
      order.push('attempt')
      inject(dependency)
    })
  })
  await app.start()

  await expect(app.stop()).rejects.toThrow(stopped)
  expect(order).toEqual(['attempt', 'remaining'])
})

test('a cleanup cannot register another cleanup', async () => {
  let savedOnDispose!: OnDisposeFn
  const app = bootstrapApp(({ onDispose }) => {
    savedOnDispose = onDispose
    onDispose(() => {
      savedOnDispose(() => undefined)
    })
  })
  await app.start()

  await expect(app.stop()).rejects.toThrow('onDispose can only be called while the factory is running')
})

test('stop does not wait for a detached factory that never settles', async () => {
  const factory = Promise.withResolvers<void>()
  let closed = false
  const ref = provide(async () => {
    await factory.promise
    await new Promise(() => undefined)
  })
  let provider!: Promise<void>
  const app = bootstrapApp(({ inject, onDispose }) => {
    onDispose(() => {
      closed = true
    })
    provider = inject(ref)
  })
  await app.start()
  let settled = false
  const observed = provider.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  void observed

  await app.stop()
  factory.resolve()
  await tick()

  expect(closed).toBe(true)
  expect(settled).toBe(false)
})

test('a detached provider that fails after stop reports its own error unchanged', async () => {
  const factory = Promise.withResolvers<void>()
  const failure = new Error('provider failed')
  const ref = provide(async () => {
    await factory.promise
    throw failure
  })
  let provider!: Promise<never>
  const app = bootstrapApp(({ inject }) => {
    provider = inject(ref)
  })

  await app.start()
  await app.stop()
  factory.resolve()

  await expect(provider).rejects.toBe(failure)
})

test('a provider still running at stop cannot register cleanup, and the root reports it', async () => {
  const factory = Promise.withResolvers<void>()
  let registered = false
  const ref = provide(async ({ onDispose }) => {
    await factory.promise
    onDispose(() => {
      registered = true
    })
    return 'provider value'
  })
  const app = bootstrapApp(async ({ inject }) => {
    await inject(ref)
  })

  const done = app.start()
  await app.stop()
  factory.resolve()

  await expect(done).rejects.toThrow('Cannot register cleanup after the app has stopped')
  expect(registered).toBe(false)
})
