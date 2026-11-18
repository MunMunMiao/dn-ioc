import { createScanner, LanguageVariant, SyntaxKind } from 'typescript/unstable/ast'

export interface HighlightOptions {
  lang: string
  region?: string
}

export interface HighlightedCode {
  html: string
  rawClean: string
  highlightedLines: number[]
}

interface RawToken {
  kind: SyntaxKind
  text: string
}

const REGION_START_RE = /^\s*(?:\/\/|#)\s*#region(?:\s+(\S+))?\s*$/
const REGION_END_RE = /^\s*(?:\/\/|#)\s*#endregion(?:\s+\S+)?\s*$/
const HL_DIRECTIVE_RE = /\s*(?:\/\/\s*\[!hl\]|#\s*\[!hl\]|<!--\s*\[!hl\]\s*-->)\s*$/

const TS_LANGS = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript', 'mts', 'cts', 'mjs', 'cjs'])
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh'])
const JSON_LANGS = new Set(['json', 'jsonc'])
const HTML_LANGS = new Set(['html', 'xml'])

const PRIMITIVE_TYPE_KEYWORDS = new Set<SyntaxKind>([
  SyntaxKind.StringKeyword,
  SyntaxKind.NumberKeyword,
  SyntaxKind.BooleanKeyword,
  SyntaxKind.SymbolKeyword,
  SyntaxKind.BigIntKeyword,
  SyntaxKind.UnknownKeyword,
  SyntaxKind.NeverKeyword,
  SyntaxKind.AnyKeyword,
])

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function extractLines(source: string, region?: string): string[] {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  if (normalized === '' && region === undefined) {
    return []
  }
  const allLines = normalized.split('\n')

  if (region === undefined) {
    return allLines.filter(line => !REGION_START_RE.test(line) && !REGION_END_RE.test(line))
  }

  const extracted: string[] = []
  let depth = 0
  let found = false

  for (const line of allLines) {
    const startMatch = line.match(REGION_START_RE)
    if (startMatch) {
      if (depth === 0 && startMatch[1] === region) {
        found = true
        depth = 1
      } else if (depth > 0) {
        depth += 1
      }
      continue
    }

    if (REGION_END_RE.test(line)) {
      if (depth > 0) {
        depth -= 1
        if (depth === 0) {
          break
        }
      }
      continue
    }

    if (depth > 0) {
      extracted.push(line)
    }
  }

  if (!found) {
    throw new Error(`Unknown code region: ${region}`)
  }

  return extracted
}

function isTrivia(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.WhitespaceTrivia ||
    kind === SyntaxKind.NewLineTrivia ||
    kind === SyntaxKind.SingleLineCommentTrivia ||
    kind === SyntaxKind.MultiLineCommentTrivia
  )
}

function prevSignificantKind(tokens: readonly RawToken[], index: number): SyntaxKind | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const kind = tokens[i]!.kind
    if (!isTrivia(kind)) {
      return kind
    }
  }
  return undefined
}

function nextSignificantIndex(tokens: readonly RawToken[], index: number): number {
  for (let i = index + 1; i < tokens.length; i++) {
    if (!isTrivia(tokens[i]!.kind)) {
      return i
    }
  }
  return -1
}

function isBeforeCallParen(tokens: readonly RawToken[], index: number): boolean {
  const nextIdx = nextSignificantIndex(tokens, index)
  if (nextIdx === -1) {
    return false
  }
  const nextKind = tokens[nextIdx]!.kind
  if (nextKind === SyntaxKind.OpenParenToken) {
    return true
  }
  if (nextKind !== SyntaxKind.LessThanToken) {
    return false
  }

  let depth = 1
  for (let i = nextIdx + 1; i < tokens.length && i <= nextIdx + 48; i++) {
    const k = tokens[i]!.kind
    if (isTrivia(k)) {
      continue
    }
    if (k === SyntaxKind.SemicolonToken || k === SyntaxKind.AmpersandAmpersandToken || k === SyntaxKind.BarBarToken) {
      return false
    }
    if (k === SyntaxKind.LessThanToken) {
      depth += 1
    } else if (k === SyntaxKind.GreaterThanToken) {
      depth -= 1
    } else if (k === SyntaxKind.GreaterThanGreaterThanToken) {
      depth -= 2
    } else if (k === SyntaxKind.GreaterThanGreaterThanGreaterThanToken) {
      depth -= 3
    }
    if (depth <= 0) {
      if (depth < 0) {
        return false
      }
      const afterClose = nextSignificantIndex(tokens, i)
      return afterClose !== -1 && tokens[afterClose]!.kind === SyntaxKind.OpenParenToken
    }
  }
  return false
}

