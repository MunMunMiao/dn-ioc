import { describe, expect, test } from 'bun:test'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCALES } from '../../docs/locales'
import { resolveActiveLocales, runDocsBuild } from '../build-docs'
import { buildDocsSite } from './build-site'

describe('buildDocsSite', () => {
  test('builds multiple locales, emits search indices and llms.txt, and rejects slug parity mismatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dn-site-'))
    try {
      await mkdir(join(root, 'content/en-US'), { recursive: true })
      await mkdir(join(root, 'content/zh-Hans'), { recursive: true })
      await mkdir(join(root, 'assets'), { recursive: true })
      await writeFile(join(root, 'assets/notebook.css'), 'body {}')
      await writeFile(join(root, 'assets/notebook.js'), '')
      await writeFile(join(root, 'llms.txt'), '# dn-ioc')

      const overviewEn = `---\ntitle: Overview\nslug: ""\npart: start\norder: 1\nsummary: Intro\n---\nHello.\n`
      const overviewZh = `---\ntitle: 概览\nslug: ""\npart: start\norder: 1\nsummary: 简介\n---\n你好。\n`
      await writeFile(join(root, 'content/en-US/01-overview.mdx'), overviewEn)
      await writeFile(join(root, 'content/zh-Hans/01-overview.mdx'), overviewZh)

      const res = await buildDocsSite({
        contentDir: join(root, 'content'),
        assetsDir: join(root, 'assets'),
        llmsPath: join(root, 'llms.txt'),
        outDir: join(root, 'dist'),
        version: '0.3.1',
        locales: ['en-US', 'zh-Hans'],
      })
      expect(res.pagesWritten).toBe(2)
      expect(res.localesBuilt).toEqual(['en-US', 'zh-Hans'])
      expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toContain('Overview')
      expect(await readFile(join(root, 'dist/zh-hans/index.html'), 'utf8')).toContain('概览')
      expect(await readFile(join(root, 'dist/search-index.zh-Hans.json'), 'utf8')).toContain('概览')

      const redirects = await readFile(join(root, 'dist/_redirects'), 'utf8')
      expect(redirects).toContain('/zh-Hans/* /zh-hans/:splat 301')
      expect(redirects).toContain('/zh-Hant-HK/* /zh-hant-hk/:splat 301')
      expect(redirects).toContain('/zh-Hant-TW/* /zh-hant-tw/:splat 301')
      expect(redirects).toContain('/en-US/* /:splat 301')

      expect(await readFile(join(root, 'dist/llms.txt'), 'utf8')).toBe('# dn-ioc')
      expect(await readFile(join(root, 'dist/assets/notebook.css'), 'utf8')).toBe('body {}')

      // Add extra chapter to en-US only -> must fail parity check
      await writeFile(
        join(root, 'content/en-US/02-extra.mdx'),
        `---\ntitle: Extra\nslug: extra\npart: start\norder: 2\nsummary: x\n---\nBody.\n`,
      )
      await expect(
        buildDocsSite({
          contentDir: join(root, 'content'),
          assetsDir: join(root, 'assets'),
          llmsPath: join(root, 'llms.txt'),
          outDir: join(root, 'dist'),
          version: '0.3.1',
          locales: ['en-US', 'zh-Hans'],
        }),
      ).rejects.toThrow(/parity/i)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('cleans stale output files and rejects mismatched slug or order sequences with equal count', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dn-site-parity-'))
    try {
      await mkdir(join(root, 'content/en-US'), { recursive: true })
      await mkdir(join(root, 'content/ja'), { recursive: true })
      await mkdir(join(root, 'assets'), { recursive: true })
      await mkdir(join(root, 'dist'), { recursive: true })
      await writeFile(join(root, 'dist/stale.txt'), 'old')
      await writeFile(join(root, 'assets/notebook.css'), 'body {}')
      await writeFile(join(root, 'assets/notebook.js'), '')
      await writeFile(join(root, 'llms.txt'), '# dn-ioc')

      await writeFile(
        join(root, 'content/en-US/01-overview.mdx'),
        `---\ntitle: Overview\nslug: ""\npart: start\norder: 1\nsummary: Intro\n---\nSee [DDD](/ddd/).\n`,
      )
      await writeFile(
        join(root, 'content/ja/01-overview.mdx'),
        `---\ntitle: 概要\nslug: ""\npart: start\norder: 1\nsummary: イントロ\n---\n[DDD](/ja/ddd/) を参照。\n`,
      )

      // Partial authoring (< 14 chapters) allows forward links to not-yet-authored chapters
      await buildDocsSite({
        contentDir: join(root, 'content'),
        assetsDir: join(root, 'assets'),
        llmsPath: join(root, 'llms.txt'),
        outDir: join(root, 'dist'),
        version: '0.3.1',
        locales: ['en-US', 'ja'],
      })

      await expect(access(join(root, 'dist/stale.txt'))).rejects.toThrow()
      expect(await readFile(join(root, 'dist/ja/index.html'), 'utf8')).toContain('概要')

      // Equal chapter count (2 vs 2) but mismatched slug -> must fail parity check
      await writeFile(
        join(root, 'content/en-US/02-quickstart.mdx'),
        `---\ntitle: Quickstart\nslug: quickstart\npart: start\norder: 2\nsummary: q\n---\nBody.\n`,
      )
      await writeFile(
        join(root, 'content/ja/02-quickstart.mdx'),
        `---\ntitle: クイックスタート\nslug: install\npart: start\norder: 2\nsummary: q\n---\nBody.\n`,
      )

      await expect(
        buildDocsSite({
          contentDir: join(root, 'content'),
          assetsDir: join(root, 'assets'),
          llmsPath: join(root, 'llms.txt'),
          outDir: join(root, 'dist'),
          version: '0.3.1',
          locales: ['en-US', 'ja'],
        }),
      ).rejects.toThrow(/parity/i)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('enforces cross-chapter internal link target existence when a locale has all 14 chapters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dn-site-links-'))
    try {
      await mkdir(join(root, 'content/en-US'), { recursive: true })
      await mkdir(join(root, 'assets'), { recursive: true })
      await writeFile(join(root, 'assets/notebook.css'), 'body {}')
      await writeFile(join(root, 'assets/notebook.js'), '')
      await writeFile(join(root, 'llms.txt'), '# dn-ioc')

      const slugs = [
        '',
        'installation',
        'quickstart',
        'providers',
        'tokens',
        'scopes',
        'async',
        'lifecycle',
        'architecture',
        'mvc',
        'ddd',
        'testing',
        'api',
        'errors',
      ]

      for (let i = 0; i < slugs.length; i++) {
        const num = String(i + 1).padStart(2, '0')
        const slug = slugs[i]!
        const body = i === 0 ? 'Jump to [DDD](/ddd/#intro) or [LLM](/llms.txt).' : `## Intro\n\nChapter ${i + 1} content.`
        await writeFile(
          join(root, `content/en-US/${num}-${slug || 'overview'}.mdx`),
          `---\ntitle: Chapter ${i + 1}\nslug: "${slug}"\npart: start\norder: ${i + 1}\nsummary: Summary ${i + 1}\n---\n${body}\n`,
        )
      }

      // Valid internal links across 14 chapters build cleanly even when only en-US is built
      const ok = await buildDocsSite({
        contentDir: join(root, 'content'),
        assetsDir: join(root, 'assets'),
        llmsPath: join(root, 'llms.txt'),
        outDir: join(root, 'dist'),
        version: '0.3.1',
        locales: ['en-US'],
      })
      expect(ok.pagesWritten).toBe(14)

      // Introduce a broken internal link in chapter 01 -> must fail link validation
      await writeFile(
        join(root, 'content/en-US/01-overview.mdx'),
        `---\ntitle: Chapter 1\nslug: ""\npart: start\norder: 1\nsummary: Summary 1\n---\nBroken [link](/non-existent-route/).\n`,
      )

      await expect(
        buildDocsSite({
          contentDir: join(root, 'content'),
          assetsDir: join(root, 'assets'),
          llmsPath: join(root, 'llms.txt'),
          outDir: join(root, 'dist'),
          version: '0.3.1',
          locales: ['en-US'],
        }),
      ).rejects.toThrow(/\/non-existent-route\//)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('resolveActiveLocales and runDocsBuild detect present locale folders and require en-US or all 8 in strict mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dn-docs-cli-'))
    try {
      await mkdir(join(root, 'docs/assets'), { recursive: true })
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'dn-ioc', version: '0.3.1' }))
      await writeFile(join(root, 'docs/assets/notebook.css'), 'body {}')
      await writeFile(join(root, 'docs/assets/notebook.js'), '')
      await writeFile(join(root, 'docs/llms.txt'), '# dn-ioc')

      await expect(resolveActiveLocales(join(root, 'docs/content'), false)).rejects.toThrow(/en-US/)

      await mkdir(join(root, 'docs/content/en-US'), { recursive: true })
      await mkdir(join(root, 'docs/content/es'), { recursive: true })
      await writeFile(
        join(root, 'docs/content/en-US/01-overview.mdx'),
        `---\ntitle: Overview\nslug: ""\npart: start\norder: 1\nsummary: Intro\n---\nHello.\n`,
      )
      await writeFile(
        join(root, 'docs/content/es/01-overview.mdx'),
        `---\ntitle: Resumen\nslug: ""\npart: start\norder: 1\nsummary: Intro\n---\nHola.\n`,
      )

      const built = await runDocsBuild(root, false)
      expect(built.localesBuilt).toEqual(['en-US', 'es'])
      expect(built.pagesWritten).toBe(2)

      expect(await resolveActiveLocales(join(root, 'docs/content'))).toEqual(LOCALES.map(loc => loc.code))
      await expect(runDocsBuild(root)).rejects.toThrow(/zh-Hans/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('ships borderless neutral-white paper CSS tokens and streamlined client script', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const css = await readFile(join(repoRoot, 'docs/assets/notebook.css'), 'utf8')
    const js = await readFile(join(repoRoot, 'docs/assets/notebook.js'), 'utf8')

    expect(css).toMatch(/--sheet:\s*#f8f8f7/i)
    expect(css).toMatch(/--vellum:\s*#f0f0ee/i)
    expect(css).toMatch(/--vellum-tab:\s*#e8e8e5/i)
    expect(css).toMatch(/--ink-primary:\s*#161615/i)
    expect(css).toMatch(/--accent:\s*#c94628/i)
    expect(css).toMatch(/--grain-opacity:\s*0\.042/)

    expect(css).toMatch(/--sheet:\s*#161617/i)
    expect(css).toMatch(/--vellum:\s*#111112/i)
    expect(css).toMatch(/--vellum-tab:\s*#1c1c1e/i)
    expect(css).toMatch(/--ink-primary:\s*#efefef/i)
    expect(css).toMatch(/--accent:\s*#e56b4e/i)
    expect(css).toMatch(/--grain-opacity:\s*0\.028/)

    expect(css).not.toContain('--desk:')
    expect(css).not.toContain('--spine-gradient')
    expect(css).not.toContain('.notebook-open')
    expect(css).not.toContain('.spread-right')
    expect(css).not.toContain('.mobile-deck')
    expect(css).toContain('@media (max-width: 920px)')

    expect(js).toContain('dn-ioc-theme')
    expect(js).toContain('data-raw')
    expect(js).toContain('data-search-url')
    expect(js).toContain('doc-rail')
    expect(js).not.toContain('IntersectionObserver')
    expect(js).not.toContain('spread-right')
  })

  test('keeps .doc-rail non-clipping for upward language popup, wires mobile drawer toggle, and guards IME composition including keyCode 229', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const css = await readFile(join(repoRoot, 'docs/assets/notebook.css'), 'utf8')
    const js = await readFile(join(repoRoot, 'docs/assets/notebook.js'), 'utf8')

    const extractBlocks = (selector: string): string[] => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g')
      return Array.from(css.matchAll(re), m => m[1] ?? '')
    }

    const docRailBlocks = extractBlocks('.doc-rail')
    expect(docRailBlocks.length).toBeGreaterThan(0)
    for (const decls of docRailBlocks) {
      expect(decls).not.toMatch(/overflow-y\s*:\s*auto/i)
      expect(decls).not.toMatch(/overflow\s*:\s*hidden/i)
    }

    const railNavCss = extractBlocks('.rail-nav').join('\n')
    expect(railNavCss).toMatch(/overflow-y:\s*auto/)

    const langListCss = extractBlocks('.lang-list').join('\n')
    expect(langListCss).toMatch(/bottom:\s*calc\(100%\s*\+\s*6px\)/)

    const bodyAfterCss = extractBlocks('body::after').join('\n')
    expect(bodyAfterCss).toMatch(/pointer-events:\s*none/)
    expect(bodyAfterCss).toMatch(/background-repeat:\s*repeat/)

    const noop = () => undefined

    class MockElement {
      attrs = new Map<string, string>()
      classes = new Set<string>()
      hidden = false
      listeners = new Map<string, ((event: Record<string, unknown>) => void)[]>()
      classList = {
        add: (...names: string[]) => {
          for (const name of names) {
            this.classes.add(name)
          }
        },
        remove: (...names: string[]) => {
          for (const name of names) {
            this.classes.delete(name)
          }
        },
        contains: (name: string) => this.classes.has(name),
        toggle: (name: string, force?: boolean) => {
          const shouldAdd = force ?? !this.classes.has(name)
          if (shouldAdd) {
            this.classes.add(name)
          } else {
            this.classes.delete(name)
          }
          return shouldAdd
        },
      }
      addEventListener(type: string, handler: (event: Record<string, unknown>) => void) {
        const list = this.listeners.get(type) ?? []
        list.push(handler)
        this.listeners.set(type, list)
      }
      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }
      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
      hasAttribute(name: string) {
        return this.attrs.has(name)
      }
      removeAttribute(name: string) {
        this.attrs.delete(name)
      }
      contains(target: unknown) {
        return target === this
      }
      closest() {
        return null
      }
    }
    class MockHTMLElement extends MockElement {
      isContentEditable = false
    }
    class MockHTMLInputElement extends MockHTMLElement {
      value = ''
      focus = noop
      select = noop
    }
    class MockHTMLTextAreaElement extends MockHTMLElement {}
    class MockHTMLSelectElement extends MockHTMLElement {}
    class MockHTMLDialogElement extends MockHTMLElement {
      open = false
      showModal() {
        this.open = true
      }
      close() {
        this.open = false
      }
    }

    const mockDocRail = new MockHTMLElement()
    const mockToggleContents = new MockHTMLElement()
    const mockBackdrop = new MockHTMLElement()
    mockBackdrop.hidden = true
    const mockOpenSearchMobile = new MockHTMLElement()
    const mockOpenSearchRail = new MockHTMLElement()
    const mockSearchInput = new MockHTMLInputElement()
    const mockDialog = new MockHTMLDialogElement()
    const docListeners = new Map<string, ((event: Record<string, unknown>) => void)[]>()

    const mockDoc = {
      documentElement: new MockHTMLElement(),
      activeElement: mockSearchInput,
      querySelectorAll: (selector: string) => {
        if (selector === '[data-open-search]') {
          return [mockOpenSearchMobile, mockOpenSearchRail]
        }
        return []
      },
      querySelector: (selector: string) => {
        if (selector === '[data-toggle-contents]') {
          return mockToggleContents
        }
        if (selector === '[data-close-contents]' || selector === '.rail-backdrop') {
          return mockBackdrop
        }
        return null
      },
      getElementById: (id: string) => {
        if (id === 'doc-rail') {
          return mockDocRail
        }
        if (id === 'search-input') {
          return mockSearchInput
        }
        if (id === 'search-modal') {
          return mockDialog
        }
        return null
      },
      addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => {
        const list = docListeners.get(type) ?? []
        list.push(handler)
        docListeners.set(type, list)
      },
    }
    const mockWin = {
      location: { hash: '', href: '/' },
      addEventListener: noop,
      setTimeout,
      clearTimeout,
    }

    const runner = new Function(
      'window',
      'document',
      'Element',
      'HTMLElement',
      'HTMLInputElement',
      'HTMLTextAreaElement',
      'HTMLSelectElement',
      'HTMLDialogElement',
      js,
    )
    runner(
      mockWin,
      mockDoc,
      MockElement,
      MockHTMLElement,
      MockHTMLInputElement,
      MockHTMLTextAreaElement,
      MockHTMLSelectElement,
      MockHTMLDialogElement,
    )

    const keydownHandlers = mockSearchInput.listeners.get('keydown') ?? []
    expect(keydownHandlers.length).toBe(1)
    const onSearchKeydown = keydownHandlers[0]!

    let preventedDuringComposing = false
    onSearchKeydown({
      key: 'ArrowDown',
      isComposing: true,
      keyCode: 40,
      preventDefault() {
        preventedDuringComposing = true
      },
    })
    expect(preventedDuringComposing).toBe(false)

    let preventedDuring229 = false
    onSearchKeydown({
      key: 'ArrowDown',
      isComposing: false,
      keyCode: 229,
      preventDefault() {
        preventedDuring229 = true
      },
    })
    expect(preventedDuring229).toBe(false)

    let preventedNormal = false
    onSearchKeydown({
      key: 'ArrowDown',
      isComposing: false,
      keyCode: 40,
      preventDefault() {
        preventedNormal = true
      },
    })
    expect(preventedNormal).toBe(true)

    const toggleClickHandlers = mockToggleContents.listeners.get('click') ?? []
    expect(toggleClickHandlers.length).toBe(1)
    toggleClickHandlers[0]!({})
    expect(mockDocRail.classList.contains('is-open')).toBe(true)
    expect(mockToggleContents.getAttribute('aria-expanded')).toBe('true')
    expect(mockBackdrop.hidden).toBe(false)

    const docKeydownHandlers = docListeners.get('keydown') ?? []
    expect(docKeydownHandlers.length).toBe(1)
    docKeydownHandlers[0]!({
      key: 'Escape',
      isComposing: false,
      keyCode: 27,
      preventDefault: noop,
    })
    expect(mockDocRail.classList.contains('is-open')).toBe(false)
    expect(mockToggleContents.getAttribute('aria-expanded')).toBe('false')
    expect(mockBackdrop.hidden).toBe(true)

    for (const openSearchBtn of [mockOpenSearchMobile, mockOpenSearchRail]) {
      toggleClickHandlers[0]!({})
      expect(mockDocRail.classList.contains('is-open')).toBe(true)
      const searchClickHandlers = openSearchBtn.listeners.get('click') ?? []
      expect(searchClickHandlers.length).toBe(1)
      searchClickHandlers[0]!({})
      expect(mockDialog.open).toBe(true)
      expect(mockDocRail.classList.contains('is-open')).toBe(false)
      expect(mockBackdrop.hidden).toBe(true)
      mockDialog.close()
    }
  })

  test('builds all 8 real locales (112 pages), 8 search indices, llms.txt, and verified cross-locale links end-to-end', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const outDir = await mkdtemp(join(tmpdir(), 'dn-site-e2e-'))
    try {
      const res = await buildDocsSite({
        contentDir: join(repoRoot, 'docs/content'),
        assetsDir: join(repoRoot, 'docs/assets'),
        llmsPath: join(repoRoot, 'docs/llms.txt'),
        outDir,
        version: '0.3.1',
      })

      const expectedLocales = LOCALES.map(loc => loc.code)
      expect(res.localesBuilt).toEqual(expectedLocales)
      expect(res.pagesWritten).toBe(112)

      for (const locale of expectedLocales) {
        const rawIdx = await readFile(join(outDir, `search-index.${locale}.json`), 'utf8')
        const parsed = JSON.parse(rawIdx) as Array<{ title: string; href: string }>
        expect(parsed.length).toBeGreaterThanOrEqual(14)
      }

      const llmsOut = await readFile(join(outDir, 'llms.txt'), 'utf8')
      expect(llmsOut).toContain('https://dn-ioc.lyz.cloud/')
      await access(join(outDir, '_redirects'))

      const collectHtmlFiles = async (dir: string): Promise<string[]> => {
        const entries = await readdir(dir, { withFileTypes: true })
        const files: string[] = []
        for (const entry of entries) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            files.push(...(await collectHtmlFiles(full)))
          } else if (entry.isFile() && entry.name.endsWith('.html')) {
            files.push(full)
          }
        }
        return files
      }

      const htmlFiles = await collectHtmlFiles(outDir)
      expect(htmlFiles).toHaveLength(112)

      const localeLinkRe = /<a\b[^>]*\bdata-locale-link="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*>/gi
      for (const htmlFile of htmlFiles) {
        const html = await readFile(htmlFile, 'utf8')
        expect(html).toContain('class="doc-shell"')
        expect(html).toContain('id="doc-rail"')
        expect(html).toContain('class="doc-article"')
        expect(html).not.toContain('notebook-open')
        expect(html).not.toContain('spread-right')
        expect(html).not.toContain('mobile-deck')

        const matches = Array.from(html.matchAll(localeLinkRe))
        expect(matches).toHaveLength(8)
        for (const m of matches) {
          const href = m[2]!
          const relRoute = href.replace(/^\/+|\/+$/g, '')
          const targetHtml = relRoute ? join(outDir, relRoute, 'index.html') : join(outDir, 'index.html')
          await access(targetHtml)
        }
      }
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 20_000)
})
