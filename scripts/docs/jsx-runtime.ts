export interface RenderedCodeTab {
  title: string
  lang: string
  html: string
  rawClean: string
}

export type VChild = VNode | string

export type VNode =
  | {
      kind: 'el'
      tag: string
      props: Record<string, unknown>
      children: VChild[]
    }
  | {
      kind: 'deck'
      tag: 'deck'
      props: Record<string, unknown>
      children: VChild[]
      label: string
      tabs: RenderedCodeTab[]
    }

export type ComponentFn = (props: any) => VNode

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')
}

export function isVNode(value: unknown): value is VNode {
  return typeof value === 'object' && value !== null && 'kind' in value && (value.kind === 'el' || value.kind === 'deck')
}

export function normalizeChildren(raw: unknown): VChild[] {
  if (raw === null || raw === undefined || typeof raw === 'boolean') {
    return []
  }
  if (Array.isArray(raw)) {
    return raw.flatMap(normalizeChildren)
  }
  if (isVNode(raw)) {
    return [raw]
  }
  return [String(raw)]
}

export function Fragment(props: { children?: unknown }): VNode {
  return {
    kind: 'el',
    tag: '',
    props: {},
    children: normalizeChildren(props?.children),
  }
}

export function jsx(type: string | ComponentFn, props: Record<string, unknown> | null | undefined, _key?: unknown): VNode {
  const safeProps = props ?? {}
  if (typeof type === 'function') {
    return type(safeProps)
  }
  const { children, ...rest } = safeProps
  return {
    kind: 'el',
    tag: type,
    props: rest,
    children: normalizeChildren(children),
  }
}

export const jsxs = jsx

function serializeStyleObject(styleObj: Record<string, unknown>): string {
  const declarations: string[] = []
  for (const [key, val] of Object.entries(styleObj)) {
    if (val === null || val === undefined || val === false || val === '') {
      continue
    }
    const cssProp = key.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)
    declarations.push(`${cssProp}:${String(val)}`)
  }
  return declarations.join(';')
}

function serializeProps(props: Record<string, unknown>): string {
  let out = ''
  for (const [rawKey, val] of Object.entries(props)) {
    if (rawKey === 'children' || rawKey === 'key' || val === null || val === undefined || val === false) {
      continue
    }
    const attrName = rawKey === 'className' ? 'class' : rawKey === 'htmlFor' ? 'for' : rawKey
    if (val === true) {
      out += ` ${attrName}`
    } else if (attrName === 'style' && typeof val === 'object') {
      const css = serializeStyleObject(val as Record<string, unknown>)
      if (css) {
        out += ` style="${escapeAttr(css)}"`
      }
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint') {
      out += ` ${attrName}="${escapeAttr(String(val))}"`
    }
  }
  return out
}

export function renderVChildToHtml(node: VChild, renderDeck?: (tabs: readonly RenderedCodeTab[], label: string) => string): string {
  if (typeof node === 'string') {
    return escapeHtml(node)
  }
  if (node.kind === 'deck') {
    return renderDeck ? renderDeck(node.tabs, node.label) : ''
  }
  if (node.tag === '') {
    return node.children.map(child => renderVChildToHtml(child, renderDeck)).join('')
  }
  const attrs = serializeProps(node.props)
  if (VOID_TAGS.has(node.tag)) {
    return `<${node.tag}${attrs}>`
  }
  const inner = node.children.map(child => renderVChildToHtml(child, renderDeck)).join('')
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`
}

export function extractPlainText(nodes: readonly VChild[]): string {
  let out = ''
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += node
    } else if (node.kind === 'el') {
      out += extractPlainText(node.children)
    }
  }
  return out
}

// biome-ignore lint/style/noNamespace: Required by TypeScript react-jsx transform
export namespace JSX {
  export type Element = VNode
  export interface ElementChildrenAttribute {
    children: unknown
  }
  export interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>
  }
}
