import { provide } from 'dn-ioc'

export interface Database {
  collection<T>(name: string): Map<string, T>
  readonly closed: boolean
}

// Stands in for a stateful SQL or document connection pool
export const databaseRef = provide(function Database({ onDispose }): Database {
  const tables = new Map<string, Map<string, unknown>>()
  let closed = false

  onDispose(async () => {
    tables.clear() // [!hl]
    closed = true // [!hl]
  })

  return {
    collection<T>(name: string) {
      let table = tables.get(name) as Map<string, T> | undefined
      if (!table) {
        table = new Map<string, T>()
        tables.set(name, table)
      }
      return table
    },
    get closed() {
      return closed
    },
  }
})
