import { type ComponentFn, Fragment, type JSX, jsx, jsxs, type VNode } from './jsx-runtime'

export function jsxDEV(type: string | ComponentFn, props: Record<string, unknown> | null | undefined, key?: unknown): VNode {
  return jsx(type, props, key)
}

export { Fragment, type JSX, jsx, jsxs, type VNode }
