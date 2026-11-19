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

  test('resolveActiveLocales and runDocsBuild detect present locale folders and require en-US or all 9 in strict mode', async () => {
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
    expect(css).toMatch(/--ink-primary:\s*#0f0f0e/i)
    expect(css).toMatch(/--ink-body:\s*#1f1f1d/i)
    expect(css).toMatch(/--ink-muted:\s*#52524e/i)
    expect(css).toMatch(/--accent:\s*#b5381c/i)
    expect(css).toMatch(/--grain-opacity:\s*0\.042/)

    expect(css).toMatch(/--sheet:\s*#161617/i)
    expect(css).toMatch(/--vellum:\s*#111112/i)
    expect(css).toMatch(/--vellum-tab:\s*#1c1c1e/i)
    expect(css).toMatch(/--ink-primary:\s*#f7f7f5/i)
    expect(css).toMatch(/--ink-body:\s*#ddddda/i)
    expect(css).toMatch(/--ink-muted:\s*#a5a5a0/i)
    expect(css).toMatch(/--accent:\s*#f27a5d/i)
    expect(css).toMatch(/--grain-opacity:\s*0\.028/)

    const relativeLuminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map(offset => {
        const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const contrastRatio = (fg: string, bg: string): number => {
      const l1 = Math.max(relativeLuminance(fg), relativeLuminance(bg))
      const l2 = Math.min(relativeLuminance(fg), relativeLuminance(bg))
      return (l1 + 0.05) / (l2 + 0.05)
    }

    // Enforce high WCAG legibility across light & dark paper surfaces
    expect(contrastRatio('#1f1f1d', '#f8f8f7')).toBeGreaterThanOrEqual(12)
    expect(contrastRatio('#52524e', '#e8e8e5')).toBeGreaterThanOrEqual(6)
    expect(contrastRatio('#b5381c', '#f0f0ee')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#ddddda', '#161617')).toBeGreaterThanOrEqual(12)
    expect(contrastRatio('#a5a5a0', '#1c1c1e')).toBeGreaterThanOrEqual(6)
    expect(contrastRatio('#f27a5d', '#1c1c1e')).toBeGreaterThanOrEqual(4.5)

    expect(css).not.toContain('--desk:')
    expect(css).not.toContain('--spine-gradient')
    expect(css).not.toContain('.notebook-open')
    expect(css).not.toContain('.spread-right')
    expect(css).not.toContain('.mobile-deck')
    expect(css).not.toContain('.p-tabs')
    expect(css).not.toContain('.p-tab ')
    expect(css).toContain('.p-head')
    expect(css).toContain('.p-filename')
    expect(css).toContain('.p-tree-layout')
    expect(css).toContain('.paper-code .p-tree-list')
    expect(css).toContain('.theme-group')
    expect(css).toContain('@media (max-width: 920px)')

    expect(js).toContain('dn-ioc-theme')
    expect(js).toContain('data-theme-set')
    expect(js).toContain('.p-tree-file')
    expect(js).toContain('.p-filename')
    expect(js).not.toContain('.p-tab')
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
      tagName = ''
      parentElement: MockElement | null = null
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
        let cur = target
        while (cur instanceof MockElement) {
          if (cur === this) {
            return true
          }
          cur = cur.parentElement
        }
        return false
      }
      closest(selector: string) {
        let cur: MockElement | null = this
        while (cur) {
          if (selector.startsWith('.')) {
            if (cur.classes.has(selector.slice(1))) {
              return cur
            }
          } else if (cur.tagName.toLowerCase() === selector.toLowerCase()) {
            return cur
          }
          cur = cur.parentElement
        }
        return null
      }
    }
    class MockHTMLElement extends MockElement {
      isContentEditable = false
      focusCalls = 0
      focus() {
        this.focusCalls += 1
        mockDoc.activeElement = this
      }
    }
    class MockHTMLInputElement extends MockHTMLElement {
      value = ''
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
    const mockRailLink = new MockHTMLElement()
    mockRailLink.tagName = 'a'
    mockRailLink.parentElement = mockDocRail
    const mockRailLinkText = new MockHTMLElement()
    mockRailLinkText.tagName = 'span'
    mockRailLinkText.parentElement = mockRailLink
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
      activeElement: mockSearchInput as MockElement | null,
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

    mockDoc.activeElement = mockRailLinkText
    const toggleFocusBeforeEscape = mockToggleContents.focusCalls
    const docKeydownHandlers = docListeners.get('keydown') ?? []
    expect(docKeydownHandlers.length).toBe(1)
    const onDocKeydown = docKeydownHandlers[0]!
    onDocKeydown({
      key: 'Escape',
      isComposing: false,
      keyCode: 27,
      preventDefault: noop,
    })
    expect(mockDocRail.classList.contains('is-open')).toBe(false)
    expect(mockToggleContents.getAttribute('aria-expanded')).toBe('false')
    expect(mockBackdrop.hidden).toBe(true)
    expect(mockToggleContents.focusCalls).toBe(toggleFocusBeforeEscape + 1)
    expect(mockDoc.activeElement).toBe(mockToggleContents)

    for (const openSearchBtn of [mockOpenSearchMobile, mockOpenSearchRail]) {
      toggleClickHandlers[0]!({})
      expect(mockDocRail.classList.contains('is-open')).toBe(true)
      mockDoc.activeElement = mockRailLink
      const toggleFocusBeforeSearch = mockToggleContents.focusCalls
      const searchInputFocusBefore = mockSearchInput.focusCalls
      const searchClickHandlers = openSearchBtn.listeners.get('click') ?? []
      expect(searchClickHandlers.length).toBe(1)
      searchClickHandlers[0]!({})
      expect(mockDialog.open).toBe(true)
      expect(mockDocRail.classList.contains('is-open')).toBe(false)
      expect(mockBackdrop.hidden).toBe(true)
      expect(mockToggleContents.focusCalls).toBe(toggleFocusBeforeSearch)
      expect(mockSearchInput.focusCalls).toBe(searchInputFocusBefore + 1)
      expect(mockDoc.activeElement).toBe(mockSearchInput)
      mockDialog.close()
    }

    const backdropClickHandlers = mockBackdrop.listeners.get('click') ?? []
    expect(backdropClickHandlers.length).toBe(1)
    toggleClickHandlers[0]!({})
    expect(mockDocRail.classList.contains('is-open')).toBe(true)
    backdropClickHandlers[0]!({})
    expect(mockDocRail.classList.contains('is-open')).toBe(false)
    expect(mockToggleContents.getAttribute('aria-expanded')).toBe('false')
    expect(mockBackdrop.hidden).toBe(true)

    const railClickHandlers = mockDocRail.listeners.get('click') ?? []
    expect(railClickHandlers.length).toBe(1)
    toggleClickHandlers[0]!({})
    expect(mockDocRail.classList.contains('is-open')).toBe(true)
    railClickHandlers[0]!({ target: mockRailLinkText })
    expect(mockDocRail.classList.contains('is-open')).toBe(false)
    expect(mockToggleContents.getAttribute('aria-expanded')).toBe('false')
    expect(mockBackdrop.hidden).toBe(true)

    mockDoc.activeElement = mockDoc.documentElement
    const blockedDocEvents = [
      { key: '/', isComposing: true, keyCode: 191, metaKey: false, ctrlKey: false, altKey: false },
      { key: '/', isComposing: false, keyCode: 229, metaKey: false, ctrlKey: false, altKey: false },
      { key: 'k', isComposing: true, keyCode: 75, metaKey: true, ctrlKey: false, altKey: false },
      { key: 'k', isComposing: false, keyCode: 229, metaKey: true, ctrlKey: false, altKey: false },
    ]
    for (const evt of blockedDocEvents) {
      let prevented = false
      onDocKeydown({
        ...evt,
        preventDefault() {
          prevented = true
        },
      })
      expect(prevented).toBe(false)
      expect(mockDialog.open).toBe(false)
    }

    let slashPrevented = false
    onDocKeydown({
      key: '/',
      isComposing: false,
      keyCode: 191,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault() {
        slashPrevented = true
      },
    })
    expect(slashPrevented).toBe(true)
    expect(mockDialog.open).toBe(true)
    mockDialog.close()
  })

  test('builds all 9 real locales (126 pages), 9 search indices, llms.txt, and verified cross-locale links end-to-end', async () => {
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
      expect(expectedLocales).toHaveLength(9)
      expect(res.localesBuilt).toEqual(expectedLocales)
      expect(res.pagesWritten).toBe(126)

      for (const locale of expectedLocales) {
        const rawIdx = await readFile(join(outDir, `search-index.${locale}.json`), 'utf8')
        const parsed = JSON.parse(rawIdx) as Array<{ title: string; href: string }>
        expect(parsed.length).toBeGreaterThanOrEqual(14)
        if (locale === 'ar') {
          expect(parsed.some(entry => /[\u0600-\u06FF]/.test(entry.title))).toBe(true)
        }
      }

      const arIndexHtml = await readFile(join(outDir, 'ar/index.html'), 'utf8')
      expect(arIndexHtml).toContain('<html lang="ar" dir="rtl" data-locale="ar"')
      expect(arIndexHtml).toContain('<div class="paper-code" dir="ltr">')
      expect(arIndexHtml).toContain('IBM+Plex+Sans+Arabic')
      expect(arIndexHtml).toContain(
        '<a class="rail-tool" dir="ltr" href="https://github.com/MunMunMiao/dn-ioc" target="_blank" rel="noopener noreferrer">GitHub ↗</a>',
      )

      const llmsOut = await readFile(join(outDir, 'llms.txt'), 'utf8')
      expect(llmsOut).toContain('https://dn-ioc.lyz.cloud/')
      expect(llmsOut).not.toMatch(/dn-ioc@\d|Version \d+\.\d+/i)
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
      expect(htmlFiles).toHaveLength(126)

      const localeLinkRe = /<a\b[^>]*\bdata-locale-link="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*>/gi
      for (const htmlFile of htmlFiles) {
        const html = await readFile(htmlFile, 'utf8')
        expect(html).toContain('class="doc-shell"')
        expect(html).toContain('id="doc-rail"')
        expect(html).toContain('class="doc-article"')
        expect(html).toContain('class="theme-group"')
        expect(html).toContain('data-theme-set="auto"')
        expect(html).toContain('data-theme-set="light"')
        expect(html).toContain('data-theme-set="dark"')
        expect(html).not.toContain('class="p-tabs"')
        expect(html).not.toContain('class="p-tab')
        expect(html).not.toContain('notebook-open')
        expect(html).not.toContain('spread-right')
        expect(html).not.toContain('mobile-deck')
        expect(html).not.toMatch(/dn-ioc@\d|@0\.\d+\.\d+|v0\.\d+\.\d+/)

        const normalizedPath = htmlFile.replaceAll('\\', '/')
        const expectsTree = /\/(?:architecture|mvc|ddd)\/index\.html$/.test(normalizedPath)
        if (expectsTree) {
          expect(html, `${normalizedPath} should render file tree`).toContain('class="paper-code paper-code-tree"')
        } else {
          expect(html, `${normalizedPath} should not render file tree`).not.toContain('paper-code-tree')
        }

        const matches = Array.from(html.matchAll(localeLinkRe))
        expect(matches).toHaveLength(9)
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

  test('includes Arabic typography, RTL logical properties, BiDi code isolation, and mirrored mobile drawer CSS', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const css = await readFile(join(repoRoot, 'docs/assets/notebook.css'), 'utf8')

    const extractBlocks = (selector: string): string[] => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g')
      return Array.from(css.matchAll(re), m => m[1] ?? '')
    }

    const arHtmlCss = extractBlocks('html[lang="ar"]').join('\n')
    expect(arHtmlCss).toContain('IBM Plex Sans Arabic')
    expect(arHtmlCss).toMatch(/--font-mono:[^;]*IBM Plex Sans Arabic/)
    expect(arHtmlCss).toMatch(/--prose-lh:\s*1\.92/)

    const rtlLetterSpacingMatch = css.match(
      /html\[dir="rtl"\]\s+\.rail-brand strong,\s*html\[dir="rtl"\]\s+\.rail-group-title,\s*html\[dir="rtl"\]\s+\.chapter-eyebrow,\s*html\[dir="rtl"\]\s+\.chapter-title,\s*html\[dir="rtl"\]\s+\.doc-section h2,\s*html\[dir="rtl"\]\s+\.mobile-brand\s*\{([^}]*)\}/,
    )
    expect(rtlLetterSpacingMatch?.[1]).toMatch(/letter-spacing:\s*0/)

    const rtlSearchHitCss = extractBlocks('html[dir="rtl"] .search-hit').join('\n')
    expect(rtlSearchHitCss).toMatch(/padding:\s*0/)
    expect(rtlSearchHitCss).toMatch(/font-weight:\s*inherit/)

    const rtlCalloutCss = extractBlocks('html[dir="rtl"] .callout').join('\n')
    expect(rtlCalloutCss).toMatch(/border-radius:\s*4px 0 0 4px/)

    const rtlDrawerCss = extractBlocks('html[dir="rtl"] .doc-rail').join('\n')
    expect(rtlDrawerCss).toMatch(/inset:\s*0 0 0 auto/)
    expect(rtlDrawerCss).toMatch(/transform:\s*translateX\(100%\)/)
    expect(extractBlocks('html[dir="rtl"] .doc-rail.is-open').join('\n')).toMatch(/transform:\s*translateX\(0\)/)

    const paperCodeCss = extractBlocks('.paper-code').join('\n')
    expect(paperCodeCss).toMatch(/direction:\s*ltr/)
    expect(paperCodeCss).toMatch(/text-align:\s*left/)

    const inlineCodeCss =
      extractBlocks('.doc-section code,\n.callout code').join('\n') || extractBlocks('.doc-section code, .callout code').join('\n')
    expect(inlineCodeCss).toMatch(/direction:\s*ltr/)
    expect(inlineCodeCss).toMatch(/unicode-bidi:\s*isolate/)

    const railLinkCss = extractBlocks('.rail-link').join('\n')
    expect(railLinkCss).toContain('border-inline-start')
    expect(railLinkCss).toContain('padding-inline-start')

    const langListCss = extractBlocks('.lang-list').join('\n')
    expect(langListCss).toMatch(/inset-inline-start:\s*0/)
  })

  test('normalizes Arabic harakat, Alef, Alef Maqsura, and Ta Marbuta in search and preserves trailing combining marks inside <mark>', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const js = await readFile(join(repoRoot, 'docs/assets/notebook.js'), 'utf8')
    const noop = () => undefined

    class MockElement {
      tagName = ''
      parentElement: MockElement | null = null
      attrs = new Map<string, string>()
      classes = new Set<string>()
      hidden = false
      innerHTML = ''
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
        let cur = target
        while (cur instanceof MockElement) {
          if (cur === this) {
            return true
          }
          cur = cur.parentElement
        }
        return false
      }
      closest() {
        return null
      }
    }
    class MockHTMLElement extends MockElement {
      isContentEditable = false
      focus = noop
    }
    class MockHTMLInputElement extends MockHTMLElement {
      value = ''
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

    const mockSearchInput = new MockHTMLInputElement()
    const mockSearchResults = new MockHTMLElement()
    const mockDialog = new MockHTMLDialogElement()
    mockDialog.setAttribute('data-search-url', '/search-index.ar.json')
    mockDialog.setAttribute('data-no-results', 'ما لقينا نتيجة مطابقة، جرّب كلمة ثانية.')

    const mockDoc = {
      documentElement: new MockHTMLElement(),
      activeElement: mockSearchInput,
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: (id: string) => {
        if (id === 'search-input') {
          return mockSearchInput
        }
        if (id === 'search-results') {
          return mockSearchResults
        }
        if (id === 'search-modal') {
          return mockDialog
        }
        return null
      },
      addEventListener: noop,
    }
    const mockWin = {
      location: { hash: '', href: '/' },
      addEventListener: noop,
      setTimeout,
      clearTimeout,
    }
    const mockFetch = async () => ({
      ok: true,
      json: async () => [
        {
          title: 'إنشاء وإدارة التبعيات',
          chapterTitle: 'البداية',
          href: '/ar/quickstart/',
          excerpt: 'إِنْشَاءٌ بسيط بدون تعقيد',
        },
        {
          title: 'مُوسَى والتـطـبيق العملي',
          chapterTitle: 'أمثلة',
          href: '/ar/examples/',
          excerpt: 'شرح عملي لحقن التبعيات',
        },
      ],
    })

    const runner = new Function(
      'window',
      'document',
      'fetch',
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
      mockFetch,
      MockElement,
      MockHTMLElement,
      MockHTMLInputElement,
      MockHTMLTextAreaElement,
      MockHTMLSelectElement,
      MockHTMLDialogElement,
    )

    const inputHandlers = mockSearchInput.listeners.get('input') ?? []
    expect(inputHandlers).toHaveLength(1)
    const triggerSearch = async (value: string) => {
      mockSearchInput.value = value
      inputHandlers[0]!({})
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    await triggerSearch('انشاء اداره')
    expect(mockSearchResults.innerHTML).toContain('href="/ar/quickstart/"')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">إنشاء</mark>')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">إدارة</mark>')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">إِنْشَاءٌ</mark>')
    expect(mockSearchResults.innerHTML).not.toContain('<mark class="search-hit">إِنْشَاء</mark>ٌ')

    await triggerSearch('انشاء')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">إِنْشَاءٌ</mark>')

    await triggerSearch('موسي تطبيق')
    expect(mockSearchResults.innerHTML).toContain('href="/ar/examples/"')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">مُوسَى</mark>')
    expect(mockSearchResults.innerHTML).toContain('<mark class="search-hit">تـطـبيق</mark>')

    await triggerSearch('كلمةغيرموجودة')
    expect(mockSearchResults.innerHTML).toContain('<p class="search-empty">ما لقينا نتيجة مطابقة، جرّب كلمة ثانية.</p>')
  })

  test('switches active code panel + filename via file tree and persists auto/light/dark theme preference with live OS tracking', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const js = await readFile(join(repoRoot, 'docs/assets/notebook.js'), 'utf8')
    const noop = () => undefined

    class MockElement {
      tagName = ''
      parentElement: MockElement | null = null
      attrs = new Map<string, string>()
      classes = new Set<string>()
      textContent = ''
      listeners = new Map<string, ((event: Record<string, unknown>) => void)[]>()
      children: MockElement[] = []
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
      append(child: MockElement) {
        child.parentElement = this
        this.children.push(child)
        return child
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
        let cur = target
        while (cur instanceof MockElement) {
          if (cur === this) {
            return true
          }
          cur = cur.parentElement
        }
        return false
      }
      closest(selector: string) {
        let cur: MockElement | null = this
        while (cur) {
          if (selector.startsWith('.')) {
            if (cur.classes.has(selector.slice(1))) {
              return cur
            }
          } else if (cur.tagName.toLowerCase() === selector.toLowerCase()) {
            return cur
          }
          cur = cur.parentElement
        }
        return null
      }
      querySelectorAll(selector: string): MockElement[] {
        const out: MockElement[] = []
        const visit = (el: MockElement) => {
          for (const child of el.children) {
            if (selector.startsWith('.') && child.classes.has(selector.slice(1))) {
              out.push(child)
            }
            visit(child)
          }
        }
        visit(this)
        return out
      }
      querySelector(selector: string): MockElement | null {
        return this.querySelectorAll(selector)[0] ?? null
      }
    }
    class MockHTMLElement extends MockElement {
      isContentEditable = false
      focus = noop
    }
    class MockHTMLInputElement extends MockHTMLElement {}
    class MockHTMLTextAreaElement extends MockHTMLElement {}
    class MockHTMLSelectElement extends MockHTMLElement {}
    class MockHTMLDialogElement extends MockHTMLElement {}

    const storageMap = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageMap.set(key, value)
      },
      removeItem: (key: string) => {
        storageMap.delete(key)
      },
    }

    const mountPage = (initialOsDark: boolean) => {
      const rootEl = new MockHTMLElement()
      rootEl.setAttribute('data-theme-pref', 'auto')
      rootEl.setAttribute('data-mode', 'light')

      const btnAuto = new MockHTMLElement()
      btnAuto.setAttribute('data-theme-set', 'auto')
      const btnLight = new MockHTMLElement()
      btnLight.setAttribute('data-theme-set', 'light')
      const btnDark = new MockHTMLElement()
      btnDark.setAttribute('data-theme-set', 'dark')

      const paperCode = new MockHTMLElement()
      paperCode.classList.add('paper-code', 'paper-code-tree')
      const filenameEl = paperCode.append(new MockHTMLElement())
      filenameEl.classList.add('p-filename')
      filenameEl.textContent = 'domain/order.ts'

      const file0 = paperCode.append(new MockHTMLElement())
      file0.classList.add('p-tree-file', 'is-active')
      file0.setAttribute('data-file', '0')
      file0.setAttribute('data-path', 'domain/order.ts')
      file0.setAttribute('aria-selected', 'true')

      const file1 = paperCode.append(new MockHTMLElement())
      file1.classList.add('p-tree-file')
      file1.setAttribute('data-file', '1')
      file1.setAttribute('data-path', 'domain/ports.ts')
      file1.setAttribute('aria-selected', 'false')

      const panel0 = paperCode.append(new MockHTMLElement())
      panel0.classList.add('p-pre', 'is-active')
      panel0.setAttribute('data-panel', '0')

      const panel1 = paperCode.append(new MockHTMLElement())
      panel1.classList.add('p-pre')
      panel1.setAttribute('data-panel', '1')

      const docListeners = new Map<string, ((event: Record<string, unknown>) => void)[]>()
      const mediaListeners: (() => void)[] = []
      const mql = {
        matches: initialOsDark,
        addEventListener: (type: string, cb: () => void) => {
          if (type === 'change') {
            mediaListeners.push(cb)
          }
        },
      }

      const mockDoc = {
        documentElement: rootEl,
        activeElement: rootEl,
        querySelectorAll: (selector: string) => {
          if (selector === '[data-theme-set]') {
            return [btnAuto, btnLight, btnDark]
          }
          return []
        },
        querySelector: () => null,
        getElementById: () => null,
        addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => {
          const list = docListeners.get(type) ?? []
          list.push(handler)
          docListeners.set(type, list)
        },
      }
      const mockWin = {
        location: { hash: '', href: '/' },
        matchMedia: () => mql,
        addEventListener: noop,
        setTimeout,
        clearTimeout,
      }

      const runner = new Function(
        'window',
        'document',
        'localStorage',
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
        mockStorage,
        MockElement,
        MockHTMLElement,
        MockHTMLInputElement,
        MockHTMLTextAreaElement,
        MockHTMLSelectElement,
        MockHTMLDialogElement,
      )

      return {
        rootEl,
        btnAuto,
        btnLight,
        btnDark,
        filenameEl,
        file0,
        file1,
        panel0,
        panel1,
        clickDoc: (target: MockElement) => {
          for (const handler of docListeners.get('click') ?? []) {
            handler({ target })
          }
        },
        setOsDark: (dark: boolean) => {
          mql.matches = dark
          for (const cb of mediaListeners) {
            cb()
          }
        },
      }
    }

    // 1. Default auto tracks OS scheme live + file tree click switches panel & filename
    const page1 = mountPage(false)
    expect(page1.rootEl.getAttribute('data-theme-pref')).toBe('auto')
    expect(page1.rootEl.getAttribute('data-mode')).toBe('light')
    expect(page1.btnAuto.getAttribute('aria-pressed')).toBe('true')
    expect(page1.btnDark.getAttribute('aria-pressed')).toBe('false')

    page1.setOsDark(true)
    expect(page1.rootEl.getAttribute('data-mode')).toBe('dark')

    page1.setOsDark(false)
    expect(page1.rootEl.getAttribute('data-mode')).toBe('light')

    // Click second file in tree -> activates panel 1 and updates .p-filename
    page1.clickDoc(page1.file1)
    expect(page1.file0.classList.contains('is-active')).toBe(false)
    expect(page1.file0.getAttribute('aria-selected')).toBe('false')
    expect(page1.file1.classList.contains('is-active')).toBe(true)
    expect(page1.file1.getAttribute('aria-selected')).toBe('true')
    expect(page1.panel0.classList.contains('is-active')).toBe(false)
    expect(page1.panel1.classList.contains('is-active')).toBe(true)
    expect(page1.filenameEl.textContent).toBe('domain/ports.ts')

    // 2. Manual selection persists to localStorage and ignores OS theme changes
    page1.btnDark.listeners.get('click')?.[0]?.({})
    expect(storageMap.get('dn-ioc-theme')).toBe('dark')
    expect(page1.rootEl.getAttribute('data-theme-pref')).toBe('dark')
    expect(page1.rootEl.getAttribute('data-mode')).toBe('dark')
    expect(page1.btnDark.getAttribute('aria-pressed')).toBe('true')
    expect(page1.btnAuto.getAttribute('aria-pressed')).toBe('false')

    page1.setOsDark(false)
    expect(page1.rootEl.getAttribute('data-mode')).toBe('dark')

    // 3. Reloading restores stored manual 'dark' even when OS is light
    const page2 = mountPage(false)
    expect(page2.rootEl.getAttribute('data-theme-pref')).toBe('dark')
    expect(page2.rootEl.getAttribute('data-mode')).toBe('dark')
    expect(page2.btnDark.getAttribute('aria-pressed')).toBe('true')

    // 4. Switching to 'light' persists and ignores OS dark change
    page2.btnLight.listeners.get('click')?.[0]?.({})
    expect(storageMap.get('dn-ioc-theme')).toBe('light')
    expect(page2.rootEl.getAttribute('data-mode')).toBe('light')
    page2.setOsDark(true)
    expect(page2.rootEl.getAttribute('data-mode')).toBe('light')

    // 5. Switching back to 'auto' persists 'auto' and resumes live OS tracking
    page2.btnAuto.listeners.get('click')?.[0]?.({})
    expect(storageMap.get('dn-ioc-theme')).toBe('auto')
    expect(page2.rootEl.getAttribute('data-theme-pref')).toBe('auto')
    expect(page2.rootEl.getAttribute('data-mode')).toBe('dark')
    page2.setOsDark(false)
    expect(page2.rootEl.getAttribute('data-mode')).toBe('light')
  })

  test('ignores superpowers artifacts in .gitignore and tracks zero superpowers files in git', async () => {
    const repoRoot = join(import.meta.dir, '../..')
    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.superpowers')
    expect(gitignore).toContain('superpowers/')
    expect(gitignore).toContain('docs/superpowers/')

    let hasGitDir = false
    try {
      await access(join(repoRoot, '.git'))
      hasGitDir = true
    } catch {
      hasGitDir = false
    }

    if (hasGitDir) {
      const tracked = Bun.spawnSync(['git', 'ls-files', '*superpowers*'], { cwd: repoRoot })
      expect(tracked.exitCode).toBe(0)
      expect(tracked.stdout.toString().trim()).toBe('')

      for (const candidate of ['.superpowers/scratch.md', 'superpowers/plan.md', 'docs/superpowers/specs/design.md']) {
        const check = Bun.spawnSync(['git', 'check-ignore', '-q', candidate], { cwd: repoRoot })
        expect(check.exitCode, `${candidate} must be ignored by .gitignore`).toBe(0)
      }
    }
  })
})
