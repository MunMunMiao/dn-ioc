const PROVIDE_REF = Symbol('provide_ref')

export interface Ref<_T> {
  [PROVIDE_REF]: unknown
}

export type ProvideOptions<T = unknown> = {
  /** Instance mode: 'global' (singleton) or 'standalone' (per-context) */
  mode?: 'global' | 'standalone'
  /** Local providers available within this provider's factory */
  providers?: Ref<unknown>[]
  /** Which Ref this provider overrides in child contexts */
  overrides?: Ref<T>
}

export type InjectFn = <T>(refInstance: Ref<T>) => T

export interface Context {
  inject: InjectFn
}

export type Factory<T> = (ctx: Context) => T

interface RefInternal<T> extends Ref<T> {
  mode: 'global' | 'standalone'
  factory: Factory<T>
  providers?: RefInternal<unknown>[]
  overrides?: Ref<T>
}

interface InternalContext {
  instances: Map<RefInternal<unknown>, unknown>
  localProviders: Map<Ref<unknown>, RefInternal<unknown>>
  creating: Set<RefInternal<unknown>>
  parent?: InternalContext
  inject: InjectFn
}

const globalInstances = new Map<RefInternal<unknown>, unknown>()
const globalCreating = new Set<RefInternal<unknown>>()

/**
 * Reset all global instances. Useful for testing.
 */
export function resetGlobalInstances(): void {
  globalInstances.clear()
  globalCreating.clear()
}

export function provide<T>(factory: Factory<T>, options?: ProvideOptions<T>): Ref<T> {
  const refInstance: RefInternal<T> = {
    [PROVIDE_REF]: undefined,
    mode: options?.mode || 'global',
    factory,
    providers: options?.providers as RefInternal<unknown>[] | undefined,
    overrides: options?.overrides,
  }
  return refInstance
}

export function isProvideRef(value: unknown): value is Ref<unknown> {
  return typeof value === 'object' && value !== null && PROVIDE_REF in value
}

function getRefName(ref: RefInternal<unknown>): string {
  return ref.factory.name || '<anonymous>'
}

function findRefInContext(refInternal: RefInternal<unknown>, ctx: InternalContext): RefInternal<unknown> {
  let current: InternalContext | undefined = ctx
  while (current) {
    const localRef = current.localProviders.get(refInternal)
    if (localRef) {
      return localRef
    }
    current = current.parent
  }
  return refInternal
}

function createInternalContext(parent?: InternalContext): InternalContext {
  const ctx: InternalContext = {
    instances: new Map(),
    localProviders: new Map(),
    creating: new Set(),
    parent,
    inject: null!,
  }

  const inject: InjectFn = <T>(refInstance: Ref<T>): T => {
    const refInternal = findRefInContext(refInstance as RefInternal<unknown>, ctx) as RefInternal<T>
    const isGlobal = refInternal.mode === 'global'
    const useGlobalCache = isGlobal && !ctx.parent
    const cache = useGlobalCache ? globalInstances : ctx.instances
    const creating = useGlobalCache ? globalCreating : ctx.creating

    if (cache.has(refInternal as RefInternal<unknown>)) {
      return cache.get(refInternal as RefInternal<unknown>) as T
    }

    // Circular dependency detection
    if (creating.has(refInternal as RefInternal<unknown>)) {
      throw new Error(`Circular dependency detected: ${getRefName(refInternal)}`)
    }
    creating.add(refInternal as RefInternal<unknown>)

    let instance: T
    try {
      if (refInternal.providers?.length) {
        const childCtx = createInternalContext(ctx)
        for (const provider of refInternal.providers) {
          const p = provider as RefInternal<unknown>
          childCtx.localProviders.set(p.overrides || provider, p)
        }
        instance = refInternal.factory({ inject: childCtx.inject })
      } else {
        instance = refInternal.factory({ inject })
      }
    } finally {
      creating.delete(refInternal as RefInternal<unknown>)
    }

    cache.set(refInternal as RefInternal<unknown>, instance)
    return instance
  }

  ctx.inject = inject
  return ctx
}

export function runInInjectionContext<T>(fn: (ctx: Context) => Promise<T>): Promise<T>
export function runInInjectionContext<T>(fn: (ctx: Context) => T): T
export function runInInjectionContext<T>(fn: (ctx: Context) => T | Promise<T>): T | Promise<T> {
  const ctx = createInternalContext()
  return fn(ctx)
}
