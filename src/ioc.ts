declare const TOKEN_TYPE: unique symbol
declare const REF_TYPE: unique symbol
declare const PROVIDER_DEF_TYPE: unique symbol
declare const PROVIDER_BUNDLE_TYPE: unique symbol

export interface Token<T> {
  readonly [TOKEN_TYPE]: T
}

export interface Ref<T> extends Token<T> {
  readonly [REF_TYPE]: true
}

export interface ProviderDef<T> {
  readonly [PROVIDER_DEF_TYPE]: T
}

export interface ProviderBundle {
  readonly [PROVIDER_BUNDLE_TYPE]: true
}

export type RefType<T> = T extends Ref<infer U> ? U : never

export type InjectKey<T> = Token<T> | Ref<T>

export type ProviderInput = Ref<unknown> | ProviderDef<unknown> | ProviderBundle | readonly ProviderInput[]

export type ProviderOptions = {
  providers?: readonly ProviderInput[]
}

export type InjectFn = <T>(key: InjectKey<T>) => T

export interface Context {
  inject: InjectFn
}

export type Factory<T> = (ctx: Context) => T

export type BootstrapAppFn<TResult> = (ctx: Context) => TResult | Promise<TResult>

export interface BootstrapAppOptions {
  providers?: readonly ProviderInput[]
}

type InternalKind = 'token' | 'ref' | 'binding' | 'bundle'

interface InternalToken<_T> {
  kind: 'token'
  description?: string
  id: symbol
}

interface InternalRef<T> {
  kind: 'ref'
  description?: string
  factory: Factory<T>
  id: symbol
  providers?: readonly ProviderInput[]
}

interface InternalProviderDef<T> {
  kind: 'binding'
  factory: Factory<T>
  key: InternalKey<T>
  providers?: readonly ProviderInput[]
}

interface InternalProviderBundle {
  kind: 'bundle'
  items: readonly ProviderInput[]
}

type InternalKey<T> = InternalToken<T> | InternalRef<T>
type InternalProvider = InternalRef<unknown> | InternalProviderDef<unknown>
type InternalRuntimeValue = InternalToken<unknown> | InternalRef<unknown> | InternalProviderDef<unknown> | InternalProviderBundle

type ResolvedInstance<T> = {
  state: 'resolved'
  value: T
}

type PendingInstance<T> = {
  dependencies: Set<PendingInstance<unknown>>
  key: InternalKey<T>
  promise: Promise<unknown>
  settled: boolean
  state: 'pending'
}

type InstanceRecord<T> = PendingInstance<T> | ResolvedInstance<T>

interface ScopeNode {
  parent?: ScopeNode
  bindings: Map<symbol, InternalProviderDef<unknown>>
  instances: Map<symbol, InstanceRecord<unknown>>
  attachedChildScopes: Map<symbol, ScopeNode>
}

const keyMetadata = new WeakMap<object, InternalKey<unknown>>()
const providerDefMetadata = new WeakMap<object, InternalProviderDef<unknown>>()
const providerBundleMetadata = new WeakMap<object, InternalProviderBundle>()

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

function createHandle<T extends object>(): T {
  return Object.freeze({}) as T
}

function createTokenInternal<T>(description?: string): Token<T> {
  const handle = createHandle<Token<T>>()
  keyMetadata.set(handle, {
    kind: 'token',
    description,
    id: Symbol(description),
  })
  return handle
}

function createRefInternal<T>(factory: Factory<T>, providers?: readonly ProviderInput[]): Ref<T> {
  const handle = createHandle<Ref<T>>()
  keyMetadata.set(handle, {
    kind: 'ref',
    description: factory.name || undefined,
    factory,
    id: Symbol(factory.name || 'ref'),
    providers: snapshotProviderInputs(providers),
  })
  return handle
}

function createProviderDefInternal<T>(key: InternalKey<T>, factory: Factory<T>, providers?: readonly ProviderInput[]): ProviderDef<T> {
  const handle = createHandle<ProviderDef<T>>()
  providerDefMetadata.set(handle, createProviderDefMetadata(key, factory, providers))
  return handle
}

function createProviderBundleInternal(items: readonly ProviderInput[]): ProviderBundle {
  const handle = createHandle<ProviderBundle>()
  providerBundleMetadata.set(handle, {
    kind: 'bundle',
    items: snapshotProviderInputs(items) ?? Object.freeze([]),
  })
  return handle
}

function createProviderDefMetadata<T>(
  key: InternalKey<T>,
  factory: Factory<T>,
  providers?: readonly ProviderInput[],
): InternalProviderDef<T> {
  return {
    kind: 'binding',
    factory,
    key,
    providers: snapshotProviderInputs(providers),
  }
}

function snapshotProviderInputs(inputs?: readonly ProviderInput[]): readonly ProviderInput[] | undefined {
  if (!inputs) {
    return undefined
  }

  return Object.freeze(inputs.map(snapshotProviderInput))
}

function snapshotProviderInput(input: ProviderInput): ProviderInput {
  if (Array.isArray(input)) {
    return Object.freeze(input.map(snapshotProviderInput)) as readonly ProviderInput[]
  }

  return input
}

function getRuntimeObject(value: unknown): object | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined
  }

  return value
}

function getKeyMetadata(value: unknown): InternalKey<unknown> | undefined {
  const objectValue = getRuntimeObject(value)
  return objectValue ? keyMetadata.get(objectValue) : undefined
}

