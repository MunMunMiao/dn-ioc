import { readdir, readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'

// Bun 1.4.3 has no coverage threshold. `bun test --coverage` exits 0 at any percentage, and an
// unknown flag such as `--coverage-threshold` is ignored. The reporters it does have are `text`
// and `lcov`. This gate is the missing check: 100% functions and lines, and every non-test source
// file present in the report.
const root = join(import.meta.dir, '..')
const coverageDir = join(root, 'coverage')
const srcDir = join(root, 'src')

await rm(coverageDir, { recursive: true, force: true })

const proc = Bun.spawn(['bun', 'test', '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${coverageDir}`], {
  cwd: root,
  stderr: 'inherit',
  stdout: 'inherit',
})
const exitCode = await proc.exited
if (exitCode !== 0) {
  process.exit(exitCode)
}

const lcov = await readFile(join(coverageDir, 'lcov.info'), 'utf8')
const records = new Map<string, { functionsHit: number; functionsFound: number; linesHit: number; linesFound: number }>()

for (const block of lcov.split('end_of_record')) {
  const file = block.match(/^SF:(.+)$/m)?.[1]
  if (!file) {
    continue
  }
  const num = (tag: string) => Number(block.match(new RegExp(`^${tag}:(\\d+)$`, 'm'))?.[1] ?? Number.NaN)
  const key = file.startsWith(`${root}/`) ? relative(root, file) : file
  records.set(key, {
    functionsHit: num('FNH'),
    functionsFound: num('FNF'),
    linesHit: num('LH'),
    linesFound: num('LF'),
  })
}

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(path)))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(relative(root, path))
    }
  }
  return found
}

const missing = (await sourceFiles(srcDir)).filter(file => !records.has(file))
const short = [...records].filter(([, record]) => {
  return record.functionsHit !== record.functionsFound || record.linesHit !== record.linesFound
})

if (records.size === 0 || missing.length > 0 || short.length > 0) {
  const details = [
    ...missing.map(file => `- ${file}: no coverage record`),
    ...short.map(
      ([file, record]) =>
        `- ${file}: functions ${record.functionsHit}/${record.functionsFound}, lines ${record.linesHit}/${record.linesFound}`,
    ),
  ]
  throw new Error(`Coverage gate failed.\n${details.join('\n') || 'no LCOV records'}`)
}

console.log('\nCoverage gate passed: 100% functions and 100% lines for all files.')
