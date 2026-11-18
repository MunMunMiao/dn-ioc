import { createServer } from 'node:http'
import { bootstrapApp, provide } from 'dn-ioc'

export const serverRef = provide(({ onDispose }) => {
  const server = createServer().listen(3000)
  onDispose(() => new Promise<void>(resolve => server.close(() => resolve()))) // [!hl]
  return server
})

export const app = bootstrapApp(({ inject }) => {
  inject(serverRef)
})

// Register signal listeners before start() — bootstrapApp() runs nothing yet
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.stop()) // [!hl]
}

await app.start()