function getProviderDefMetadata(value: unknown): InternalProviderDef<unknown> | undefined {
  const objectValue = getRuntimeObject(value)
  return objectValue ? providerDefMetadata.get(objectValue) : undefined
}

function getProviderBundleMetadata(value: unknown): InternalProviderBundle | undefined {
  const objectValue = getRuntimeObject(value)
  return objectValue ? providerBundleMetadata.get(objectValue) : undefined
}

function getInternalMetadata(value: unknown): InternalRuntimeValue | undefined {
  return getKeyMetadata(value) ?? getProviderDefMetadata(value) ?? getProviderBundleMetadata(value)
}

function getInternalKind(value: unknown): InternalKind | undefined {
  return getInternalMetadata(value)?.kind
}

function asInternalKey<T>(key: InjectKey<T>): InternalKey<T> {
  const metadata = getKeyMetadata(key)
  if (metadata) {
    return metadata as InternalKey<T>
  }

  throw new Error('Invalid inject key received')
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
  return formatCircularDependencyPath([...stack.slice(startIndex >= 0 ? startIndex : 0), key])
}

function formatCircularDependencyPath(path: InternalKey<unknown>[]): string {
  return `Circular dependency detected: ${path.map(getKeyName).join(' -> ')}`
}

function flattenProviders(inputs: readonly ProviderInput[]): InternalProvider[] {
  const flattened: InternalProvider[] = []

  for (const input of inputs) {
    if (Array.isArray(input)) {
      flattened.push(...flattenProviders(input))
      continue
    }

    const bundle = getProviderBundleMetadata(input)
    if (bundle) {
      flattened.push(...flattenProviders(bundle.items))
      continue
    }

    const key = getKeyMetadata(input)
    if (key?.kind === 'ref') {
      flattened.push(key)
      continue
    }

    const binding = getProviderDefMetadata(input)
    if (binding) {
      flattened.push(binding)
      continue
    }

    throw new Error('Invalid provider input received')
  }

  return flattened
}

function installProviders(scope: ScopeNode, inputs: readonly ProviderInput[]): void {
  for (const provider of flattenProviders(inputs)) {
    const binding = provider.kind === 'ref' ? createProviderDefMetadata(provider, provider.factory, provider.providers) : provider

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
    scope.bindings.set(ref.id, createProviderDefMetadata(ref, ref.factory, ref.providers))
  }

  return scope
}

function findOrCreateBindingScope(key: InternalKey<unknown>, activeScope: ScopeNode): ScopeNode {
  const existingScope = findBindingScope(activeScope, key)
  if (existingScope) {
    return existingScope
  }

  if (key.kind === 'token') {
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

function getCurrentPending(scope: ScopeNode, stack: InternalKey<unknown>[]): PendingInstance<unknown> | undefined {
  const currentKey = stack[stack.length - 1]
  if (!currentKey) {
    return undefined
  }

  const currentRecord = scope.instances.get(currentKey.id)
  if (currentRecord?.state !== 'pending' || currentRecord.settled || currentRecord.key !== currentKey) {
    return undefined
  }

  return currentRecord
}

function findPendingDependencyPath(from: PendingInstance<unknown>, target: PendingInstance<unknown>): InternalKey<unknown>[] | undefined {
  if (from === target) {
    return [from.key]
  }

  for (const dependency of from.dependencies) {
    const path = findPendingDependencyPath(dependency, target)
    if (!path) {
      continue
    }
    return [from.key, ...path]
  }

  return undefined
}

function registerPendingDependency(dependent: PendingInstance<unknown> | undefined, dependency: PendingInstance<unknown>): void {
  if (!dependent || dependency.settled) {
    return
  }

  const cyclePath = findPendingDependencyPath(dependency, dependent)
  if (cyclePath) {
    throw new Error(formatCircularDependencyPath([dependent.key, ...cyclePath]))
  }

  dependent.dependencies.add(dependency)
}

function resolveCachedOrCreate<T>(
  key: InternalKey<T>,
  binding: InternalProviderDef<T>,
  resolutionScope: ScopeNode,
  activeScope: ScopeNode,
  stack: InternalKey<unknown>[],
): T {
  const cached = resolutionScope.instances.get(key.id) as InstanceRecord<T> | undefined
  if (cached) {
    if (cached.state === 'resolved') {
      return cached.value
    }

    registerPendingDependency(getCurrentPending(activeScope, stack), cached)
    return cached.promise as T
  }

  const nextStack = [...stack, key]
  const { deactivate, inject } = createInject(resolutionScope, nextStack)

  try {
    const value = binding.factory({ inject }) as T

    if (isPromiseLike(value)) {
      const pendingRecord: PendingInstance<T> = {
        dependencies: new Set(),
        key,
        promise: Promise.resolve(undefined),
        settled: false,
        state: 'pending',
      }
      const pending = Promise.resolve(value).then(
        resolved => {
          pendingRecord.settled = true
          pendingRecord.dependencies.clear()
          deactivate()
          return resolved
        },
        error => {
          if (resolutionScope.instances.get(key.id) === pendingRecord) {
            resolutionScope.instances.delete(key.id)
          }
          pendingRecord.settled = true
          pendingRecord.dependencies.clear()
          deactivate()
          throw error
        },
      )

      pendingRecord.promise = pending
      resolutionScope.instances.set(key.id, pendingRecord)
      return pending as T
    }

    resolutionScope.instances.set(key.id, {
      state: 'resolved',
      value,
    })
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

  return resolveCachedOrCreate(internalKey, binding, resolutionScope, activeScope, stack)
}
