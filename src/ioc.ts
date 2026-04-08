const INTERNAL_KIND = Symbol('dn_ioc.kind')

export interface Token<T> {
  readonly __dnIocToken__?: T
}

export interface Ref<T> extends Token<T> {
  readonly __dnIocRef__?: true
}

export interface ProviderDef<T> {
  readonly __dnIocProviderDef__?: T
}

export interface ProviderBundle {
  readonly __dnIocProviderBundle__?: true
}

export type RefType<T> = T extends Ref<infer U> ? U : never

export type InjectKey<T> = Token<T> | Ref<T>

export type ProviderInput = Ref<unknown> | ProviderDef<unknown> | ProviderBundle | readonly ProviderInput[]

export type ProviderOptions = {
  providers?: ProviderInput[]
}

export type InjectFn = <T>(key: InjectKey<T>) => T

export interface Context {
  inject: InjectFn
}

export type Factory<T> = (ctx: Context) => T

export type BootstrapAppFn<TResult> = (ctx: Context) => TResult | Promise<TResult>

export interface BootstrapAppOptions {
  providers?: ProviderInput[]
}

type InternalKind = 'token' | 'ref' | 'binding' | 'bundle'

interface InternalToken<T> extends Token<T> {
  [INTERNAL_KIND]: 'token'
  description?: string
  id: symbol
}

interface InternalRef<T> extends Ref<T> {
  [INTERNAL_KIND]: 'ref'
  description?: string
  factory: Factory<T>
  id: symbol
  providers?: ProviderInput[]
}

interface InternalProviderDef<T> extends ProviderDef<T> {
  [INTERNAL_KIND]: 'binding'
  factory: Factory<T>
  key: InternalKey<T>
  providers?: ProviderInput[]
}

interface InternalProviderBundle extends ProviderBundle {
  [INTERNAL_KIND]: 'bundle'
  items: readonly ProviderInput[]
}

type InternalKey<T> = InternalToken<T> | InternalRef<T>
type InternalProvider = InternalRef<unknown> | InternalProviderDef<unknown>
type InternalRuntimeValue = InternalToken<unknown> | InternalRef<unknown> | InternalProviderDef<unknown> | InternalProviderBundle

interface ScopeNode {
  parent?: ScopeNode
  bindings: Map<symbol, InternalProviderDef<unknown>>
  instances: Map<symbol, unknown>
  attachedChildScopes: Map<symbol, ScopeNode>
}

export function token<T>(description?: string): Token<T> {
  return createTokenInternal(description)
}

export function provide<T>(factory: Factory<T>, options?: ProviderOptions): Ref<T> {
  return createRefInternal(factory, options?.providers)
}

export function provideFor<T>(key: InjectKey<T>, factory: Factory<T>, options?: ProviderOptions): ProviderDef<T> {
  return createProviderDefInternal(asInternalKey(key), factory, options?.providers)
}

export function bundleProviders(...inputs: ProviderInput[]): ProviderBundle {
  return createProviderBundleInternal(inputs)
}

export function isProvideRef(value: unknown): value is Ref<unknown> {
  return getInternalKind(value) === 'ref'
}

export async function bootstrapApp<TResult>(fn: BootstrapAppFn<TResult>, options?: BootstrapAppOptions): Promise<TResult> {
  const rootScope = createScope()
  installProviders(rootScope, options?.providers ?? [])

  return await fn({
    inject: key => resolve(key, rootScope, []),
  })
}

function createScope(parent?: ScopeNode): ScopeNode {
  return {
    attachedChildScopes: new Map(),
    bindings: new Map(),
    instances: new Map(),
    parent,
  }
}

function createTokenInternal<T>(description?: string): InternalToken<T> {
  return {
    [INTERNAL_KIND]: 'token',
    description,
    id: Symbol(description),
  }
}

function createRefInternal<T>(factory: Factory<T>, providers?: ProviderInput[]): InternalRef<T> {
  return {
    [INTERNAL_KIND]: 'ref',
    description: factory.name || undefined,
    factory,
    id: Symbol(factory.name || 'ref'),
    providers,
  }
}

function createProviderDefInternal<T>(key: InternalKey<T>, factory: Factory<T>, providers?: ProviderInput[]): InternalProviderDef<T> {
  return {
    [INTERNAL_KIND]: 'binding',
    factory,
    key,
    providers,
  }
}

function createProviderBundleInternal(items: readonly ProviderInput[]): InternalProviderBundle {
  return {
    [INTERNAL_KIND]: 'bundle',
    items,
  }
}

function getInternalKind(value: unknown): InternalKind | undefined {
  if (typeof value !== 'object' || value === null || !(INTERNAL_KIND in value)) {
    return undefined
  }

  return (value as InternalRuntimeValue)[INTERNAL_KIND]
}

function asInternalKey<T>(key: InjectKey<T>): InternalKey<T> {
  const kind = getInternalKind(key)
  if (kind === 'token' || kind === 'ref') {
    return key as InternalKey<T>
  }

  throw new Error('Invalid inject key received')
}

function isInternalProviderDef(value: unknown): value is InternalProviderDef<unknown> {
  return getInternalKind(value) === 'binding'
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function'
  )
}