function classifyTsToken(tokens: readonly RawToken[], index: number): string | undefined {
  const tok = tokens[index]!
  const { kind, text } = tok

  if (kind === SyntaxKind.SingleLineCommentTrivia || kind === SyntaxKind.MultiLineCommentTrivia) {
    return 'cm'
  }
  if (
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.RegularExpressionLiteral ||
    (kind >= SyntaxKind.FirstTemplateToken && kind <= SyntaxKind.LastTemplateToken)
  ) {
    return 'str'
  }
  if (PRIMITIVE_TYPE_KEYWORDS.has(kind)) {
    const nextIdx = nextSignificantIndex(tokens, index)
    if (nextIdx !== -1 && tokens[nextIdx]!.kind === SyntaxKind.ColonToken) {
      return undefined
    }
    return 'ty'
  }
  if (kind >= SyntaxKind.FirstKeyword && kind <= SyntaxKind.LastKeyword) {
    return 'kw'
  }
  if (kind === SyntaxKind.Identifier || kind === SyntaxKind.PrivateIdentifier) {
    const prevKind = prevSignificantKind(tokens, index)
    if (prevKind === SyntaxKind.FunctionKeyword) {
      return 'fn'
    }
    if (
      /^[A-Z]/.test(text) ||
      prevKind === SyntaxKind.TypeKeyword ||
      prevKind === SyntaxKind.InterfaceKeyword ||
      prevKind === SyntaxKind.ColonToken
    ) {
      return 'ty'
    }
    if (isBeforeCallParen(tokens, index)) {
      return 'fn'
    }
  }
  return undefined
}

function tokenizeTypeScript(code: string, isJsx: boolean): string[] {
  const scanner = createScanner(false, isJsx ? LanguageVariant.JSX : LanguageVariant.Standard, code)
  const tokens: RawToken[] = []
  const templateBraceStack: number[] = []

  let kind = scanner.scan()
  while (kind !== SyntaxKind.EndOfFile) {
    if (kind === SyntaxKind.CloseBraceToken && templateBraceStack.length > 0) {
      const topIdx = templateBraceStack.length - 1
      if (templateBraceStack[topIdx] === 0) {
        kind = scanner.reScanTemplateToken(false)
        if (kind !== SyntaxKind.TemplateMiddle) {
          templateBraceStack.pop()
        }
      } else {
        templateBraceStack[topIdx]! -= 1
      }
    } else if (kind === SyntaxKind.TemplateHead) {
      templateBraceStack.push(0)
    } else if (kind === SyntaxKind.OpenBraceToken && templateBraceStack.length > 0) {
      templateBraceStack[templateBraceStack.length - 1]! += 1
    }

    tokens.push({ kind, text: scanner.getTokenText() })
    kind = scanner.scan()
  }

  const htmlLines: string[] = ['']
  for (let i = 0; i < tokens.length; i++) {
    const cls = classifyTsToken(tokens, i)
    const parts = tokens[i]!.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) {
        htmlLines.push('')
      }
      const part = parts[p]!
      if (part.length > 0) {
        const escaped = escapeHtml(part)
        htmlLines[htmlLines.length - 1] += cls ? `<span class="${cls}">${escaped}</span>` : escaped
      }
    }
  }
  return htmlLines
}

