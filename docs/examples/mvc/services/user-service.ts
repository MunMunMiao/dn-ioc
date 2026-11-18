import { provide } from 'dn-ioc'
import type { User } from '../models/user'
import { userRepositoryRef } from '../repositories/user-repository'

export const userServiceRef = provide(function UserService({ inject }) {
  const users = inject(userRepositoryRef) // [!hl]

  return {
    async register(email: string, name: string): Promise<User> {
      if (!email.includes('@')) {
        throw new Error('Invalid email')
      }
      if (await users.findByEmail(email)) {
        throw new Error('Email already taken')
      }
      return users.create({
        id: `usr_${email}`,
        email,
        name,
      })
    },
  }
})
