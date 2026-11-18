import { bootstrapApp, provide } from 'dn-ioc'

export const configRef = provide(() => ({ greeting: 'hello' })) // [!hl]

export const greeterRef = provide(({ inject }) => {
  const config = inject(configRef) // [!hl]
  return { greet: (name: string) => `${config.greeting}, ${name}` }
})

export const app = bootstrapApp(({ inject }) => {
  console.log(inject(greeterRef).greet('world')) // hello, world
})

await app.start() // [!hl]
