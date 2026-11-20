import { bootstrapApp, bundleProviders, isProvideRef, provide, provideFor, token } from 'dn-ioc'

// #region caching
let created = 0
export const configRef = provide(() => ({ id: ++created })) // [!hl]

export const cachingApp = bootstrapApp(
  ({ inject }) => {
    const first = inject(configRef)
    const second = inject(configRef)
    console.log(first === second, created) // true 1
  },
  { providers: [configRef] }, // [!hl]
)

await cachingApp.start()
// #endregion

// #region bundle
export const themeToken = token<{ palette: string }>('Theme')
export const themeOptionsToken = token<{ palette: string }>('ThemeOptions')

export const provideTheme = (options: { palette: string }) => {
  return bundleProviders(
    provideFor(themeOptionsToken, () => options), // [!hl]
    provideFor(themeToken, ({ inject }) => ({
      palette: inject(themeOptionsToken).palette, // [!hl]
    })),
  )
}

export const toolbarRef = provide(({ inject }) => inject(themeToken))

export const bundleApp = bootstrapApp(
  ({ inject }) => {
    console.log(inject(toolbarRef).palette) // ocean
  },
  { providers: [provideTheme({ palette: 'ocean' })] }, // [!hl]
)

await bundleApp.start()
// #endregion

// #region isProvideRef
export const sampleRef = provide(() => 'ok')
export const sampleToken = token<string>('Sample')
export const sampleBinding = provideFor(sampleToken, () => 'ok')
export const sampleBundle = bundleProviders(sampleRef, sampleBinding)

console.log(isProvideRef(sampleRef)) // true // [!hl]
console.log(isProvideRef(sampleToken)) // false
console.log(isProvideRef(sampleBinding)) // false
console.log(isProvideRef(sampleBundle)) // false
console.log(isProvideRef({ ...sampleRef })) // false (copied object is rejected)
// #endregion
