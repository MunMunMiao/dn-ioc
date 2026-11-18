import { provideFor } from 'dn-ioc'
import { clockToken, type Mailer, mailerToken } from '../domain/ports'

const smtpMailer: Mailer = {
  async sendOrderConfirmation(email, orderId) {
    // Stands in for an SMTP or transactional email HTTP client
    void email
    void orderId
  },
}

export const systemClockProvider = provideFor(clockToken, () => ({ now: () => new Date() })) // [!hl]
export const smtpMailerProvider = provideFor(mailerToken, () => smtpMailer) // [!hl]
