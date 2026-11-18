import { provide, provideFor } from 'dn-ioc'
import { type Order, orderRepositoryToken } from '../domain/order'

// Private infrastructure client — never imported by domain or application
export const sqlTableRef = provide(function SqlOrderTable({ onDispose }) {
  const rows = new Map<string, Order>([['ord-1', { id: 'ord-1', customerEmail: 'ada@example.com', status: 'draft' }]])
  onDispose(() => {
    rows.clear()
  })
  return rows
})

export const sqlOrderRepositoryProvider = provideFor(orderRepositoryToken, ({ inject }) => {
  const rows = inject(sqlTableRef) // [!hl]
  return {
    find: async id => rows.get(id),
    save: async order => {
      rows.set(order.id, order)
    },
  }
})
