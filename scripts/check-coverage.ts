import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const coverageDir = join(import.meta.dir, '../coverage')
const lcovPath = join(coverageDir, 'lcov.info')

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
    cwd: join(import.meta.dir, '..'),
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

async function main() {
  await runCoverage()
  const lcov = await readFile(lcovPath, 'utf8')
  const records = parseLcov(lcov)
  assertFullCoverage(records)
}

await main()