function getKeyName(key: InternalKey<unknown>): string {
  return key.description || '<anonymous>'
}

function formatCircularDependency(stack: InternalKey<unknown>[], key: InternalKey<unknown>): string {
  const startIndex = stack.indexOf(key)
  const cycle = [...stack.slice(startIndex >= 0 ? startIndex : 0), key].map(getKeyName).join(' -> ')
  return `Circular dependency detected: ${cycle}`
}

function flattenProviders(inputs: readonly ProviderInput[]): InternalProvider[] {
  const flattened: InternalProvider[] = []

  for (const input of inputs) {
    if (Array.isArray(input)) {
      flattened.push(...flattenProviders(input))
      continue
    }

    if (getInternalKind(input) === 'bundle') {
      flattened.push(...flattenProviders((input as InternalProviderBundle).items))
      continue
    }

    if (getInternalKind(input) === 'ref' || isInternalProviderDef(input)) {
      flattened.push(input as InternalProvider)
      continue
    }

    throw new Error('Invalid provider input received')
  }

  return flattened
}

function installProviders(scope: ScopeNode, inputs: readonly ProviderInput[]): void {
  for (const provider of flattenProviders(inputs)) {
    const binding =
      getInternalKind(provider) === 'ref'
        ? createProviderDefInternal(provider as InternalRef<unknown>, (provider as InternalRef<unknown>).factory, provider.providers)
        : (provider as InternalProviderDef<unknown>)

    scope.bindings.set(binding.key.id, binding)
  }
}

function findBindingScope(start: ScopeNode, key: InternalKey<unknown>): ScopeNode | undefined {
  let current: ScopeNode | undefined = start

  while (current) {
    if (current.bindings.has(key.id)) {
      return current
    }

    current = current.parent
  }

  return undefined
}

function ensureRefBindingInScope(ref: InternalRef<unknown>, scope: ScopeNode): ScopeNode {
  if (!scope.bindings.has(ref.id)) {
    installProviders(scope, [ref])
  }

  return scope
}

function findOrCreateBindingScope(key: InternalKey<unknown>, activeScope: ScopeNode): ScopeNode {
  const existingScope = findBindingScope(activeScope, key)
  if (existingScope) {
    return existingScope
  }

  if (getInternalKind(key) === 'token') {
    throw new Error(`No provider for token: ${getKeyName(key)}`)
  }

  return ensureRefBindingInScope(key as InternalRef<unknown>, activeScope)
}

function ensureAttachedScope(ownerScope: ScopeNode, binding: InternalProviderDef<unknown>): ScopeNode {
  if (!binding.providers?.length) {
    return ownerScope
  }

  let childScope = ownerScope.attachedChildScopes.get(binding.key.id)
  if (!childScope) {
    childScope = createScope(ownerScope)
    installProviders(childScope, binding.providers)
    ownerScope.attachedChildScopes.set(binding.key.id, childScope)
  }

  return childScope
}

function createInject(
  scope: ScopeNode,
  stack: InternalKey<unknown>[],
): {
  deactivate: () => void
  inject: InjectFn
} {
  let active = true

  return {
    deactivate: () => {
      active = false
    },
    inject: <T>(key: InjectKey<T>): T => resolve(key, scope, active ? stack : []),
  }
}

function resolveCachedOrCreate<T>(
  key: InternalKey<T>,
  binding: InternalProviderDef<T>,
  resolutionScope: ScopeNode,
  stack: InternalKey<unknown>[],
): T {
  if (resolutionScope.instances.has(key.id)) {
    return resolutionScope.instances.get(key.id) as T
  }

  const nextStack = [...stack, key]
  const { deactivate, inject } = createInject(resolutionScope, nextStack)

  try {
    const value = binding.factory({ inject }) as T

    if (isPromiseLike(value)) {
      const pending = Promise.resolve(value).then(
        resolved => {
          deactivate()
          return resolved
        },
        error => {
          if (resolutionScope.instances.get(key.id) === pending) {
            resolutionScope.instances.delete(key.id)
          }
          deactivate()
          throw error
        },
      )

      resolutionScope.instances.set(key.id, pending)
      return pending as T
    }

    resolutionScope.instances.set(key.id, value)
    deactivate()
    return value
  } catch (error) {
    deactivate()
    resolutionScope.instances.delete(key.id)
    throw error
  }
}

function resolve<T>(key: InjectKey<T>, activeScope: ScopeNode, stack: InternalKey<unknown>[]): T {
  const internalKey = asInternalKey(key)

  if (stack.includes(internalKey)) {
    throw new Error(formatCircularDependency(stack, internalKey))
  }

  // Tokens must be installed explicitly. Refs are self-providing and bind
  // their default factory into the current active installation scope.
  const bindingScope = findOrCreateBindingScope(internalKey, activeScope)
  const binding = bindingScope.bindings.get(internalKey.id) as InternalProviderDef<T>
  const resolutionScope = ensureAttachedScope(bindingScope, binding)

  return resolveCachedOrCreate(internalKey, binding, resolutionScope, stack)
}
