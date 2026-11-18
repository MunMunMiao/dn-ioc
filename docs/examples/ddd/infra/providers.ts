import { bundleProviders } from 'dn-ioc'
import { sqlOrderRepositoryProvider, sqlTableRef } from './sql-order-repository'
import { smtpMailerProvider, systemClockProvider } from './system-adapters'

// One bundle collects every infrastructure adapter; entrypoints install it once
export const infraProviders = bundleProviders(
  sqlTableRef, // [!hl]
  sqlOrderRepositoryProvider, // [!hl]
  systemClockProvider, // [!hl]
  smtpMailerProvider, // [!hl]
)
