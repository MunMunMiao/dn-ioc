import { bootstrapApp, type Context, provide } from 'dn-ioc'

// #region dispose
export const storeRef = provide(() => ({ closed: false }))

export const serviceRef = provide(({ inject, onDispose }) => {
  const store = inject(storeRef) // [!hl]
  onDispose(async () => {
    store.closed = true // [!hl]
  })
  return {
    read: () => inject(storeRef).closed,
  }
})

export let service!: { read: () => boolean }

export const disposeApp = bootstrapApp(({ inject }) => {
  service = inject(serviceRef)
})

await disposeApp.start()
console.log(service.read()) // false (deferred inject works while running)
await disposeApp.stop() // [!hl]
// service.read() -> throws "Cannot inject after the app has stopped"
// #endregion

// #region awaitUsing
export const workerRef = provide(({ onDispose }) => {
  let stopped = false
  onDispose(async () => {
    stopped = true
  })
  return {
    get isStopped() {
      return stopped
    },
  }
})

export const startWorker = ({ inject }: Context) => {
  inject(workerRef)
}

export async function runScopedTask() {
  await using app = bootstrapApp(startWorker) // [!hl]
  await app.start()
} // app.stop() runs automatically here, even on throw // [!hl]
// #endregion
