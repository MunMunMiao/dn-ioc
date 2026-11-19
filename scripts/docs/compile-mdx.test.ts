import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileMdxFile, renderChapterPage, slugifyHeading } from './compile-mdx'

describe('slugifyHeading', () => {
  test('preserves CJK, Japanese, Korean, and accented characters and deduplicates', () => {
    const seen = new Set<string>()
    expect(slugifyHeading('为什么选择 Token 而不是 Ref？', seen)).toBe('为什么选择-token-而不是-ref')
    expect(slugifyHeading('スコープと Subtree', seen)).toBe('スコープと-subtree')
    expect(slugifyHeading('スコープと Subtree', seen)).toBe('スコープと-subtree-2')
    expect(slugifyHeading('왜 데코레이터가 필요 없나요?', seen)).toBe('왜-데코레이터가-필요-없나요')
    expect(slugifyHeading('Patrón de Inyección & Résumé', seen)).toBe('patrón-de-inyección-résumé')
  })
})

describe('compileMdxFile & renderChapterPage', () => {
  test('imports .ts files, renders code blocks inline between surrounding paragraphs without duplication, and emits borderless rail + hreflang', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-'))
    try {
      await writeFile(join(dir, 'sample.ts'), `import { x } from '../domain/order'\nexport const k = 42 // [!hl]\n`)
      await writeFile(join(dir, 'second.ts'), `export const m = 'ok'\n`)
      const mdxPath = join(dir, '01-test.mdx')
      await writeFile(
        mdxPath,
        `---\ntitle: DDD Guide\nslug: ddd\npart: patterns\norder: 11\nsummary: Clean layers.\n---\nimport sample from './sample.ts' with { type: 'text' }\nimport second from './second.ts' with { type: 'text' }\n\nLead text.\n\n## Wiring Layers\n\nBefore code paragraph.\n\n<CodeTabs files={[{ title: 'domain/order.ts', code: sample }, { title: 'main.ts', code: second }]} />\n\nAfter code paragraph.\n\n## Pure Prose Rules\n\nNo code block in this section.\n`,
      )
      const ch = await compileMdxFile(mdxPath, 'en-US')
      expect(ch.sections).toHaveLength(3)
      const wiringHtml = ch.sections[1]?.html ?? ''
      const beforeIdx = wiringHtml.indexOf('Before code paragraph.')
      const codeIdx = wiringHtml.indexOf('class="paper-code paper-code-tree"')
      const afterIdx = wiringHtml.indexOf('After code paragraph.')
      expect(beforeIdx).toBeGreaterThan(-1)
      expect(codeIdx).toBeGreaterThan(beforeIdx)
      expect(afterIdx).toBeGreaterThan(codeIdx)

      const html = renderChapterPage(ch, [ch], '0.3.1')
      expect(html).toContain('lang="en-US"')
      expect(html).toContain('data-theme-pref="auto"')
      expect(html).toContain('hreflang="zh-Hans" href="https://dn-ioc.lyz.cloud/zh-hans/ddd/"')
      expect(html).toContain('hreflang="en" href="https://dn-ioc.lyz.cloud/ddd/"')
      expect(html).toContain('hreflang="x-default" href="https://dn-ioc.lyz.cloud/ddd/"')
      expect(html).toContain('<span class="p-filename">domain/order.ts</span>')
      expect(html).toContain('<span class="p-tree-dir-name">domain/</span>')
      expect(html).toContain('data-file="0" data-path="domain/order.ts"')
      expect(html).toContain('>order.ts</button>')
      expect(html).toContain('data-file="1" data-path="main.ts"')
      expect(html).toContain('>main.ts</button>')
      expect(html).not.toContain('class="p-tabs"')
      expect(html).not.toContain('class="p-tab')
      expect(html).toContain('class="theme-group"')
      expect(html).toContain('data-theme-set="auto"')
      expect(html).toContain('data-theme-set="light"')
      expect(html).toContain('data-theme-set="dark"')
      expect(html).not.toContain('data-toggle-theme')
      expect(html).toContain('../domain/order')
      expect(html).toContain('class="doc-shell"')
      expect(html).toContain('id="doc-rail"')
      expect(html).toContain('class="doc-article"')
      expect(html).toContain('data-toggle-contents')
      expect(html).toContain('aria-controls="doc-rail"')
      expect(html).not.toContain('notebook-open')
      expect(html).not.toContain('spread-right')
      expect(html).not.toContain('mobile-deck')
      expect(html).not.toContain('folio-page-num')
      expect(html).not.toContain('[!hl]')
      expect(html.match(/class="paper-code/g)).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('supports ?raw imports, <Code region>, fenced code blocks, nested <Code> inside <Callout>, and GFM tables inline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-features-'))
    try {
      await writeFile(
        join(dir, 'snippet.ts'),
        `// #region boot\nexport const tokenVal = '<unsafe>' // [!hl]\n// #endregion\nexport const unused = 0\n`,
      )
      const mdxPath = join(dir, '02-install.mdx')
      await writeFile(
        mdxPath,
        [
          '---',
          'title: "Installation & Setup: Fast"',
          'slug: installation',
          'part: start',
          'order: 2',
          'summary: Install dn-ioc anywhere.',
          '---',
          `import snippet from './snippet.ts?raw'`,
          '',
          '## Shell Install',
          '',
          '| Runtime | Command |',
          '| :--- | ---: |',
          '| Bun | `bun add dn-ioc` |',
          '',
          '```bash',
          'bun add dn-ioc',
          `import untouched from './missing.ts' with { type: 'text' }`,
          '```',
          '',
          '## Region & Callout',
          '',
          '<Callout kind="caution" title="Heads <Up>">',
          '  Keep `Token<Order>` pure.',
          '',
          '  <Code title="boot.ts" code={snippet} region="boot" />',
          '</Callout>',
          '',
        ].join('\n'),
      )

      const ch = await compileMdxFile(mdxPath, 'zh-Hans')
      expect(ch.sections).toHaveLength(2)

      expect(ch.sections[0]?.html).toContain('<table>')
      expect(ch.sections[0]?.html).toContain('style="text-align:right"')
      expect(ch.sections[0]?.html).toContain('class="paper-code"')
      expect(ch.sections[0]?.html).toContain('./missing.ts')

      expect(ch.sections[1]?.html).toContain('class="callout callout-caution"')
      expect(ch.sections[1]?.html).toContain('Heads &lt;Up&gt;')
      expect(ch.sections[1]?.html).toContain('Token&lt;Order&gt;')
      expect(ch.sections[1]?.html).toContain('<span class="p-filename">boot.ts</span>')
      expect(ch.sections[1]?.html).not.toContain('paper-code-tree')
      expect(ch.sections[1]?.html).not.toContain('p-tree')
      expect(ch.sections[1]?.html).not.toContain('p-tab')
      expect(ch.sections[1]?.html).toContain('&lt;unsafe&gt;')
      expect(ch.sections[1]?.html).not.toContain('unused')
      expect(ch.sections[1]?.html).not.toContain('#region')
      expect(ch.sections[1]?.html).toContain('data-copy="复制"')
      expect(ch.sections[1]?.html).toContain('data-copied="已复制"')

      expect(ch.searchEntries.map(e => e.href)).toEqual([
        '/zh-hans/installation/',
        '/zh-hans/installation/#shell-install',
        '/zh-hans/installation/#region-callout',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('renders transparent multi-part rail navigation, prev/next chapter pager without page numbers, and search modal hooks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-nav-'))
    try {
      const ch1Path = join(dir, '01-overview.mdx')
      const ch2Path = join(dir, '02-tokens.mdx')
      await writeFile(ch1Path, `---\ntitle: 概览\nslug: ""\npart: start\norder: 1\nsummary: 简介\n---\n你好。\n`)
      await writeFile(ch2Path, `---\ntitle: Token 绑定\nslug: tokens\npart: kernel\norder: 2\nsummary: 契约\n---\n内容。\n`)

      const ch1 = await compileMdxFile(ch1Path, 'zh-Hans')
      const ch2 = await compileMdxFile(ch2Path, 'zh-Hans')

      const html1 = renderChapterPage(ch1, [ch2, ch1], '0.3.1')
      expect(html1).toContain('<a class="rail-brand" href="/zh-hans/"><strong>dn-ioc</strong></a>')
      expect(html1).toContain('<a class="mobile-brand" href="/zh-hans/">dn-ioc</a>')
      expect(html1).not.toContain('v0.3.1')
      expect(html1).toContain('<aside class="doc-rail" id="doc-rail">')
      expect(html1).toContain('<nav class="rail-nav" aria-label="目录">')
      expect(html1).toContain('<p class="rail-group-title">')
      expect(html1).not.toContain('<h2 class="rail-group-title">')
      expect(html1).toContain('<nav class="chapter-pager" aria-label="上一章 / 下一章">')
      expect(html1).toContain('class="rail-foot"')
      expect(html1).toContain('class="rail-link is-current"')
      expect(html1).toContain('href="/zh-hans/tokens/"')
      expect(html1).toContain('下一章: Token 绑定 →')
      expect(html1).not.toContain('上一章:')
      expect(html1).not.toContain('folio-page-num')
      expect(html1).toContain('data-search-url="/search-index.zh-Hans.json"')

      const html2 = renderChapterPage(ch2, [ch2, ch1], '0.3.1')
      expect(html2).toContain('href="/zh-hans/"')
      expect(html2).toContain('← 上一章: 概览')
      expect(html2).not.toContain('下一章:')
      expect(html2).toContain('hreflang="zh-Hant-HK" href="https://dn-ioc.lyz.cloud/zh-hant-hk/tokens/"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('rejects malformed or incomplete frontmatter with descriptive errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-err-'))
    try {
      const noFm = join(dir, 'no-fm.mdx')
      await writeFile(noFm, 'Just text.\n')
      await expect(compileMdxFile(noFm, 'en-US')).rejects.toThrow(/frontmatter/i)

      const badPart = join(dir, 'bad-part.mdx')
      await writeFile(badPart, `---\ntitle: X\nslug: x\npart: unknown\norder: 1\nsummary: S\n---\nHi\n`)
      await expect(compileMdxFile(badPart, 'en-US')).rejects.toThrow(/part/i)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('emits dir="rtl", IBM Plex Sans Arabic font, LTR code blocks, Arabic slug anchors, and RTL pager arrows for ar', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-ar-'))
    try {
      await writeFile(join(dir, 'sample.ts'), `export const value = 1\n`)
      const ch1Path = join(dir, '01-overview.mdx')
      const ch2Path = join(dir, '02-install.mdx')
      const enPath = join(dir, '01-en.mdx')
      await writeFile(ch1Path, `---\ntitle: نظرة عامة\nslug: ""\npart: start\norder: 1\nsummary: مقدمة سريعة.\n---\nمرحباً بك.\n`)
      await writeFile(
        ch2Path,
        [
          '---',
          'title: التثبيت السريع',
          'slug: installation',
          'part: start',
          'order: 2',
          'summary: تثبيت الحزمة.',
          '---',
          `import sample from './sample.ts' with { type: 'text' }`,
          '',
          '## تثبيت عبر Bun',
          '',
          '<Code title="sample.ts" code={sample} />',
          '',
        ].join('\n'),
      )
      await writeFile(enPath, `---\ntitle: Overview\nslug: ""\npart: start\norder: 1\nsummary: Intro.\n---\nHello.\n`)

      const ch1 = await compileMdxFile(ch1Path, 'ar')
      const ch2 = await compileMdxFile(ch2Path, 'ar')
      const enCh = await compileMdxFile(enPath, 'en-US')

      expect(ch2.sections.find(s => s.level === 2)?.id).toBe('تثبيت-عبر-bun')
      expect(ch2.searchEntries.map(e => e.href)).toEqual(['/ar/installation/', '/ar/installation/#تثبيت-عبر-bun'])

      const html1 = renderChapterPage(ch1, [ch2, ch1], '0.3.1')
      const html2 = renderChapterPage(ch2, [ch2, ch1], '0.3.1')
      const htmlEn = renderChapterPage(enCh, [enCh], '0.3.1')

      expect(html1).toContain('<html lang="ar" dir="rtl" data-locale="ar" data-mode="light" data-theme-pref="auto">')
      expect(html1).toContain('IBM+Plex+Sans+Arabic')
      expect(htmlEn).toContain('<html lang="en-US" dir="ltr" data-locale="en-US" data-mode="light" data-theme-pref="auto">')
      expect(htmlEn).not.toContain('IBM+Plex+Sans+Arabic')

      expect(html2).toContain('<div class="paper-code" dir="ltr">')
      expect(html2).not.toContain('paper-code-tree')
      expect(html2).toContain('<section class="doc-section" id="تثبيت-عبر-bun">')
      expect(html1).toContain('التالي: التثبيت السريع ←')
      expect(html1).not.toContain('السابق:')
      expect(html2).toContain('→ السابق: نظرة عامة')
      expect(html2).not.toContain('التالي:')
      expect(html1).toContain('hreflang="ar" href="https://dn-ioc.lyz.cloud/ar/"')
      expect(html2).toContain('hreflang="ar" href="https://dn-ioc.lyz.cloud/ar/installation/"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
