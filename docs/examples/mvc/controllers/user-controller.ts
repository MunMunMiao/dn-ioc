import { provide } from 'dn-ioc'
import { userServiceRef } from '../services/user-service'

export const userControllerRef = provide(function UserController({ inject }) {
  const userService = inject(userServiceRef) // [!hl]

  return {
    async postRegister(body: { email: string; name: string }) {
      const created = await userService.register(body.email, body.name)
      return { status: 201 as const, body: created }
    },
  }
})
