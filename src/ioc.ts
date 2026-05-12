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
  promise: Promise<T>
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

// One table is all that's needed: every runtime handle (token/ref/binding/bundle) is keyed by its frozen
// public object and carries a `kind` discriminator. Collapsing the three previous WeakMaps into one cuts
// lookups from three to one on every hot path (flatten / inject-key / isProvideRef).
const handleMetadata = new WeakMap<object, InternalRuntimeValue>()

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
  return lookup(value)?.kind === 'ref'
}

export async function bootstrapApp<TResult>(fn: BootstrapAppFn<TResult>, options?: BootstrapAppOptions): Promise<TResult> {
  const rootScope = createScope()
  installProviders(rootScope, options?.providers ?? [])

  return fn({
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
  handleMetadata.set(handle, {
    kind: 'token',
    description,
    id: Symbol(description),
  })
  return handle
}

function createRefInternal<T>(factory: Factory<T>, providers?: readonly ProviderInput[]): Ref<T> {
  const handle = createHandle<Ref<T>>()
  const description = factory.name || undefined
  handleMetadata.set(handle, {
    kind: 'ref',
    description,
    factory,
    id: Symbol(description),
    providers: snapshotProviderInputs(providers),
  })
  return handle
}

function createProviderDefInternal<T>(key: InternalKey<T>, factory: Factory<T>, providers?: readonly ProviderInput[]): ProviderDef<T> {
  const handle = createHandle<ProviderDef<T>>()
  handleMetadata.set(handle, createProviderDefMetadata(key, factory, snapshotProviderInputs(providers)))
  return handle
}

function createProviderBundleInternal(items: readonly ProviderInput[]): ProviderBundle {
  const handle = createHandle<ProviderBundle>()
  handleMetadata.set(handle, {
    kind: 'bundle',
    items: Object.freeze(items.map(snapshotProviderInput)),
  })
  return handle
}

function createProviderDefMetadata<T>(
  key: InternalKey<T>,
  factory: Factory<T>,
  providers: readonly ProviderInput[] | undefined,
): InternalProviderDef<T> {
  return { kind: 'binding', factory, key, providers }
}

function snapshotProviderInputs(inputs?: readonly ProviderInput[]): readonly ProviderInput[] | undefined {
  if (!inputs) {
    return undefined
  }
  return Object.freeze(inputs.map(snapshotProviderInput))
}

function snapshotProviderInput(input: ProviderInput): ProviderInput {
  if (Array.isArray(input)) {
    return Object.freeze(input.map(snapshotProviderInput))
  }
  return input
}

function lookup(value: unknown): InternalRuntimeValue | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined
  }
  return handleMetadata.get(value)
}

function asInternalKey<T>(key: InjectKey<T>): InternalKey<T> {
  const meta = lookup(key)
  if (meta && (meta.kind === 'token' || meta.kind === 'ref')) {
    return meta as InternalKey<T>
  }
  throw new Error('Invalid inject key received')
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function'
  )
}

function getKeyName(key: InternalKey<unknown>): string {
  return key.description || '<anonymous>'
}

function formatCircularDependency(path: InternalKey<unknown>[]): string {
  return `Circular dependency detected: ${path.map(getKeyName).join(' -> ')}`
}

