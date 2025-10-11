const PROVIDE_REF = Symbol('provide_ref')

export interface Ref<_T> {
  [PROVIDE_REF]: unknown
}

export type ProvideOptions<T = unknown> = {
  mode?: 'global' | 'standalone'
  providers?: Ref<unknown>[]
  overrides?: Ref<T>
}

export type InjectOptions = {
  optional?: boolean
}

interface RefInternal<T> extends Ref<T> {
  mode: 'global' | 'standalone'
  factory: () => T
  initialized: boolean
  providers?: RefInternal<unknown>[]
  overrides?: Ref<T>
}

let currentContext: InjectionContext | null = null

interface InjectionContext {
  instances: Map<RefInternal<unknown>, unknown>
  localProviders: Map<Ref<unknown>, RefInternal<unknown>>
  parent?: InjectionContext
}

function createContext(parent?: InjectionContext): InjectionContext {
  return {
    instances: new Map(),
    localProviders: new Map(),
    parent,
  }
}

const globalInstances = new Map<RefInternal<unknown>, unknown>()

export function provide<T>(factory: () => T, options?: ProvideOptions<T>): Ref<T> {
  const refInstance: RefInternal<T> = {
    [PROVIDE_REF]: undefined,
    mode: options?.mode || 'global',
    factory,
    initialized: false,
    providers: options?.providers as RefInternal<unknown>[] | undefined,
    overrides: options?.overrides,
  }

  return refInstance
}

export function isInInjectionContext(): boolean {
  return currentContext !== null
}

function findRefInContext(refInternal: RefInternal<unknown>, context: InjectionContext): RefInternal<unknown> | undefined {
  let currentCtx: InjectionContext | undefined = context
  while (currentCtx) {
    const localRef = currentCtx.localProviders.get(refInternal)
    if (localRef) {
      return localRef
    }
    currentCtx = currentCtx.parent
  }
  return refInternal
}

export function inject<T>(refInstance: Ref<T>): T
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions & { optional: true }): T | undefined
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions & { optional?: false }): T
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions): T | undefined {
  const { optional = false } = options || {}

  if (!isInInjectionContext()) {
    if (optional) {
      return undefined
    }
    throw new Error('inject() must be called within an injection context')
  }

  let refInternal = refInstance as RefInternal<T>
  const context = currentContext as InjectionContext

  const actualRef = findRefInContext(refInternal as RefInternal<unknown>, context) as RefInternal<T>
  refInternal = actualRef

  if (refInternal.mode === 'global') {
    if (context.parent) {
      if (context.instances.has(refInternal as RefInternal<unknown>)) {
        return context.instances.get(refInternal as RefInternal<unknown>) as T
      }
    } else {
      if (globalInstances.has(refInternal as RefInternal<unknown>)) {
        return globalInstances.get(refInternal as RefInternal<unknown>) as T
      }
    }

    let instance: T
    if (refInternal.providers && refInternal.providers.length > 0) {
      const previousContext = currentContext
      const childContext = createContext(context)

      refInternal.providers.forEach(provider => {
        const providerInternal = provider as RefInternal<unknown>
        // 如果provider有overrides字段，使用它作为key；否则使用provider本身
        const keyRef = providerInternal.overrides || provider
        childContext.localProviders.set(keyRef, providerInternal)
      })

      currentContext = childContext
      try {
        instance = refInternal.factory()
      } finally {
        currentContext = previousContext
      }
    } else {
      instance = refInternal.factory()
    }

    if (context.parent) {
      context.instances.set(refInternal as RefInternal<unknown>, instance)
    } else {
      globalInstances.set(refInternal as RefInternal<unknown>, instance)
    }
    return instance
  }

  if (context.instances.has(refInternal as RefInternal<unknown>)) {
    return context.instances.get(refInternal as RefInternal<unknown>) as T
  }

  let instance: T
  if (refInternal.providers && refInternal.providers.length > 0) {
    const previousContext = currentContext
    const childContext = createContext(context)

    refInternal.providers.forEach(provider => {
      const providerInternal = provider as RefInternal<unknown>
      // 如果provider有overrides字段，使用它作为key；否则使用provider本身
      const keyRef = providerInternal.overrides || provider
      childContext.localProviders.set(keyRef, providerInternal)
    })

    currentContext = childContext
    try {
      instance = refInternal.factory()
    } finally {
      currentContext = previousContext
    }
  } else {
    instance = refInternal.factory()
  }

  context.instances.set(refInternal as RefInternal<unknown>, instance)
  return instance
}

export function runInInjectionContext(fn: () => void): void
export function runInInjectionContext(fn: () => Promise<void>): Promise<void>
export function runInInjectionContext(fn: () => void | Promise<void>): void | Promise<void> {
  const previousContext = currentContext
  currentContext = createContext()

  try {
    const result = fn()

    // If result is a Promise, keep context active until promise completes
    if (result instanceof Promise) {
      return result.finally(() => {
        currentContext = previousContext
      })
    }

    // Synchronous function, restore context immediately
    currentContext = previousContext
  } catch (error) {
    currentContext = previousContext
    throw error
  }
}

export function isProvideRef(value: unknown): value is Ref<unknown> {
  return typeof value === 'object' && value !== null && PROVIDE_REF in value
}
