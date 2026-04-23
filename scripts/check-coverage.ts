import { readdir, readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'

const coverageDir = join(import.meta.dir, '../coverage')
const lcovPath = join(coverageDir, 'lcov.info')
const rootDir = join(import.meta.dir, '..')
const sourceDir = join(rootDir, 'src')

type CoverageRecord = {
  file: string
  functionsFound: number
  functionsHit: number
  linesFound: number
  linesHit: number
}

async function runCoverage() {
  await rm(coverageDir, { recursive: true, force: true })

  const proc = Bun.spawn(['bun', 'test', '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${coverageDir}`], {
    cwd: rootDir,
    stderr: 'inherit',
    stdout: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

function parseLcov(content: string): CoverageRecord[] {
  const records: CoverageRecord[] = []
  const blocks = content
    .split('end_of_record')
    .map(block => block.trim())
    .filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n')
    let file = ''
    let functionsFound = 0
    let functionsHit = 0
    let linesFound = 0
    let linesHit = 0

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        file = line.slice(3)
      } else if (line.startsWith('FNF:')) {
        functionsFound = Number(line.slice(4))
      } else if (line.startsWith('FNH:')) {
        functionsHit = Number(line.slice(4))
      } else if (line.startsWith('LF:')) {
        linesFound = Number(line.slice(3))
      } else if (line.startsWith('LH:')) {
        linesHit = Number(line.slice(3))
      }
    }

    if (file) {
      records.push({
        file,
        functionsFound,
        functionsHit,
        linesFound,
        linesHit,
      })
    }
  }

  return records
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        return collectSourceFiles(entryPath)
      }

      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
        return []
      }

      return [relative(rootDir, entryPath)]
    }),
  )

  return files.flat().sort()
}

function assertFullCoverage(records: CoverageRecord[]) {
  if (records.length === 0) {
    throw new Error('Coverage gate failed: no LCOV records were produced.')
  }

  const failed = records.filter(record => {
    const functionsOk = record.functionsFound === record.functionsHit
    const linesOk = record.linesFound === record.linesHit
    return !(functionsOk && linesOk)
  })

  if (failed.length === 0) {
    console.log('\nCoverage gate passed: 100% functions and 100% lines for all files.')
    return
  }

  const details = failed
    .map(record => {
      return [
        `- ${record.file}`,
        `  functions: ${record.functionsHit}/${record.functionsFound}`,
        `  lines: ${record.linesHit}/${record.linesFound}`,
      ].join('\n')
    })
    .join('\n')

  throw new Error(`Coverage gate failed.\n${details}`)
}

function assertAllSourceFilesCovered(records: CoverageRecord[], sourceFiles: string[]) {
  const coveredFiles = new Set(records.map(record => record.file))
  const missing = sourceFiles.filter(file => !coveredFiles.has(file))

  if (missing.length === 0) {
    return
  }

  throw new Error(`Coverage gate failed: missing LCOV records for source files.\n${missing.map(file => `- ${file}`).join('\n')}`)
}

async function main() {
  await runCoverage()
  const lcov = await readFile(lcovPath, 'utf8')
  const records = parseLcov(lcov)
  const sourceFiles = await collectSourceFiles(sourceDir)
  assertAllSourceFilesCovered(records, sourceFiles)
  assertFullCoverage(records)
}

await main()
