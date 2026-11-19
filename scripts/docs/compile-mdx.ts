import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compile } from '@mdx-js/mdx'
import remarkGfm from 'remark-gfm'
import { absoluteChapterUrl, chapterHref, getLocale, LOCALES, type LocaleCode, type LocaleConfig, type PartId } from '../../docs/locales'
import { Callout, Code, CodeTabs } from './components'
import {
  escapeAttr,
  escapeHtml,
  extractPlainText,
  isVNode,
  type RenderedCodeTab,
  renderVChildToHtml,
  type VChild,
  type VNode,
} from './jsx-runtime'

export interface ChapterFrontmatter {
  title: string
  slug: string
  part: PartId
  order: number
  summary: string
}

export interface CompiledSection {
  id: string
  heading: string
  level: 0 | 2
  html: string
}

export interface SearchEntry {
  title: string
  chapterTitle: string
  href: string
  excerpt: string
}

export interface CompiledChapter {
  locale: LocaleCode
  meta: ChapterFrontmatter
  sections: CompiledSection[]
  searchEntries: SearchEntry[]
}

const PART_ORDER: readonly PartId[] = ['start', 'kernel', 'patterns', 'reference']
const VALID_PARTS = new Set<string>(PART_ORDER)
const BLOCK_SPACING_TAGS = new Set(['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'aside', 'br'])

const SCRIPTS_DOCS_DIR = import.meta.dir
const JSX_RUNTIME_URL = pathToFileURL(join(SCRIPTS_DOCS_DIR, 'jsx-runtime.ts')).href
const JSX_DEV_RUNTIME_URL = pathToFileURL(join(SCRIPTS_DOCS_DIR, 'jsx-dev-runtime.ts')).href

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('dn-ioc-theme');var m=s==='dark'||s==='light'?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-mode',m);}catch(e){}})();`

export function slugifyHeading(text: string, seen: Set<string>): string {
  const base =
    text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'

  if (!seen.has(base)) {
    seen.add(base)
    return base
  }

  let suffix = 2
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  const unique = `${base}-${suffix}`
  seen.add(unique)
  return unique
}

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed
}

function parseFrontmatter(source: string, filePath: string): { meta: ChapterFrontmatter; body: string } {
  const normalized = source.replace(/^\uFEFF/, '')
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    throw new Error(`Missing YAML frontmatter in ${filePath}`)
  }

  const rawFields: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) {
      throw new Error(`Invalid frontmatter line "${line}" in ${filePath}`)
    }
    rawFields[kv[1]!] = unquoteYamlScalar(kv[2]!)
  }

  for (const key of ['title', 'slug', 'part', 'order', 'summary'] as const) {
    if (!(key in rawFields)) {
      throw new Error(`Missing required frontmatter field "${key}" in ${filePath}`)
    }
  }

  const title = rawFields.title!.trim()
  if (!title) {
    throw new Error(`Frontmatter "title" cannot be empty in ${filePath}`)
  }

  const slug = rawFields.slug!.trim()
  const part = rawFields.part!.trim()
  if (!VALID_PARTS.has(part)) {
    throw new Error(`Invalid frontmatter "part" value "${part}" in ${filePath}`)
  }

  const orderNum = Number(rawFields.order)
  if (!rawFields.order!.trim() || !Number.isFinite(orderNum)) {
    throw new Error(`Invalid numeric frontmatter "order" value "${rawFields.order}" in ${filePath}`)
  }

  const summary = rawFields.summary!.trim()
  if (!summary) {
    throw new Error(`Frontmatter "summary" cannot be empty in ${filePath}`)
  }

  return {
    meta: {
      title,
      slug,
      part: part as PartId,
      order: orderNum,
      summary,
    },
    body: normalized.slice(match[0].length).replace(/\r\n?/g, '\n'),
  }
}

