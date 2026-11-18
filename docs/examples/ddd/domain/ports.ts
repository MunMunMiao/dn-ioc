import { token } from 'dn-ioc'

export interface Clock {
  now(): Date
}

export interface Mailer {
  sendOrderConfirmation(email: string, orderId: string): Promise<void>
}

export const clockToken = token<Clock>('Clock') // [!hl]
export const mailerToken = token<Mailer>('Mailer') // [!hl]
