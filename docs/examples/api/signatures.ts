import {
  bootstrapApp,
  bundleProviders,
  isProvideRef,
  type ProviderBundle,
  type ProviderDef,
  provide,
  provideFor,
  type Ref,
  type Token,
  token,
} from 'dn-ioc'

// #region types
export type { ProviderBundle, ProviderDef, Ref, Token }

export type RefType<T> = T extends Ref<infer U> ? U : never
export type InjectKey<T> = Token<T> | Ref<T>
export type ProviderInput = Ref<unknown> | ProviderDef<unknown> | ProviderBundle | readonly ProviderInput[]

export type ProviderOptions = {
  providers?: readonly ProviderInput[]
}

export type InjectFn = <T>(key: InjectKey<T>) => T
export type OnDisposeFn = (fn: () => void | Promise<void>) => void

export interface Context {
  inject: InjectFn
  onDispose: OnDisposeFn
}

export type Factory<T> = (ctx: Context) => T
export type BootstrapAppFn = (ctx: Context) => void | Promise<void>

export interface BootstrapAppOptions {
  providers?: readonly ProviderInput[]
}

export interface App extends AsyncDisposable {
  start(): Promise<void> // idempotent; rejects once the app is stopped
  stop(): Promise<void> // idempotent
}
// #endregion

// #region functions
export const publicApi = {
  token: token satisfies <T>(description?: string) => Token<T>, // [!hl]
  provide: provide satisfies <T>(factory: Factory<T>, options?: ProviderOptions) => Ref<T>, // [!hl]
  provideFor: provideFor satisfies <T>(key: InjectKey<T>, factory: Factory<T>, options?: ProviderOptions) => ProviderDef<T>, // [!hl]
  bundleProviders: bundleProviders satisfies (...inputs: ProviderInput[]) => ProviderBundle, // [!hl]
  isProvideRef: isProvideRef satisfies (value: unknown) => value is Ref<unknown>, // [!hl]
  bootstrapApp: bootstrapApp satisfies (fn: BootstrapAppFn, options?: BootstrapAppOptions) => App, // [!hl]
}
// #endregion
