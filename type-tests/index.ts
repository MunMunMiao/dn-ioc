import { bootstrapApp, type ProviderInput, provide, provideFor, type RefType, type Token, token } from '../src'

const stringToken = token<string>('StringToken')
const promiseSettingsToken = token<Promise<{ ready: boolean }>>('Settings')

bootstrapApp(
  async ({ inject }) => {
    const settings = await inject(promiseSettingsToken)
    void settings.ready
  },
  {
    providers: [
      provideFor(promiseSettingsToken, async () => {
        return { ready: true }
      }),
    ],
  },
)

const asyncRef = provide(async () => {
  return { ready: true }
})

const asyncApp = bootstrapApp(async ({ inject }) => {
  const pending: RefType<typeof asyncRef> = inject(asyncRef)
  const typedPending: Promise<{ ready: boolean }> = pending
  const value = await typedPending
  void value.ready
})
const asyncResult: Promise<void> = asyncApp.start()
void asyncResult

const syncRef = provide(() => ({ ready: true }))
const syncApp = bootstrapApp(({ inject }) => {
  const value: RefType<typeof syncRef> = inject(syncRef)
  const ready: boolean = value.ready
  void ready
})
const syncResult: Promise<void> = syncApp.start()
const stopping: Promise<void> = syncApp.stop()
const scoped: AsyncDisposable = syncApp
void syncResult
void stopping
void scoped

// @ts-expect-error an app handle is not itself a promise
const notAwaitable: Promise<void> = syncApp
void notAwaitable

// The root factory produces no value: results leave through the graph, not through start().
bootstrapApp(() => undefined)
bootstrapApp(({ inject }) => {
  inject(syncRef)
})
bootstrapApp(async ({ inject }) => {
  await inject(asyncRef)
})

// @ts-expect-error the root factory may not return a value
bootstrapApp(({ inject }) => inject(syncRef))
// @ts-expect-error an async root factory may not resolve to a value
bootstrapApp(async () => 42)
// @ts-expect-error a returned Promise must resolve to void
bootstrapApp(() => Promise.resolve(1))

// A cleanup hook must resolve to nothing: void, or a Promise<void> that stop() awaits.
const cleanupShapes = provide(({ onDispose }) => {
  const set = new Set<string>(['key'])
  onDispose(() => undefined)
  onDispose(() => {
    set.delete('key')
  })
  onDispose(async () => {
    await Promise.resolve()
  })
  onDispose(() => new Promise<void>(resolve => resolve()))
  return set
})
void cleanupShapes

// Anything else is rejected, so a discarded return value has to be discarded on purpose.
provide(({ onDispose }) => {
  const set = new Set<string>(['key'])
  // @ts-expect-error a hook may not return a value
  onDispose(() => set.delete('key'))
  // @ts-expect-error a hook may not return a value
  onDispose(() => set)
  // @ts-expect-error an async hook may not resolve to a value
  onDispose(async () => 42)
  // @ts-expect-error a returned Promise must resolve to void
  onDispose(() => Promise.resolve(1))
  return set
})

// @ts-expect-error empty objects are not valid tokens
const fakeToken: Token<string> = {}

// @ts-expect-error empty objects are not valid provider inputs
const fakeProviderInput: ProviderInput = {}

// @ts-expect-error provider factory must return the token value type
provideFor(stringToken, () => 123)

// @ts-expect-error async token factories must use Token<Promise<T>>
provideFor(stringToken, async () => 'value')

const app = bootstrapApp(() => undefined, {
  providers: [
    // @ts-expect-error provider objects must come from provide/provideFor/bundleProviders
    {},
  ],
})

const started = bootstrapApp(() => undefined)
await started.start()
await started.stop()

void app

void fakeToken
void fakeProviderInput