function tokenizeShellLine(line: string): string {
  const re =
    /(\s+#.*$|^#.*$|"(?:\\.|[^"\\])*"|'(?:[^']*)'|(?<=^|\s)--?[a-zA-Z0-9][\w-]*|(?<=^|[\s;|&(])(?:npm|pnpm|yarn|bun|deno|npx|git|cd|export|curl|mkdir|rm)(?=$|[\s;|&)]))/g
  let out = ''
  let pos = 0

  for (const match of line.matchAll(re)) {
    const idx = match.index ?? 0
    if (idx > pos) {
      out += escapeHtml(line.slice(pos, idx))
    }
    const token = match[0]
    const trimmedCommentIdx = token.indexOf('#')
    if (trimmedCommentIdx !== -1 && token.slice(0, trimmedCommentIdx).trim() === '') {
      out += `${escapeHtml(token.slice(0, trimmedCommentIdx))}<span class="cm">${escapeHtml(token.slice(trimmedCommentIdx))}</span>`
    } else if (token.startsWith('"') || token.startsWith("'")) {
      out += `<span class="str">${escapeHtml(token)}</span>`
    } else if (token.startsWith('-')) {
      out += `<span class="kw">${escapeHtml(token)}</span>`
    } else {
      out += `<span class="fn">${escapeHtml(token)}</span>`
    }
    pos = idx + token.length
  }

  if (pos < line.length) {
    out += escapeHtml(line.slice(pos))
  }
  return out
}

function tokenizeJsonLine(line: string): string {
  const re = /(\/\/.*$|"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b)/g
  let out = ''
  let pos = 0

  for (const match of line.matchAll(re)) {
    const idx = match.index ?? 0
    if (idx > pos) {
      out += escapeHtml(line.slice(pos, idx))
    }
    const token = match[0]
    if (token.startsWith('//')) {
      out += `<span class="cm">${escapeHtml(token)}</span>`
    } else if (token.startsWith('"')) {
      const after = line.slice(idx + token.length)
      const cls = /^\s*:/.test(after) ? 'ty' : 'str'
      out += `<span class="${cls}">${escapeHtml(token)}</span>`
    } else {
      out += `<span class="kw">${escapeHtml(token)}</span>`
    }
    pos = idx + token.length
  }

  if (pos < line.length) {
    out += escapeHtml(line.slice(pos))
  }
  return out
}

function tokenizeHtmlLine(line: string): string {
  const re = /(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z][\w:-]*|\s+[a-zA-Z_:][\w:.-]*(?=\s*=)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi
  let out = ''
  let pos = 0

  for (const match of line.matchAll(re)) {
    const idx = match.index ?? 0
    if (idx > pos) {
      out += escapeHtml(line.slice(pos, idx))
    }
    const token = match[0]
    if (token.startsWith('<!--')) {
      out += `<span class="cm">${escapeHtml(token)}</span>`
    } else if (token.toUpperCase().startsWith('<!DOCTYPE')) {
      out += `<span class="kw">${escapeHtml(token)}</span>`
    } else if (token.startsWith('</')) {
      out += `&lt;/<span class="kw">${escapeHtml(token.slice(2))}</span>`
    } else if (token.startsWith('<')) {
      out += `&lt;<span class="kw">${escapeHtml(token.slice(1))}</span>`
    } else if (token.startsWith('"') || token.startsWith("'")) {
      out += `<span class="str">${escapeHtml(token)}</span>`
    } else {
      const wsMatch = token.match(/^(\s+)(.+)$/)
      if (wsMatch) {
        out += `${escapeHtml(wsMatch[1]!)}<span class="ty">${escapeHtml(wsMatch[2]!)}</span>`
      } else {
        out += escapeHtml(token)
      }
    }
    pos = idx + token.length
  }

  if (pos < line.length) {
    out += escapeHtml(line.slice(pos))
  }
  return out
}

export function renderCodeLines(source: string, options: HighlightOptions): HighlightedCode {
  const regionLines = extractLines(source, options.region)
  if (regionLines.length === 0) {
    return { html: '', rawClean: '', highlightedLines: [] }
  }

  const highlightedLines: number[] = []
  const cleanLines = regionLines.map((line, idx) => {
    if (HL_DIRECTIVE_RE.test(line)) {
      highlightedLines.push(idx + 1)
      return line.replace(HL_DIRECTIVE_RE, '')
    }
    return line
  })

  const rawClean = cleanLines.join('\n')
  const lang = options.lang.trim().toLowerCase()

  let renderedLines: string[]
  if (TS_LANGS.has(lang)) {
    renderedLines = tokenizeTypeScript(rawClean, lang === 'tsx' || lang === 'jsx')
  } else if (SHELL_LANGS.has(lang)) {
    renderedLines = cleanLines.map(tokenizeShellLine)
  } else if (JSON_LANGS.has(lang)) {
    renderedLines = cleanLines.map(tokenizeJsonLine)
  } else if (HTML_LANGS.has(lang)) {
    renderedLines = cleanLines.map(tokenizeHtmlLine)
  } else {
    renderedLines = cleanLines.map(escapeHtml)
  }

  const hlSet = new Set(highlightedLines)
  const html = renderedLines
    .map((lineHtml, idx) => {
      const lineNumber = idx + 1
      const cls = hlSet.has(lineNumber) ? 'pl hl' : 'pl'
      return `<span class="${cls}"><span class="pln">${lineNumber}</span>${lineHtml}</span>`
    })
    .join('')

  return { html, rawClean, highlightedLines }
}
