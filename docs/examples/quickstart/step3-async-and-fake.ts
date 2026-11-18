import { bootstrapApp, provide, provideFor } from 'dn-ioc'

export const settingsRef = provide(async () => ({ greeting: 'hello' })) // [!hl]

export const greeterRef = provide(async ({ inject }) => {
  const settings = await inject(settingsRef) // [!hl]
  return {
    greet: (name: string) => `${settings.greeting}, ${name}`,
  }
})

export const testApp = bootstrapApp(
  async ({ inject }) => {
    const greeter = await inject(greeterRef)
    console.log(greeter.greet('Ada')) // test-hello, Ada
  },
  {
    providers: [provideFor(settingsRef, async () => ({ greeting: 'test-hello' }))], // [!hl]
  },
)

await testApp.start()
await testApp.stop()
