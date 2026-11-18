import { token } from 'dn-ioc'

export interface Order {
  id: string
  customerEmail: string
  status: 'draft' | 'submitted'
  submittedAt?: Date
}

export interface OrderRepository {
  find(id: string): Promise<Order | undefined>
  save(order: Order): Promise<void>
}

export const orderRepositoryToken = token<OrderRepository>('OrderRepository') // [!hl]
