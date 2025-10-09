const INJECT_TOKEN = Symbol('inject_token');
const PROVIDE_REF = Symbol('provide_ref');

export interface Token<T> {
  [INJECT_TOKEN]: unknown;
  readonly desc?: string;
}

export interface Ref<T> {
  [PROVIDE_REF]: unknown;
}

export type ProvideOptions = {
  mode?: 'global' | 'standalone';
  providers?: Ref<unknown>[];
};

export type InjectOptions = {
  optional?: boolean;
};

interface RefInternal<T> extends Ref<T> {
  mode: 'global' | 'standalone';
  value?: T;
  factory?: () => T;
  token?: Token<T>;
  initialized: boolean;
  providers?: RefInternal<unknown>[];
}

let currentContext: InjectionContext | null = null;

interface InjectionContext {
  instances: Map<RefInternal<unknown>, unknown>;
  localProviders: Map<Token<unknown>, RefInternal<unknown>>;
  parent?: InjectionContext;
}

function createContext(parent?: InjectionContext): InjectionContext {
  return {
    instances: new Map(),
    localProviders: new Map(),
    parent,
  };
}

const globalInstances = new Map<RefInternal<unknown>, unknown>();

export function createToken<T>(desc?: string): Token<T> {
  return {
    [INJECT_TOKEN]: undefined,
    desc,
  };
}

export function provideToken<T>(
  tokenInstance: Token<T>,
  value: T,
  options?: ProvideOptions
): Ref<T> {
  const refInstance: RefInternal<T> = {
    [PROVIDE_REF]: undefined,
    mode: options?.mode || 'global',
    token: tokenInstance,
    value,
    initialized: false,
    providers: options?.providers as RefInternal<unknown>[] | undefined,
  };

  return refInstance;
}

export function provideFactory<T>(
  factory: () => T,
  options?: ProvideOptions
): Ref<T> {
  const refInstance: RefInternal<T> = {
    [PROVIDE_REF]: undefined,
    mode: options?.mode || 'global',
    factory,
    initialized: false,
    providers: options?.providers as RefInternal<unknown>[] | undefined,
  };

  return refInstance;
}

export function isInInjectionContext(): boolean {
  return currentContext !== null;
}

function findRefInContext(refInternal: RefInternal<unknown>, context: InjectionContext): RefInternal<unknown> | undefined {
  if (refInternal.token) {
    let currentCtx: InjectionContext | undefined = context;
    while (currentCtx) {
      const localRef = currentCtx.localProviders.get(refInternal.token);
      if (localRef) {
        return localRef;
      }
      currentCtx = currentCtx.parent;
    }
  }
  return refInternal;
}

export function inject<T>(refInstance: Ref<T>): T;
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions & { optional: true }): T | undefined;
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions & { optional?: false }): T;
export function inject<T>(refInstance: Ref<T>, options?: InjectOptions): T | undefined {
  const { optional = false } = options || {};

  if (!isInInjectionContext()) {
    if (optional) {
      return undefined;
    }
    throw new Error('inject() must be called within an injection context');
  }

  let refInternal = refInstance as RefInternal<T>;
  const context = currentContext!;

  const actualRef = findRefInContext(refInternal as RefInternal<unknown>, context) as RefInternal<T>;
  refInternal = actualRef;

  if (refInternal.mode === 'global') {
    if (context.parent) {
      if (context.instances.has(refInternal as RefInternal<unknown>)) {
        return context.instances.get(refInternal as RefInternal<unknown>) as T;
      }
    } else {
      if (globalInstances.has(refInternal as RefInternal<unknown>)) {
        return globalInstances.get(refInternal as RefInternal<unknown>) as T;
      }
    }

    let instance: T;
    if (refInternal.factory) {
      if (refInternal.providers && refInternal.providers.length > 0) {
        const previousContext = currentContext;
        const childContext = createContext(context);
        
        refInternal.providers.forEach(provider => {
          const providerInternal = provider as RefInternal<unknown>;
          if (providerInternal.token) {
            childContext.localProviders.set(providerInternal.token, providerInternal);
          }
        });
        
        currentContext = childContext;
        try {
          instance = refInternal.factory();
        } finally {
          currentContext = previousContext;
        }
      } else {
        instance = refInternal.factory();
      }
    } else if (refInternal.value !== undefined) {
      instance = refInternal.value;
    } else {
      if (optional) {
        return undefined;
      }
      throw new Error('No value or factory provided for injection');
    }

    if (context.parent) {
      context.instances.set(refInternal as RefInternal<unknown>, instance);
    } else {
      globalInstances.set(refInternal as RefInternal<unknown>, instance);
    }
    return instance;
  }

  if (context.instances.has(refInternal as RefInternal<unknown>)) {
    return context.instances.get(refInternal as RefInternal<unknown>) as T;
  }

  let instance: T;
  if (refInternal.factory) {
    if (refInternal.providers && refInternal.providers.length > 0) {
      const previousContext = currentContext;
      const childContext = createContext(context);
      
      refInternal.providers.forEach(provider => {
        const providerInternal = provider as RefInternal<unknown>;
        if (providerInternal.token) {
          childContext.localProviders.set(providerInternal.token, providerInternal);
        }
      });
      
      currentContext = childContext;
      try {
        instance = refInternal.factory();
      } finally {
        currentContext = previousContext;
      }
    } else {
      instance = refInternal.factory();
    }
  } else if (refInternal.value !== undefined) {
    instance = refInternal.value;
  } else {
    if (optional) {
      return undefined;
    }
    throw new Error('No value or factory provided for injection');
  }

  context.instances.set(refInternal as RefInternal<unknown>, instance);
  return instance;
}

export function runInInjectionContext<R>(fn: () => R): R {
  const previousContext = currentContext;
  currentContext = createContext();

  try {
    return fn();
  } finally {
    currentContext = previousContext;
  }
}

export function isInjectToken(value: unknown): value is Token<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    INJECT_TOKEN in value
  );
}

export function isProvideRef(value: unknown): value is Ref<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    PROVIDE_REF in value
  );
}

