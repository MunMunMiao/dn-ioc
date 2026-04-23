import { bootstrapApp, type ProviderInput, provide, provideFor, type Token, token } from '../src'

const stringToken = token<string>('StringToken')
const promiseSettingsToken = token<Promise<{ ready: boolean }>>('Settings')

await bootstrapApp(
  async ({ inject }) => {
    const settings = await inject(promiseSettingsToken)
    return settings.ready
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

await bootstrapApp(async ({ inject }) => {
  const value = await inject(asyncRef)
  return value.ready
})

// @ts-expect-error empty objects are not valid tokens
const fakeToken: Token<string> = {}

// @ts-expect-error empty objects are not valid provider inputs
const fakeProviderInput: ProviderInput = {}

// @ts-expect-error provider factory must return the token value type
provideFor(stringToken, () => 123)

// @ts-expect-error async token factories must use Token<Promise<T>>
provideFor(stringToken, async () => 'value')

await bootstrapApp(() => 'ok', {
  providers: [
    // @ts-expect-error provider objects must come from provide/provideFor/bundleProviders
    {},
  ],
})

void fakeToken
void fakeProviderInput
