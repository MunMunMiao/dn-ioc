import { bootstrapApp, provideFor } from 'dn-ioc'
import { orderServiceRef } from './application/order-service'
import { type Order, type OrderRepository, orderRepositoryToken } from './domain/order'
import { clockToken, type Mailer, mailerToken } from './domain/ports'

const saved: Order[] = []
const sentEmails: string[] = []
const fixedNow = new Date('2026-11-18T12:00:00.000Z')

const fakeOrderRepository = (): OrderRepository => ({
  find: async id => ({ id, customerEmail: 'ada@example.com', status: 'draft' }),
  save: async order => {
    saved.push(order)
  },
})

const fakeMailer = (): Mailer => ({
  sendOrderConfirmation: async (email, orderId) => {
    sentEmails.push(`${email}:${orderId}`)
  },
})

export const unitTestApp = bootstrapApp(
  async ({ inject }) => {
    const result = await inject(orderServiceRef).submit('ord-42')
    console.log(result.status, saved.length, sentEmails) // submitted 1 [ 'ada@example.com:ord-42' ]
  },
  {
    // Pure fakes only — forgetting any token fails fast with "No provider for token: <Name>"
    providers: [
      provideFor(orderRepositoryToken, fakeOrderRepository), // [!hl]
      provideFor(clockToken, () => ({ now: () => fixedNow })), // [!hl]
      provideFor(mailerToken, fakeMailer), // [!hl]
    ],
  },
)

await unitTestApp.start()
await unitTestApp.stop()
