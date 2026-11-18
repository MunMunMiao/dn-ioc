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
  test('imports .ts files, splits ## sections into left steps + right decks, and carries forward active deck on prose-only sections', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-'))
    try {
      await writeFile(join(dir, 'sample.ts'), `import { x } from '../domain/order'\nexport const k = 42 // [!hl]\n`)
      await writeFile(join(dir, 'second.ts'), `export const m = 'ok'\n`)
      const mdxPath = join(dir, '01-test.mdx')
      await writeFile(
        mdxPath,
        `---\ntitle: DDD Guide\nslug: ddd\npart: patterns\norder: 11\nsummary: Clean layers.\n---\nimport sample from './sample.ts' with { type: 'text' }\nimport second from './second.ts' with { type: 'text' }\n\nLead text.\n\n## Wiring Layers\n\nExplain wiring.\n\n<CodeTabs files={[{ title: 'domain/order.ts', code: sample }, { title: 'main.ts', code: second }]} />\n\n## Pure Prose Rules\n\nNo code block in this section.\n`,
      )
      const ch = await compileMdxFile(mdxPath, 'en-US')
      expect(ch.steps).toHaveLength(3)
      expect(ch.decks).toHaveLength(1)
      expect(ch.steps[0]?.deckIndex).toBe(0)
      expect(ch.steps[0]?.inlineDeckHtml).toBe('')
      expect(ch.steps[1]?.deckIndex).toBe(0)
      expect(ch.steps[1]?.inlineDeckHtml).toContain('domain/order.ts')
      expect(ch.steps[1]?.inlineDeckHtml).toContain('../domain/order')
      expect(ch.steps[2]?.deckIndex).toBe(0) // carried forward so right page never blanks
      expect(ch.steps[2]?.inlineDeckHtml).toBe('') // mobile does not duplicate carried-forward deck

      const html = renderChapterPage(ch, [ch], '0.3.1')
      expect(html).toContain('lang="en-US"')
      expect(html).toContain('hreflang="zh-Hans" href="https://dn-ioc.lyz.cloud/zh-hans/ddd/"')
      expect(html).toContain('hreflang="en" href="https://dn-ioc.lyz.cloud/ddd/"')
      expect(html).toContain('hreflang="x-default" href="https://dn-ioc.lyz.cloud/ddd/"')
      expect(html).toContain('domain/order.ts')
      expect(html).toContain('main.ts')
      expect(html).toContain('../domain/order')
      expect(html).not.toContain('[!hl]')
      // Exactly one mobile-deck emitted (only on step 1, not on step 0 or step 2)
      expect(html.match(/class="mobile-deck"/g)).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('supports ?raw imports, <Code region>, fenced code blocks, <Callout>, GFM tables, and preserves import text inside fences', async () => {
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
          '</Callout>',
          '',
          '<Code title="boot.ts" code={snippet} region="boot" />',
          '',
        ].join('\n'),
      )

      const ch = await compileMdxFile(mdxPath, 'zh-Hans')
      expect(ch.steps).toHaveLength(2)
      expect(ch.decks).toHaveLength(2)

      // Step 0 is ## Shell Install with GFM table on left and fenced bash block on right
      expect(ch.steps[0]?.leftHtml).toContain('<table>')
      expect(ch.steps[0]?.leftHtml).toContain('style="text-align:right"')
      expect(ch.steps[0]?.leftHtml).not.toContain('<pre')
      expect(ch.decks[0]?.label).toBe('bash')
      expect(ch.decks[0]?.html).toContain('bun')
      expect(ch.decks[0]?.html).toContain('./missing.ts')

      // Step 1 has Callout on left (HTML-escaped) and sliced #region boot on right
      expect(ch.steps[1]?.leftHtml).toContain('class="callout callout-caution"')
      expect(ch.steps[1]?.leftHtml).toContain('Heads &lt;Up&gt;')
      expect(ch.steps[1]?.leftHtml).toContain('Token&lt;Order&gt;')
      expect(ch.decks[1]?.label).toBe('boot.ts')
      expect(ch.decks[1]?.html).toContain('&lt;unsafe&gt;')
      expect(ch.decks[1]?.html).not.toContain('unused')
      expect(ch.decks[1]?.html).toContain('data-copy="复制"')
      expect(ch.decks[1]?.html).toContain('data-copied="已复制"')

      // Search entries include chapter entry + both ## section anchors
      expect(ch.searchEntries.map(e => e.href)).toEqual([
        '/zh-hans/installation/',
        '/zh-hans/installation/#shell-install',
        '/zh-hans/installation/#region-callout',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('renders multi-chapter contents drawer, prev/next folio navigation, and search modal hooks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dn-mdx-nav-'))
    try {
      const ch1Path = join(dir, '01-overview.mdx')
      const ch2Path = join(dir, '02-tokens.mdx')
      await writeFile(ch1Path, `---\ntitle: 概览\nslug: ""\npart: start\norder: 1\nsummary: 简介\n---\n你好。\n`)
      await writeFile(ch2Path, `---\ntitle: Token 绑定\nslug: tokens\npart: kernel\norder: 2\nsummary: 契约\n---\n内容。\n`)

      const ch1 = await compileMdxFile(ch1Path, 'zh-Hans')
      const ch2 = await compileMdxFile(ch2Path, 'zh-Hans')

      expect(ch1.decks).toHaveLength(0)
      expect(ch1.steps[0]?.deckIndex).toBe(-1)

      const html1 = renderChapterPage(ch1, [ch2, ch1], '0.3.1')
      expect(html1).toContain('dn-ioc v0.3.1')
      expect(html1).toContain('href="/zh-hans/tokens/"')
      expect(html1).toContain('下一章: Token 绑定 →')
      expect(html1).not.toContain('上一章:')
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
})