function splitOutsideCodeFences(mdxBody: string): Array<{ fenced: boolean; content: string }> {
  const lines = mdxBody.split('\n')
  const segments: Array<{ fenced: boolean; content: string }> = []
  let buffer: string[] = []
  let activeFence: { char: string; len: number } | null = null

  const flush = (fenced: boolean) => {
    if (buffer.length > 0) {
      segments.push({ fenced, content: buffer.join('\n') })
      buffer = []
    }
  }

  for (const line of lines) {
    if (activeFence) {
      buffer.push(line)
      const closeRe = new RegExp(`^ {0,3}${activeFence.char}{${activeFence.len},}\\s*$`)
      if (closeRe.test(line)) {
        flush(true)
        activeFence = null
      }
    } else {
      const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
      if (openMatch) {
        flush(false)
        const marker = openMatch[1]!
        activeFence = { char: marker[0]!, len: marker.length }
        buffer.push(line)
      } else {
        buffer.push(line)
      }
    }
  }
  flush(activeFence !== null)
  return segments
}

function toSafeJsStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

async function inlineRawImports(mdxBody: string, filePath: string): Promise<string> {
  const baseDir = dirname(filePath)
  const segments = splitOutsideCodeFences(mdxBody)
  const textAttrImportRe =
    /(^|\n)[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\3\s+(?:with|assert)\s*\{\s*type\s*:\s*(['"])text\5\s*,?\s*\}[ \t]*;?/g
  const rawQueryImportRe = /(^|\n)[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+?)\?raw\3[ \t]*;?/g

  const loadSnippet = async (specifier: string): Promise<string> => {
    const cleanSpec = specifier.replace(/\?raw$/, '')
    const absPath = resolve(baseDir, cleanSpec)
    try {
      return await readFile(absPath, 'utf8')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to load imported snippet "${specifier}" from ${filePath}: ${msg}`)
    }
  }

  const replaceAsync = async (
    input: string,
    re: RegExp,
    getArgs: (m: RegExpExecArray) => { prefix: string; ident: string; specifier: string },
  ): Promise<string> => {
    let out = ''
    let lastIdx = 0
    for (const match of input.matchAll(re)) {
      const idx = match.index ?? 0
      out += input.slice(lastIdx, idx)
      const { prefix, ident, specifier } = getArgs(match)
      const rawText = await loadSnippet(specifier)
      out += `${prefix}export const ${ident} = ${toSafeJsStringLiteral(rawText)}`
      lastIdx = idx + match[0].length
    }
    out += input.slice(lastIdx)
    return out
  }

  const transformed: string[] = []
  for (const seg of segments) {
    if (seg.fenced) {
      transformed.push(seg.content)
      continue
    }
    let next = await replaceAsync(seg.content, textAttrImportRe, m => ({
      prefix: m[1]!,
      ident: m[2]!,
      specifier: m[4]!,
    }))
    next = await replaceAsync(next, rawQueryImportRe, m => ({
      prefix: m[1]!,
      ident: m[2]!,
      specifier: m[4]!,
    }))
    transformed.push(next)
  }

  return transformed.join('\n')
}

function rewriteCompiledModuleSpecifiers(jsCode: string, filePath: string): string {
  const fileUrl = pathToFileURL(filePath).href
  const runtimePrefix = `${SCRIPTS_DOCS_DIR}/jsx-runtime`
  const devRuntimePrefix = `${SCRIPTS_DOCS_DIR}/jsx-dev-runtime`

  return jsCode.replace(/^import\s+([\w*{}\s,$]+?\s+from\s+)(['"])([^'"]+)\2/gm, (full, clause: string, quote: string, spec: string) => {
    if (spec === runtimePrefix) {
      return `import ${clause}${quote}${JSX_RUNTIME_URL}${quote}`
    }
    if (spec === devRuntimePrefix) {
      return `import ${clause}${quote}${JSX_DEV_RUNTIME_URL}${quote}`
    }
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const resolvedUrl = new URL(spec, fileUrl).href
      return `import ${clause}${quote}${resolvedUrl}${quote}`
    }
    return full
  })
}

function renderPaperCode(tabs: readonly RenderedCodeTab[], localeCfg: LocaleConfig): string {
  const { ui } = localeCfg
  const tabButtons = tabs
    .map(
      (tab, t) =>
        `<button type="button" class="p-tab${t === 0 ? ' is-active' : ''}" role="tab" aria-selected="${t === 0 ? 'true' : 'false'}" data-tab="${t}">${escapeHtml(tab.title)}</button>`,
    )
    .join('')

  const prePanels = tabs
    .map(
      (tab, t) =>
        `<pre class="p-pre${t === 0 ? ' is-active' : ''}" data-panel="${t}" data-lang="${escapeAttr(tab.lang)}" data-raw="${escapeAttr(tab.rawClean)}">${tab.html}</pre>`,
    )
    .join('')

  return `<div class="paper-code" dir="ltr"><div class="p-tabs"><div class="p-tablist" role="tablist">${tabButtons}</div><button type="button" class="p-copy" data-copy="${escapeAttr(ui.copy)}" data-copied="${escapeAttr(ui.copied)}">${escapeHtml(ui.copy)}</button></div>${prePanels}</div>`
}

function flattenTopLevel(node: VChild): VChild[] {
  if (typeof node === 'string') {
    return node.trim() === '' ? [] : [node]
  }
  if (node.kind === 'el' && node.tag === '') {
    return node.children.flatMap(flattenTopLevel)
  }
  return [node]
}

function tryConvertFencedPreToDeck(node: VNode): VNode | null {
  if (node.kind !== 'el' || node.tag !== 'pre') {
    return null
  }
  const meaningfulChildren = node.children.filter(ch => !(typeof ch === 'string' && ch.trim() === ''))
  if (meaningfulChildren.length !== 1) {
    return null
  }
  const child = meaningfulChildren[0]!
  if (typeof child === 'string' || child.kind !== 'el' || child.tag !== 'code') {
    return null
  }
  const className = typeof child.props.className === 'string' ? child.props.className : ''
  const langMatch = className.match(/language-([\w-]+)/)
  const lang = langMatch?.[1] ?? 'text'
  const titleProp = typeof child.props.title === 'string' && child.props.title.trim() ? child.props.title.trim() : lang
  const rawCode = extractPlainText(child.children)
  return Code({ title: titleProp, code: rawCode, lang })
}

function transformSectionNode(node: VChild, seenHeadings: Set<string>): VChild {
  if (typeof node === 'string' || node.kind === 'deck') {
    return node
  }
  const fencedDeck = tryConvertFencedPreToDeck(node)
  if (fencedDeck && fencedDeck.kind === 'deck') {
    return fencedDeck
  }
  const transformedChildren = node.children.map(child => transformSectionNode(child, seenHeadings))
  if (node.tag === 'h3' || node.tag === 'h4') {
    const headingText = extractPlainText(transformedChildren).trim()
    const existingId = typeof node.props.id === 'string' && node.props.id ? node.props.id : slugifyHeading(headingText, seenHeadings)
    return {
      ...node,
      props: { ...node.props, id: existingId },
      children: transformedChildren,
    }
  }
  return {
    ...node,
    children: transformedChildren,
  }
}

function extractExcerptText(nodes: readonly VChild[]): string {
  let out = ''
  const visit = (items: readonly VChild[]) => {
    for (const item of items) {
      if (typeof item === 'string') {
        out += item
      } else if (item.kind === 'el') {
        visit(item.children)
        if (BLOCK_SPACING_TAGS.has(item.tag)) {
          out += ' '
        }
      }
    }
  }
  visit(nodes)
  const normalized = out.replace(/\s+/g, ' ').trim()
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized
}

interface RawBucket {
  id: string
  heading: string
  level: 0 | 2
  nodes: VChild[]
}

export async function compileMdxFile(filePath: string, locale: LocaleCode): Promise<CompiledChapter> {
  const localeCfg = getLocale(locale)
  const rawMdx = await readFile(filePath, 'utf8')
  const { meta, body } = parseFrontmatter(rawMdx, filePath)
  const inlinedBody = await inlineRawImports(body, filePath)

  const compiledFile = await compile(inlinedBody, {
    outputFormat: 'program',
    jsxImportSource: SCRIPTS_DOCS_DIR,
    remarkPlugins: [remarkGfm],
  })

  const rewrittenJs = rewriteCompiledModuleSpecifiers(String(compiledFile), filePath)
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(rewrittenJs).toString('base64')}`
  const evaluated = (await import(moduleUrl)) as { default: (props: { components: Record<string, unknown> }) => unknown }

  const rootTree = evaluated.default({
    components: {
      Code,
      CodeTabs,
      Callout,
    },
  })

  const topNodes = isVNode(rootTree) ? flattenTopLevel(rootTree) : []
  const seenIds = new Set<string>()
  const buckets: RawBucket[] = []
  let currentBucket: RawBucket | null = null

  for (const node of topNodes) {
    if (typeof node !== 'string' && node.kind === 'el' && node.tag === 'h2') {
      const headingText = extractPlainText(node.children).trim()
      const stepId = slugifyHeading(headingText, seenIds)
      currentBucket = {
        id: stepId,
        heading: headingText,
        level: 2,
        nodes: [node],
      }
      buckets.push(currentBucket)
    } else {
      if (!currentBucket) {
        currentBucket = {
          id: slugifyHeading('intro', seenIds),
          heading: meta.title,
          level: 0,
          nodes: [],
        }
        buckets.push(currentBucket)
      }
      currentBucket.nodes.push(node)
    }
  }

  if (buckets.length === 0) {
    buckets.push({
      id: slugifyHeading('intro', seenIds),
      heading: meta.title,
      level: 0,
      nodes: [],
    })
  }

  const rawSections: Array<{ section: CompiledSection; proseExcerpt: string }> = []
  const renderInlineDeck = (tabs: readonly RenderedCodeTab[]) => renderPaperCode(tabs, localeCfg)

  for (const bucket of buckets) {
    const transformedNodes = bucket.nodes.map(node => transformSectionNode(node, seenIds))
    const html = transformedNodes
      .map(node => renderVChildToHtml(node, renderInlineDeck))
      .join('\n')
      .trim()
    const nodesWithoutH2 = bucket.level === 2 ? transformedNodes.slice(1) : transformedNodes
    const proseExcerpt = extractExcerptText(nodesWithoutH2)

    rawSections.push({
      section: {
        id: bucket.id,
        heading: bucket.heading,
        level: bucket.level,
        html,
      },
      proseExcerpt,
    })
  }

  const sections = rawSections.map(item => item.section)
  const baseHref = chapterHref(locale, meta.slug)
  const searchEntries: SearchEntry[] = []
  const hasIntroSection = rawSections[0]?.section.level === 0

  if (!hasIntroSection) {
    searchEntries.push({
      title: meta.title,
      chapterTitle: meta.title,
      href: baseHref,
      excerpt: meta.summary,
    })
  }

  for (const { section, proseExcerpt } of rawSections) {
    if (section.level === 0) {
      const combined = proseExcerpt ? `${meta.summary} ${proseExcerpt}`.trim() : meta.summary
      searchEntries.push({
        title: meta.title,
        chapterTitle: meta.title,
        href: baseHref,
        excerpt: combined.length > 220 ? `${combined.slice(0, 217).trimEnd()}...` : combined,
      })
    } else {
      searchEntries.push({
        title: section.heading,
        chapterTitle: meta.title,
        href: `${baseHref}#${section.id}`,
        excerpt: proseExcerpt || meta.summary,
      })
    }
  }

  return {
    locale,
    meta,
    sections,
    searchEntries,
  }
}

export function renderChapterPage(chapter: CompiledChapter, allChapters: readonly CompiledChapter[], _version?: string): string {
  const localeCfg = getLocale(chapter.locale)
  const { ui } = localeCfg
  const sortedChapters = [...allChapters].sort((a, b) => a.meta.order - b.meta.order)
  const currentIdx = sortedChapters.findIndex(c => c.meta.slug === chapter.meta.slug)
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : undefined
  const nextChapter = currentIdx >= 0 && currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : undefined

  const homeHref = chapterHref(chapter.locale, '')
  const pageTitle = chapter.meta.slug === '' ? `dn-ioc — ${chapter.meta.title}` : `${chapter.meta.title} — dn-ioc`
  const canonicalUrl = absoluteChapterUrl(chapter.locale, chapter.meta.slug)
  const defaultEnUrl = absoluteChapterUrl('en-US', chapter.meta.slug)

  const hreflangLinks = [
    ...LOCALES.map(
      loc =>
        `  <link rel="alternate" hreflang="${escapeAttr(loc.htmlLang)}" href="${escapeAttr(absoluteChapterUrl(loc.code, chapter.meta.slug))}">`,
    ),
    `  <link rel="alternate" hreflang="en" href="${escapeAttr(defaultEnUrl)}">`,
    `  <link rel="alternate" hreflang="x-default" href="${escapeAttr(defaultEnUrl)}">`,
  ].join('\n')

  const railGroupsHtml = PART_ORDER.map(partId => {
    const partChapters = sortedChapters.filter(c => c.meta.part === partId)
    const items = partChapters
      .map(c => {
        const isCurrent = c.meta.slug === chapter.meta.slug
        return `<li class="rail-item"><a class="rail-link${isCurrent ? ' is-current' : ''}" href="${escapeAttr(chapterHref(chapter.locale, c.meta.slug))}"${isCurrent ? ' aria-current="page"' : ''}><span class="rail-num">${String(c.meta.order).padStart(2, '0')}</span><span class="rail-title">${escapeHtml(c.meta.title)}</span></a></li>`
      })
      .join('')
    return `<div class="rail-group" data-part="${partId}"><p class="rail-group-title">${escapeHtml(ui.parts[partId])}</p><ol class="rail-list">${items}</ol></div>`
  }).join('')

  const sectionsHtml = chapter.sections
    .map(
      section => `        <section class="doc-section" id="${escapeAttr(section.id)}">
${section.html}
        </section>`,
    )
    .join('\n')

  const langOptionsHtml = LOCALES.map(loc => {
    const isCurrent = loc.code === chapter.locale
    return `<li><a class="lang-option${isCurrent ? ' is-current' : ''}" data-locale-link="${escapeAttr(loc.code)}" href="${escapeAttr(chapterHref(loc.code, chapter.meta.slug))}" lang="${escapeAttr(loc.htmlLang)}" hreflang="${escapeAttr(loc.htmlLang)}"${isCurrent ? ' aria-current="page"' : ''}>${escapeHtml(loc.label)}</a></li>`
  }).join('')

  const prevArrow = localeCfg.dir === 'rtl' ? '→' : '←'
  const nextArrow = localeCfg.dir === 'rtl' ? '←' : '→'

  const prevLinkHtml = prevChapter
    ? `<a class="chapter-pager-link chapter-pager-prev" href="${escapeAttr(chapterHref(chapter.locale, prevChapter.meta.slug))}">${prevArrow} ${escapeHtml(ui.prev)}: ${escapeHtml(prevChapter.meta.title)}</a>`
    : `<span class="chapter-pager-spacer"></span>`

  const nextLinkHtml = nextChapter
    ? `<a class="chapter-pager-link chapter-pager-next" href="${escapeAttr(chapterHref(chapter.locale, nextChapter.meta.slug))}">${escapeHtml(ui.next)}: ${escapeHtml(nextChapter.meta.title)} ${nextArrow}</a>`
    : `<span class="chapter-pager-spacer"></span>`

  const arabicFontParam = chapter.locale === 'ar' ? '&family=IBM+Plex+Sans+Arabic:wght@400;500;600' : ''
  const fontsUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400${arabicFontParam}&display=swap`

  return `<!DOCTYPE html>
<html lang="${escapeAttr(localeCfg.htmlLang)}" dir="${localeCfg.dir}" data-locale="${escapeAttr(chapter.locale)}" data-mode="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(chapter.meta.summary)}">
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
${hreflangLinks}
  <link rel="alternate" type="text/plain" href="/llms.txt" title="dn-ioc LLM Reference">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${fontsUrl}">
  <link rel="stylesheet" href="/assets/notebook.css">
  <script>${THEME_INIT_SCRIPT}</script>
</head>
<body>
  <header class="mobile-bar">
    <a class="mobile-brand" href="${escapeAttr(homeHref)}">dn-ioc</a>
    <div class="mobile-actions">
      <button type="button" class="mobile-btn" data-toggle-contents aria-expanded="false" aria-controls="doc-rail">☰ ${escapeHtml(ui.contents)}</button>
      <button type="button" class="mobile-btn" data-open-search>${escapeHtml(ui.search)} <kbd>⌘K</kbd></button>
    </div>
  </header>
  <div class="rail-backdrop" data-close-contents hidden></div>
  <div class="doc-shell">
    <aside class="doc-rail" id="doc-rail">
      <a class="rail-brand" href="${escapeAttr(homeHref)}"><strong>dn-ioc</strong></a>
      <nav class="rail-nav" aria-label="${escapeAttr(ui.contents)}">${railGroupsHtml}</nav>
      <div class="rail-foot">
        <button type="button" class="rail-tool" data-open-search>${escapeHtml(ui.search)} <kbd>⌘K</kbd></button>
        <details class="lang-menu">
          <summary class="rail-tool lang-summary" aria-label="${escapeAttr(ui.language)}">🌐 ${escapeHtml(localeCfg.label)}</summary>
          <ul class="lang-list">${langOptionsHtml}</ul>
        </details>
        <div class="rail-foot-links">
          <button type="button" class="rail-tool theme-toggle" data-toggle-theme data-light-label="${escapeAttr(ui.lightPaper)}" data-dark-label="${escapeAttr(ui.darkCard)}" aria-label="${escapeAttr(ui.lightPaper)} / ${escapeAttr(ui.darkCard)}">☀ / ☾</button>
          <a class="rail-tool" dir="ltr" href="https://github.com/MunMunMiao/dn-ioc" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          <a class="rail-tool" href="/llms.txt">llms.txt</a>
        </div>
      </div>
    </aside>
    <main class="doc-article">
      <header class="chapter-header">
        <p class="chapter-eyebrow">${String(chapter.meta.order).padStart(2, '0')} · ${escapeHtml(ui.parts[chapter.meta.part])}</p>
        <h1 class="chapter-title">${escapeHtml(chapter.meta.title)}</h1>
      </header>
      <div class="doc-sections">
${sectionsHtml}
      </div>
      <nav class="chapter-pager" aria-label="${escapeAttr(`${ui.prev} / ${ui.next}`)}">
        ${prevLinkHtml}
        ${nextLinkHtml}
      </nav>
    </main>
  </div>
  <dialog class="search-modal" id="search-modal" data-search-url="/search-index.${escapeAttr(chapter.locale)}.json" data-no-results="${escapeAttr(ui.noResults)}" aria-label="${escapeAttr(ui.search)}">
    <div class="search-dialog-inner">
      <div class="search-input-row">
        <input type="search" class="search-input" id="search-input" placeholder="${escapeAttr(ui.searchPlaceholder)}" autocomplete="off" spellcheck="false">
        <button type="button" class="search-close" data-close-search aria-label="Close">Esc</button>
      </div>
      <div class="search-results" id="search-results" role="listbox"></div>
    </div>
  </dialog>
  <script src="/assets/notebook.js" defer></script>
</body>
</html>
`
}
