import type { Dirent } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { chapterHref, getLocale, LOCALES, type LocaleCode } from '../../docs/locales'
import { type CompiledChapter, compileMdxFile, renderChapterPage } from './compile-mdx'

export interface BuildSiteOptions {
  contentDir: string
  assetsDir: string
  llmsPath: string
  outDir: string
  version: string
  locales?: readonly LocaleCode[]
}

const FULL_CHAPTER_COUNT = 14

const REDIRECTS_CONTENT = [
  '/en-US / 301',
  '/en-US/* /:splat 301',
  '/en-us / 301',
  '/en-us/* /:splat 301',
  '/zh-Hans /zh-hans/ 301',
  '/zh-Hans/* /zh-hans/:splat 301',
  '/zh-Hant-HK /zh-hant-hk/ 301',
  '/zh-Hant-HK/* /zh-hant-hk/:splat 301',
  '/zh-Hant-TW /zh-hant-tw/ 301',
  '/zh-Hant-TW/* /zh-hant-tw/:splat 301',
  '',
].join('\n')

function normalizeSlug(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, '')
}

function unescapeHrefEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function listRelativeFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const rel = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      out.push(...(await listRelativeFiles(join(dir, entry.name), rel)))
    } else if (entry.isFile()) {
      out.push(rel)
    }
  }
  return out
}

const tsAssetTranspiler = new Bun.Transpiler({ loader: 'ts' })

export function transpileBrowserAsset(tsSource: string): string {
  return tsAssetTranspiler.transformSync(tsSource)
}

async function emitAssets(assetsDir: string, assetsOutDir: string): Promise<string[]> {
  const sourceFiles = await listRelativeFiles(assetsDir)
  const emittedFiles: string[] = []
  for (const relPath of sourceFiles) {
    const srcPath = join(assetsDir, ...relPath.split('/'))
    if (relPath.endsWith('.ts')) {
      const outRel = `${relPath.slice(0, -3)}.js`
      const outPath = join(assetsOutDir, ...outRel.split('/'))
      const tsSource = await readFile(srcPath, 'utf8')
      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, transpileBrowserAsset(tsSource), 'utf8')
      emittedFiles.push(outRel)
    } else {
      const outPath = join(assetsOutDir, ...relPath.split('/'))
      await mkdir(dirname(outPath), { recursive: true })
      await copyFile(srcPath, outPath)
      emittedFiles.push(relPath)
    }
  }
  return emittedFiles
}

function validateChapterInternalLinks(
  chapter: CompiledChapter,
  renderedHtml: string,
  validPaths: ReadonlySet<string>,
  builtLocales: ReadonlySet<string>,
): void {
  const anchorTagRe = /<a\b([^>]*)>/gi
  for (const tagMatch of renderedHtml.matchAll(anchorTagRe)) {
    const attrs = tagMatch[1] ?? ''
    const localeLinkMatch = attrs.match(/\bdata-locale-link="([^"]*)"/i)
    if (localeLinkMatch && !builtLocales.has(localeLinkMatch[1]!)) {
      continue
    }

    const hrefMatch = attrs.match(/\bhref="([^"]*)"/i)
    if (!hrefMatch) {
      continue
    }
    const rawHref = unescapeHrefEntities(hrefMatch[1]!).trim()
    if (!rawHref.startsWith('/') || rawHref.startsWith('//')) {
      continue
    }

    const pathOnly = rawHref.split('#')[0]!.split('?')[0]! || '/'
    const isValid = validPaths.has(pathOnly) || validPaths.has(`${pathOnly}/`)
    if (!isValid) {
      throw new Error(
        `Broken internal link "${rawHref}" in locale "${chapter.locale}" chapter "${chapter.meta.slug || '/'}": target route not found`,
      )
    }
  }
}