function flattenProviders(inputs: readonly ProviderInput[]): InternalProvider[] {
  const flattened: InternalProvider[] = []

  for (const input of inputs) {
    if (Array.isArray(input)) {
      flattened.push(...flattenProviders(input))
      continue
    }

    const meta = lookup(input)
    if (meta?.kind === 'bundle') {
      flattened.push(...flattenProviders(meta.items))
      continue
    }
    if (meta?.kind === 'ref' || meta?.kind === 'binding') {
      flattened.push(meta)
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

function lazilyInstallRefBinding<T>(ref: InternalRef<T>, scope: ScopeNode): InternalProviderDef<T> {
  let binding = scope.bindings.get(ref.id) as InternalProviderDef<T> | undefined
  if (!binding) {
    binding = createProviderDefMetadata(ref, ref.factory, ref.providers)
    scope.bindings.set(ref.id, binding)
  }
  return binding
}

// Walk up from the active scope; if no binding is found, refs self-install at the active scope,
// tokens raise — that asymmetry is the whole point of having two kinds of keys.
function locateOrInstallBindingScope<T>(
  key: InternalKey<T>,
  activeScope: ScopeNode,
): { scope: ScopeNode; binding: InternalProviderDef<T> } {
  const existing = findBindingScope(activeScope, key)
  if (existing) {
    return { scope: existing, binding: existing.bindings.get(key.id) as InternalProviderDef<T> }
  }

  if (key.kind === 'token') {
    throw new Error(`No provider for token: ${getKeyName(key)}`)
  }

  return { scope: activeScope, binding: lazilyInstallRefBinding(key, activeScope) }
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

// Only the top-of-stack pending record is the "currently resolving" frame; it lives in `activeScope`
// because that's the scope passed into `createInject` when its factory started running.
function getCurrentPending(activeScope: ScopeNode, stack: InternalKey<unknown>[]): PendingInstance<unknown> | undefined {
  const currentKey = stack[stack.length - 1]
  if (!currentKey) {
    return undefined
  }

  const currentRecord = activeScope.instances.get(currentKey.id)
  if (currentRecord?.state !== 'pending' || currentRecord.settled) {
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
    throw new Error(formatCircularDependency([dependent.key, ...cyclePath]))
  }

  dependent.dependencies.add(dependency)
}

function reuseCached<T>(cached: InstanceRecord<T>, activeScope: ScopeNode, stack: InternalKey<unknown>[]): T {
  if (cached.state === 'resolved') {
    return cached.value
  }
  registerPendingDependency(getCurrentPending(activeScope, stack), cached)
  return cached.promise as T
}

function attachPending<T>(key: InternalKey<T>, raw: PromiseLike<T>, resolutionScope: ScopeNode, deactivate: () => void): Promise<T> {
  // The factory's promise + the pending record reference each other; the record is filled in
  // synchronously below, before any microtask can fire either callback. No placeholder Promise needed.
  let pendingRecord!: PendingInstance<T>
  const settle = () => {
    pendingRecord.settled = true
    pendingRecord.dependencies.clear()
    deactivate()
  }
  const promise = Promise.resolve(raw).then(
    resolved => {
      settle()
      return resolved
    },
    error => {
      if (resolutionScope.instances.get(key.id) === pendingRecord) {
        resolutionScope.instances.delete(key.id)
      }
      settle()
      throw error
    },
  )

  pendingRecord = {
    dependencies: new Set(),
    key,
    promise,
    settled: false,
    state: 'pending',
  }
  resolutionScope.instances.set(key.id, pendingRecord)
  return promise
}

function invokeFactory<T>(
  key: InternalKey<T>,
  binding: InternalProviderDef<T>,
  resolutionScope: ScopeNode,
  stack: InternalKey<unknown>[],
): T {
  const nextStack = [...stack, key]
  const { deactivate, inject } = createInject(resolutionScope, nextStack)

  try {
    const value = binding.factory({ inject })

    if (isPromiseLike<T>(value)) {
      return attachPending(key, value, resolutionScope, deactivate) as T
    }

    resolutionScope.instances.set(key.id, { state: 'resolved', value })
    deactivate()
    return value
  } catch (error) {
    deactivate()
    throw error
  }
}

function resolve<T>(key: InjectKey<T>, activeScope: ScopeNode, stack: InternalKey<unknown>[]): T {
  const internalKey = asInternalKey(key)

  const cycleStart = stack.indexOf(internalKey)
  if (cycleStart >= 0) {
    throw new Error(formatCircularDependency([...stack.slice(cycleStart), internalKey]))
  }

  // Tokens must be installed explicitly. Refs are self-providing and bind
  // their default factory into the current active installation scope.
  const { scope: bindingScope, binding } = locateOrInstallBindingScope(internalKey, activeScope)
  const resolutionScope = ensureAttachedScope(bindingScope, binding)

  const cached = resolutionScope.instances.get(internalKey.id) as InstanceRecord<T> | undefined
  if (cached) {
    return reuseCached(cached, activeScope, stack)
  }
  return invokeFactory(internalKey, binding, resolutionScope, stack)
}
