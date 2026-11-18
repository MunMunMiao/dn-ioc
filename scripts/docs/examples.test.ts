import { describe, expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { renderCodeLines } from './highlight'

const EXAMPLES_DIR = join(import.meta.dir, '../../docs/examples')
const LLMS_TXT_PATH = join(import.meta.dir, '../../docs/llms.txt')

const EXPECTED_EXAMPLES = [
  'api/signatures.ts',
  'async/shared-and-background.ts',
  'ddd/application/order-service.ts',
  'ddd/domain/order.ts',
  'ddd/domain/ports.ts',
  'ddd/infra/providers.ts',
  'ddd/infra/sql-order-repository.ts',
  'ddd/infra/system-adapters.ts',
  'ddd/main.ts',
  'ddd/order-service-unit-example.ts',
  'lifecycle/browser-unmount.ts',
  'lifecycle/dispose-and-using.ts',
  'lifecycle/node-server-shutdown.ts',
  'mvc/controllers/user-controller.ts',
  'mvc/db/database.ts',
  'mvc/main.ts',
  'mvc/models/user.ts',
  'mvc/repositories/user-repository.ts',
  'mvc/services/user-service.ts',
  'mvc/user-service-fake-example.ts',
  'overview/minimal.ts',
  'providers/caching-and-bundle.ts',
  'quickstart/step1-provide.ts',
  'quickstart/step2-compose.ts',
  'quickstart/step3-async-and-fake.ts',
  'scopes/case1-fallback.ts',
  'scopes/case2-local-override.ts',
  'scopes/case3-parent-owned.ts',
  'scopes/case4-rebind-both.ts',
  'testing/unit-and-integration.ts',
  'tokens/token-binding.ts',
] as const

const EXPECTED_REGIONS: Readonly<Record<string, readonly string[]>> = {
  'api/signatures.ts': ['types', 'functions'],
  'async/shared-and-background.ts': ['shared', 'background', 'asyncToken'],
  'lifecycle/browser-unmount.ts': ['unmount', 'pagehide'],
  'lifecycle/dispose-and-using.ts': ['dispose', 'awaitUsing'],
  'providers/caching-and-bundle.ts': ['caching', 'bundle', 'isProvideRef'],
  'testing/unit-and-integration.ts': ['unit', 'integration'],
  'tokens/token-binding.ts': ['bound', 'unbound'],
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(full)))
    } else {
      results.push(relative(EXAMPLES_DIR, full).replaceAll('\\', '/'))
    }
  }
  return results.sort()
}

function assertCleanRender(html: string, rawClean: string, highlightedLines: readonly number[], context: string): void {
  expect(rawClean.length, `${context}: rawClean should not be empty`).toBeGreaterThan(0)
  expect(html.length, `${context}: html should not be empty`).toBeGreaterThan(0)
  expect(html, `${context}: leaked [!hl] in html`).not.toContain('[!hl]')
  expect(rawClean, `${context}: leaked [!hl] in rawClean`).not.toContain('[!hl]')
  expect(html, `${context}: leaked #region in html`).not.toContain('#region')
  expect(html, `${context}: leaked #endregion in html`).not.toContain('#endregion')
  expect(rawClean, `${context}: leaked #region in rawClean`).not.toContain('#region')
  expect(rawClean, `${context}: leaked #endregion in rawClean`).not.toContain('#endregion')

  // Only <span class="..."> and </span> HTML tags may appear in highlighted output
  const strippedSpans = html.replace(/<\/?span(?:\s+class="[a-z\s]+")?>/g, '')
  expect(strippedSpans, `${context}: unescaped < or > in html`).not.toMatch(/[<>]/)

  const lines = rawClean.split('\n')
  for (const lineNumber of highlightedLines) {
    const lineText = lines[lineNumber - 1] ?? ''
    expect(lineText.trim().length, `${context}: line ${lineNumber} highlighted an empty line`).toBeGreaterThan(0)
  }
}

describe('docs/examples suite', () => {
  test('contains all 31 expected .ts example modules and zero *.test.ts / *.spec.ts files', async () => {
    const files = await listFilesRecursive(EXAMPLES_DIR)
    expect(files).toHaveLength(31)
    expect(files).toEqual([...EXPECTED_EXAMPLES])
    for (const file of files) {
      expect(file).not.toMatch(/\.(?:test|spec)\.ts$/)
    }
  })

  test('renders every full example and every #region slice cleanly without leaked directives', async () => {
    for (const relPath of EXPECTED_EXAMPLES) {
      const source = await readFile(join(EXAMPLES_DIR, relPath), 'utf8')
      const full = renderCodeLines(source, { lang: 'ts' })
      assertCleanRender(full.html, full.rawClean, full.highlightedLines, relPath)

      const discoveredRegions = [...source.matchAll(/^\s*\/\/\s*#region\s+(\S+)\s*$/gm)].map(m => m[1]!)
      const endRegionCount = [...source.matchAll(/^\s*\/\/\s*#endregion\b/gm)].length
      expect(endRegionCount, `${relPath}: mismatched #region/#endregion count`).toBe(discoveredRegions.length)

      const expectedRegions = EXPECTED_REGIONS[relPath] ?? []
      expect(discoveredRegions, `${relPath}: unexpected region names`).toEqual([...expectedRegions])

      for (const region of expectedRegions) {
        const sliced = renderCodeLines(source, { lang: 'ts', region })
        assertCleanRender(sliced.html, sliced.rawClean, sliced.highlightedLines, `${relPath}#${region}`)
      }
    }
  })

  test('enforces Clean Architecture / DDD import boundaries across domain, application, infra, and unit example', async () => {
    for (const domainFile of ['ddd/domain/order.ts', 'ddd/domain/ports.ts']) {
      const src = await readFile(join(EXAMPLES_DIR, domainFile), 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*(?:application|infra)/)
    }

    const appService = await readFile(join(EXAMPLES_DIR, 'ddd/application/order-service.ts'), 'utf8')
    expect(appService).toContain('../domain/')
    expect(appService).not.toMatch(/from\s+['"][^'"]*infra/)

    for (const infraFile of ['ddd/infra/sql-order-repository.ts', 'ddd/infra/system-adapters.ts', 'ddd/infra/providers.ts']) {
      const src = await readFile(join(EXAMPLES_DIR, infraFile), 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*application/)
    }

    const dddUnit = await readFile(join(EXAMPLES_DIR, 'ddd/order-service-unit-example.ts'), 'utf8')
    expect(dddUnit).not.toMatch(/from\s+['"][^'"]*infra/)
  })

  test('preserves updated site URL and all 8 verbatim runtime error messages in docs/llms.txt', async () => {
    const llms = await readFile(LLMS_TXT_PATH, 'utf8')
    const lines = llms.split('\n')
    expect(lines[8]).toContain('Human reference: https://dn-ioc.lyz.cloud/')
    expect(llms).not.toContain('[index.html](index.html)')

    const requiredErrors = [
      'No provider for token: Name',
      'Circular dependency detected: A -> B -> A',
      'Invalid inject key received',
      'Invalid provider input received',
      'Cannot inject after the app has stopped',
      'onDispose can only be called while the factory is running',
      'Cannot register cleanup after the app has stopped',
      'Cannot start an app that has been stopped',
    ]
    for (const msg of requiredErrors) {
      expect(llms).toContain(msg)
    }
  })
})
