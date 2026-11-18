import { bootstrapApp } from 'dn-ioc'
import { greeterRef } from './step1-provide'

// bootstrapApp() builds the graph handle without running any factory yet
export const app = bootstrapApp(({ inject }) => {
  const greeter = inject(greeterRef) // [!hl]
  console.log(greeter.greet('world')) // hello, world
})

await app.start() // [!hl]
