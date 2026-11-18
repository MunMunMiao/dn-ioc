import { bootstrapApp } from 'dn-ioc'
import { userControllerRef } from './controllers/user-controller'
import { databaseRef } from './db/database'

export const app = bootstrapApp(
  async ({ inject }) => {
    const controller = inject(userControllerRef) // [!hl]
    const response = await controller.postRegister({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    })
    console.log(response.status, response.body.id) // 201 usr_ada@example.com
  },
  {
    // Install stateful connection refs at the root so every subtree shares one pool
    providers: [databaseRef], // [!hl]
  },
)

await app.start()
await app.stop()
