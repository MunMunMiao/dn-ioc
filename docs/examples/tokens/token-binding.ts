import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

// #region bound
export const prefixToken = token<string>('Prefix') // [!hl]

export const formatterRef = provide(({ inject }) => {
  const prefix = inject(prefixToken) // [!hl]
  return {
    format: (value: string) => `${prefix}${value}`,
  }
})

export const boundApp = bootstrapApp(
  ({ inject }) => {
    console.log(inject(formatterRef).format('ready')) // [app] ready
  },
  {
    providers: [provideFor(prefixToken, () => '[app] '), formatterRef], // [!hl]
  },
)

await boundApp.start()
// #endregion

// #region unbound
export const databaseUrlToken = token<string>('DatabaseUrl') // [!hl]

export const unboundApp = bootstrapApp(({ inject }) => {
  inject(databaseUrlToken)
})

try {
  await unboundApp.start()
} catch (error) {
  console.error((error as Error).message) // No provider for token: DatabaseUrl // [!hl]
}
// #endregion
