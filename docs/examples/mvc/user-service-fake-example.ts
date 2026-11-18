import { bootstrapApp, provideFor } from 'dn-ioc'
import type { User } from './models/user'
import { userRepositoryRef } from './repositories/user-repository'
import { userServiceRef } from './services/user-service'

const stored = new Map<string, User>()

const fakeUserRepository = () => ({
  findByEmail: async (email: string) => stored.get(email),
  create: async (user: User) => {
    stored.set(user.email, user)
    return user
  },
})

export const testApp = bootstrapApp(
  async ({ inject }) => {
    const service = inject(userServiceRef)
    const created = await service.register('grace@example.com', 'Grace Hopper')
    console.log(created.email, stored.size) // grace@example.com 1
  },
  {
    providers: [provideFor(userRepositoryRef, fakeUserRepository)], // [!hl]
  },
)

await testApp.start()
await testApp.stop()
