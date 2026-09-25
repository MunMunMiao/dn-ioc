import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig, type UserConfig } from 'tsdown'

const entry = 'src/index.ts'

// The published package.json is derived from this repo's: the fields that describe the source
// layout are rewritten to point at the flat dist layout, and the ones that only concern
// development are dropped.
//
// `node:fs` rather than `Bun.*`: tsdown runs this config in Node even when invoked through Bun.
async function writeDistPackageJson(): Promise<void> {
  const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')) as Record<string, unknown>

  packageJson.main = './index.js'
  packageJson.module = './index.js'
  packageJson.types = './index.d.ts'
  packageJson.typings = './index.d.ts'
  packageJson.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }
  packageJson.unpkg = './index.min.js'
  packageJson.jsdelivr = './index.min.js'
  delete packageJson.scripts
  delete packageJson.devDependencies
  // `engines` describes this repo's toolchain (Bun), not a constraint on consumers.
  delete packageJson.engines

  await writeFile(new URL('./dist/package.json', import.meta.url), `${JSON.stringify(packageJson, undefined, 2)}\n`)
}

export default defineConfig([
  {
    format: 'esm',
    outDir: 'dist',
    // A container with no platform APIs of its own: leave the output to whatever runtime or
    // bundler consumes it, and leave the syntax at what the source already targets.
    platform: 'neutral',
    target: false,
    clean: true,
    dts: true,
    entry: { index: entry },
    copy: ['./README.md', './LICENSE'],
    hooks: {
      async 'build:done'() {
        await writeDistPackageJson()
      },
    },
  } satisfies UserConfig,
  {
    format: 'esm',
    outDir: 'dist',
    platform: 'neutral',
    target: false,
    // The first config owns the directory; cleaning here would delete what it just produced.
    clean: false,
    dts: false,
    minify: true,
    entry: { 'index.min': entry },
  } satisfies UserConfig,
])
