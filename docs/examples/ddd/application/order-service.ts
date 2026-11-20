import { provide } from 'dn-ioc'
import { type Order, orderRepositoryToken } from '../domain/order'
import { clockToken, mailerToken } from '../domain/ports'

export const orderServiceRef = provide(({ inject }) => {
  const orders = inject(orderRepositoryToken) // [!hl]
  const clock = inject(clockToken) // [!hl]
  const mailer = inject(mailerToken) // [!hl]

  return {
    async submit(id: string): Promise<Order> {
      const order = await orders.find(id)
      if (!order) {
        throw new Error(`Order ${id} not found`)
      }
      if (order.status === 'submitted') {
        throw new Error(`Order ${id} already submitted`)
      }

      const submitted: Order = {
        ...order,
        status: 'submitted',
        submittedAt: clock.now(),
      }

      await orders.save(submitted)
      await mailer.sendOrderConfirmation(submitted.customerEmail, submitted.id)
      return submitted
    },
  }
})
