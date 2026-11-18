import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from '../docs/locales'
import { buildDocsSite } from './docs/build-site'

const REPO_ROOT = join(import.meta.dir, '..')

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

export async function resolveActiveLocales(contentDir: string, strictAllLocales = true): Promise<LocaleCode[]> {
  if (strictAllLocales) {
    return LOCALES.map(loc => loc.code)
  }

  const detected: LocaleCode[] = []
  for (const loc of LOCALES) {
    if (await isDirectory(join(contentDir, loc.code))) {
      detected.push(loc.code)
    }
  }

  if (!detected.includes(DEFAULT_LOCALE)) {
    throw new Error(`Missing required default locale directory: ${join(contentDir, DEFAULT_LOCALE)}`)
  }

  return detected
}

export async function runDocsBuild(
  rootDir = REPO_ROOT,
  strictAllLocales = true,
): Promise<{ pagesWritten: number; localesBuilt: LocaleCode[] }> {
  const pkgRaw = await readFile(join(rootDir, 'package.json'), 'utf8')
  const pkg = JSON.parse(pkgRaw) as { version?: string }
  const version = pkg.version ?? '0.0.0'

  const contentDir = join(rootDir, 'docs/content')
  const assetsDir = join(rootDir, 'docs/assets')
  const llmsPath = join(rootDir, 'docs/llms.txt')
  const outDir = join(rootDir, 'docs/dist')
  const locales = await resolveActiveLocales(contentDir, strictAllLocales)

  return buildDocsSite({
    contentDir,
    assetsDir,
    llmsPath,
    outDir,
    version,
    locales,
  })
}

if (import.meta.main) {
  const started = performance.now()
  const result = await runDocsBuild()
  const elapsedMs = (performance.now() - started).toFixed(0)
  console.log(
    `[docs:build] Built ${result.pagesWritten} page(s) across ${result.localesBuilt.length} locale(s) (${result.localesBuilt.join(', ')}) in ${elapsedMs}ms`,
  )
}
