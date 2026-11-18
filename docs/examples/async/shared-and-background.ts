import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

// #region shared
export const settingsRef = provide(async () => ({ status: 'ready' as const })) // [!hl]

export const sharedApp = bootstrapApp(async ({ inject }) => {
  const first = inject(settingsRef) // [!hl]
  const second = inject(settingsRef) // [!hl]
  console.log(first === second) // true
  console.log((await first).status) // ready
})

await sharedApp.start()
await sharedApp.stop()
// #endregion

// #region background
export const warmupRef = provide(async () => 'cache-warmed')

export let warmupTask!: Promise<string>

export const backgroundApp = bootstrapApp(({ inject }) => {
  // Started without await: start() does not wait for warmupTask to settle
  warmupTask = inject(warmupRef) // [!hl]
})

await backgroundApp.start()
console.log(await warmupTask) // cache-warmed // [!hl]
await backgroundApp.stop()
// #endregion

// #region asyncToken
export interface Settings {
  ready: boolean
}

export const settingsToken = token<Promise<Settings>>('Settings') // [!hl]

export const asyncTokenApp = bootstrapApp(
  async ({ inject }) => {
    const settings = await inject(settingsToken) // [!hl]
    console.log(settings.ready) // true
  },
  {
    providers: [provideFor(settingsToken, async () => ({ ready: true }))], // [!hl]
  },
)

await asyncTokenApp.start()
await asyncTokenApp.stop()
// #endregion
