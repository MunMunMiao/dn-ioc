import { bootstrapApp } from 'dn-ioc'
import { orderServiceRef } from './application/order-service'
import { infraProviders } from './infra/providers'

// Composition Root: the only module that imports both application and infra
export const app = bootstrapApp(
  async ({ inject }) => {
    const orders = inject(orderServiceRef) // [!hl]
    const submitted = await orders.submit('ord-1')
    console.log(submitted.status) // submitted
  },
  {
    providers: [infraProviders], // [!hl]
  },
)

await app.start()
await app.stop()
