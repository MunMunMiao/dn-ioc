import { bootstrapApp, provide } from 'dn-ioc'

// #region unmount
export const socketRef = provide(({ onDispose }) => {
  const socket = new WebSocket('wss://example.com/live')
  onDispose(() => {
    socket.close() // [!hl]
  })
  return socket
})

export function mountLiveWidget() {
  const app = bootstrapApp(({ inject }) => {
    inject(socketRef)
  })
  const ready = app.start()

  // Call from React useEffect cleanup, Vue onScopeDispose, or router leave hook
  return async function unmount() {
    await ready
    await app.stop() // [!hl]
  }
}
// #endregion

// #region pagehide
export const sessionRef = provide(({ onDispose }) => {
  const sessionId = crypto.randomUUID()
  // Keep unload hooks synchronous — browsers may discard async work on unload
  onDispose(() => {
    navigator.sendBeacon('/session/end', sessionId) // [!hl]
  })
  return sessionId
})

export const pageApp = bootstrapApp(({ inject }) => {
  inject(sessionRef)
})

addEventListener('pagehide', () => void pageApp.stop()) // [!hl]

await pageApp.start()
// #endregion
