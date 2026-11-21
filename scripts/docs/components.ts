import { renderCodeLines } from './highlight'
import { jsx, normalizeChildren, type RenderedCodeTab, type VChild, type VNode } from './jsx-runtime'

export interface CodeFileTab {
  title: string
  code: string
  lang?: string
  region?: string
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
}

function inferLang(title?: string, explicitLang?: string): string {
  if (explicitLang && explicitLang.trim().length > 0) {
    return explicitLang.trim().toLowerCase()
  }
  if (title) {
    const clean = title.trim()
    const dotIdx = clean.lastIndexOf('.')
    if (dotIdx !== -1 && dotIdx < clean.length - 1) {
      const ext = clean.slice(dotIdx + 1).toLowerCase()
      if (EXT_TO_LANG[ext]) {
        return EXT_TO_LANG[ext]
      }
    }
  }
  return 'ts'
}

export function CodeTabs(props: { files: readonly CodeFileTab[]; layout?: 'tree' | 'tabs' }): VNode {
  if (!props.files || props.files.length === 0) {
    throw new Error('CodeTabs requires at least one file tab')
  }

  const tabs: RenderedCodeTab[] = props.files.map(file => {
    const lang = inferLang(file.title, file.lang)
    const highlighted = renderCodeLines(file.code, { lang, region: file.region })
    return {
      title: file.title,
      lang,
      html: highlighted.html,
      rawClean: highlighted.rawClean,
    }
  })

  return {
    kind: 'deck',
    tag: 'deck',
    props: {},
    children: [],
    label: tabs[0]!.title,
    tabs,
    layout: props.layout ?? 'tree',
  }
}

export function Code(props: { title?: string; code: string; lang?: string; region?: string }): VNode {
  const lang = inferLang(props.title, props.lang)
  const title = props.title && props.title.trim().length > 0 ? props.title.trim() : lang
  return CodeTabs({
    files: [
      {
        title,
        code: props.code,
        lang,
        region: props.region,
      },
    ],
  })
}

export function Callout(props: { kind?: 'note' | 'tip' | 'caution'; title?: string; children?: unknown }): VNode {
  const kind = props.kind ?? 'note'
  const innerChildren: VChild[] = []
  if (props.title && props.title.trim().length > 0) {
    innerChildren.push(jsx('p', { className: 'callout-title', children: props.title }))
  }
  innerChildren.push(jsx('div', { className: 'callout-body', children: normalizeChildren(props.children) }))

  return jsx('aside', {
    className: `callout callout-${kind}`,
    'data-callout': kind,
    children: innerChildren,
  })
}
