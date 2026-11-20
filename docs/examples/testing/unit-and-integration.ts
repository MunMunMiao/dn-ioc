import { bootstrapApp, provideFor } from 'dn-ioc'
import { orderServiceRef } from '../ddd/application/order-service'
import { type OrderRepository, orderRepositoryToken } from '../ddd/domain/order'
import { clockToken, type Mailer, mailerToken } from '../ddd/domain/ports'
import { infraProviders } from '../ddd/infra/providers'

// #region unit
export const testOrderSubmitUnit = async () => {
  const sent: string[] = []

  const fakeOrders = (): OrderRepository => ({
    find: async id => ({ id, customerEmail: 'ada@example.com', status: 'draft' }),
    save: async () => undefined,
  })

  const fakeMailer = (): Mailer => ({
    sendOrderConfirmation: async (email, id) => {
      sent.push(`${email}:${id}`)
    },
  })

  // Unit test: install only fakes — a forgotten token rejects start() immediately
  await using app = bootstrapApp(
    async ({ inject }) => {
      const order = await inject(orderServiceRef).submit('ord-unit')
      console.log(order.status, sent.length) // submitted 1
    },
    {
      providers: [
        provideFor(orderRepositoryToken, fakeOrders), // [!hl]
        provideFor(clockToken, () => ({ now: () => new Date('2026-11-18T00:00:00Z') })), // [!hl]
        provideFor(mailerToken, fakeMailer), // [!hl]
      ],
    },
  )

  await app.start()
} // app.stop() runs automatically when the scope exits // [!hl]
// #endregion

// #region integration
export interface SentMail {
  email: string
  orderId: string
}

export const testOrderSubmitIntegration = async () => {
  const outbox: SentMail[] = []
  const fakeMailer = (): Mailer => ({
    async sendOrderConfirmation(email, orderId) {
      outbox.push({ email, orderId })
    },
  })

  // Integration test: list infraProviders first, then overrides after (last-write-wins)
  await using app = bootstrapApp(
    async ({ inject }) => {
      const order = await inject(orderServiceRef).submit('ord-1')
      console.log(order.status, outbox.length) // submitted 1
    },
    {
      providers: [
        infraProviders, // [!hl]
        provideFor(mailerToken, fakeMailer), // [!hl]
      ],
    },
  )

  await app.start()
} // app.stop() runs automatically when the scope exits // [!hl]
// #endregion
