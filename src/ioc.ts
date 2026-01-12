const PROVIDE_REF = Symbol('provide_ref')

export interface Ref<_T> {
  [PROVIDE_REF]: unknown
}

export type RefType<T> = T extends Ref<infer U> ? U : never

export type ProvideOptions<T = unknown> = {
  /** Instance mode: 'global' (singleton for program lifetime) or 'standalone' (new per inject) */
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
  localProviders: Map<Ref<unknown>, RefInternal<unknown>>
  parent?: InternalContext
  inject: InjectFn
}

const globalInstances = new Map<RefInternal<unknown>, unknown>()

/**
 * Reset cached global instances. Useful for testing.
 */
export function resetGlobalInstances(): void {
  globalInstances.clear()
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

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
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
    localProviders: new Map(),
    parent,
    inject: null!,
  }

  const makeInject = (
    targetCtx: InternalContext,
    stack: RefInternal<unknown>[],
  ): { inject: InjectFn; deactivate: () => void } => {
    let active = true
    const inject: InjectFn = <T>(refInstance: Ref<T>): T => {
      const currentStack = active ? stack : []
      return injectInternal(refInstance, targetCtx, currentStack)
    }
    const deactivate = () => {
      active = false
    }
    return { inject, deactivate }
  }

  const injectInternal = <T>(
    refInstance: Ref<T>,
    targetCtx: InternalContext,
    stack: RefInternal<unknown>[],
  ): T => {
    const refInternal = findRefInContext(refInstance as RefInternal<unknown>, targetCtx) as RefInternal<T>

    if (stack.includes(refInternal as RefInternal<unknown>)) {
      throw new Error(`Circular dependency detected: ${getRefName(refInternal)}`)
    }

    if (refInternal.mode === 'global' && globalInstances.has(refInternal as RefInternal<unknown>)) {
      return globalInstances.get(refInternal as RefInternal<unknown>) as T
    }

    const nextStack = [...stack, refInternal as RefInternal<unknown>]
    let instance: T
    const { inject, deactivate } = makeInject(targetCtx, nextStack)
    let childInject: { inject: InjectFn; deactivate: () => void } | null = null

    try {
      if (refInternal.providers?.length) {
        const childCtx = createInternalContext(targetCtx)
        for (const provider of refInternal.providers) {
          const p = provider as RefInternal<unknown>
          childCtx.localProviders.set(p.overrides || provider, p)
        }
        childInject = makeInject(childCtx, nextStack)
        instance = refInternal.factory({ inject: childInject.inject })
        if (isPromiseLike(instance)) {
          const promise = Promise.resolve(instance)
          if (refInternal.mode === 'global') {
            globalInstances.set(refInternal as RefInternal<unknown>, promise)
          }
          void promise.then(
            () => {
              childInject?.deactivate()
              deactivate()
            },
            () => {
              if (refInternal.mode === 'global') {
                if (globalInstances.get(refInternal as RefInternal<unknown>) === promise) {
                  globalInstances.delete(refInternal as RefInternal<unknown>)
                }
              }
              childInject?.deactivate()
              deactivate()
            },
          )
          return promise as T
        }
        childInject.deactivate()
      } else {
        instance = refInternal.factory({ inject })
        if (isPromiseLike(instance)) {
          const promise = Promise.resolve(instance)
          if (refInternal.mode === 'global') {
            globalInstances.set(refInternal as RefInternal<unknown>, promise)
          }
          void promise.then(
            () => {
              deactivate()
            },
            () => {
              if (refInternal.mode === 'global') {
                if (globalInstances.get(refInternal as RefInternal<unknown>) === promise) {
                  globalInstances.delete(refInternal as RefInternal<unknown>)
                }
              }
              deactivate()
            },
          )
          return promise as T
        }
      }
    } catch (error) {
      childInject?.deactivate()
      deactivate()
      throw error
    }

    deactivate()
    if (refInternal.mode === 'global') {
      globalInstances.set(refInternal as RefInternal<unknown>, instance)
    }
    return instance
  }

  ctx.inject = (refInstance => injectInternal(refInstance, ctx, [])) as InjectFn
  return ctx
}

export function runInInjectionContext<T>(fn: (ctx: Context) => Promise<T>): Promise<T>
export function runInInjectionContext<T>(fn: (ctx: Context) => T): T
export function runInInjectionContext<T>(fn: (ctx: Context) => T | Promise<T>): T | Promise<T> {
  const ctx = createInternalContext()
  return fn(ctx)
}
