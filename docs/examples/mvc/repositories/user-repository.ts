import { provide } from 'dn-ioc'
import { databaseRef } from '../db/database'
import type { User } from '../models/user'

export const userRepositoryRef = provide(function UserRepository({ inject }) {
  const db = inject(databaseRef) // [!hl]
  const users = db.collection<User>('users') // [!hl]

  return {
    async findByEmail(email: string): Promise<User | undefined> {
      return users.get(email)
    },
    async create(user: User): Promise<User> {
      users.set(user.email, user)
      return user
    },
  }
})