export async function buildDocsSite(options: BuildSiteOptions): Promise<{ pagesWritten: number; localesBuilt: LocaleCode[] }> {
  const localesBuilt: LocaleCode[] = options.locales ? [...options.locales] : LOCALES.map(loc => loc.code)
  if (localesBuilt.length === 0) {
    throw new Error('buildDocsSite requires at least one locale to build')
  }
  for (const code of localesBuilt) {
    getLocale(code)
  }

  await rm(options.outDir, { recursive: true, force: true })
  await mkdir(options.outDir, { recursive: true })

  const compiledByLocale = new Map<LocaleCode, CompiledChapter[]>()

  for (const locale of localesBuilt) {
    const localeDir = join(options.contentDir, locale)
    let entries: Dirent[]
    try {
      entries = await readdir(localeDir, { withFileTypes: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Missing locale content directory for "${locale}" at ${localeDir}: ${msg}`)
    }

    const mdxFiles = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.mdx'))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b))

    if (mdxFiles.length === 0) {
      throw new Error(`No .mdx chapters found for locale "${locale}" in ${localeDir}`)
    }

    const chapters: CompiledChapter[] = []
    const seenOrders = new Map<number, string>()
    const seenSlugs = new Map<string, string>()

    for (const fileName of mdxFiles) {
      const filePath = join(localeDir, fileName)
      const compiled = await compileMdxFile(filePath, locale)
      const cleanSlug = normalizeSlug(compiled.meta.slug)

      const dupOrderFile = seenOrders.get(compiled.meta.order)
      if (dupOrderFile) {
        throw new Error(`Duplicate chapter order ${compiled.meta.order} in locale "${locale}" between "${dupOrderFile}" and "${fileName}"`)
      }
      seenOrders.set(compiled.meta.order, fileName)

      const dupSlugFile = seenSlugs.get(cleanSlug)
      if (dupSlugFile) {
        throw new Error(`Duplicate chapter slug "${cleanSlug}" in locale "${locale}" between "${dupSlugFile}" and "${fileName}"`)
      }
      seenSlugs.set(cleanSlug, fileName)

      chapters.push(compiled)
    }

    chapters.sort((a, b) => a.meta.order - b.meta.order)
    compiledByLocale.set(locale, chapters)
  }

  const refLocale = localesBuilt[0]!
  const refChapters = compiledByLocale.get(refLocale)!

  for (let l = 1; l < localesBuilt.length; l++) {
    const locale = localesBuilt[l]!
    const chapters = compiledByLocale.get(locale)!

    if (chapters.length !== refChapters.length) {
      throw new Error(
        `Locale slug/order parity mismatch: "${refLocale}" has ${refChapters.length} chapters while "${locale}" has ${chapters.length} chapters`,
      )
    }

    for (let i = 0; i < refChapters.length; i++) {
      const expected = refChapters[i]!
      const actual = chapters[i]!
      const expectedSlug = normalizeSlug(expected.meta.slug)
      const actualSlug = normalizeSlug(actual.meta.slug)

      if (expected.meta.order !== actual.meta.order || expectedSlug !== actualSlug) {
        throw new Error(
          `Locale slug/order parity mismatch at position ${i + 1}: "${refLocale}" has (order=${expected.meta.order}, slug="${expectedSlug}") while "${locale}" has (order=${actual.meta.order}, slug="${actualSlug}")`,
        )
      }
    }
  }

  const assetsOutDir = join(options.outDir, 'assets')
  const assetFiles = await emitAssets(options.assetsDir, assetsOutDir)

  await copyFile(options.llmsPath, join(options.outDir, 'llms.txt'))
  await writeFile(join(options.outDir, '_redirects'), REDIRECTS_CONTENT, 'utf8')

  const validInternalPaths = new Set<string>(['/llms.txt', '/_redirects'])
  for (const relAsset of assetFiles) {
    validInternalPaths.add(`/assets/${relAsset}`)
  }

  for (const [locale, chapters] of compiledByLocale) {
    validInternalPaths.add(`/search-index.${locale}.json`)
    for (const chapter of chapters) {
      validInternalPaths.add(chapterHref(locale, chapter.meta.slug))
    }
  }

  const builtLocalesSet = new Set<string>(localesBuilt)
  let pagesWritten = 0

  for (const locale of localesBuilt) {
    const chapters = compiledByLocale.get(locale)!
    const enforceLinks = chapters.length >= FULL_CHAPTER_COUNT

    for (const chapter of chapters) {
      const html = renderChapterPage(chapter, chapters, options.version)
      if (enforceLinks) {
        validateChapterInternalLinks(chapter, html, validInternalPaths, builtLocalesSet)
      }

      const routeHref = chapterHref(locale, chapter.meta.slug)
      const relRoute = routeHref.replace(/^\/+|\/+$/g, '')
      const outPath = relRoute ? join(options.outDir, relRoute, 'index.html') : join(options.outDir, 'index.html')

      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, html, 'utf8')
      pagesWritten += 1
    }

    const searchIndex = chapters.flatMap(chapter => chapter.searchEntries)
    await writeFile(join(options.outDir, `search-index.${locale}.json`), JSON.stringify(searchIndex), 'utf8')
  }

  return { pagesWritten, localesBuilt }
}
