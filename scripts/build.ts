import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { build, file, write } from 'bun'

const distPath = join(__dirname, '../dist')

// clean dist
async function clean() {
  await rm(distPath, { recursive: true, force: true })
}

async function buildAll() {
  await Promise.all([
    build({
      entrypoints: ['./src/index.ts'],
      outdir: distPath,
      target: 'browser',
      format: 'esm',
      naming: {
        entry: 'index.js',
        asset: 'index.js',
      },
    }),
    build({
      entrypoints: ['./src/index.ts'],
      outdir: distPath,
      target: 'browser',
      format: 'esm',
      minify: true,
      naming: {
        entry: 'index.min.js',
        asset: 'index.min.js',
      },
    }),
  ])
}

async function generatePackageJson() {
  const packageJson = await file(join(__dirname, '../package.json')).json()

  packageJson.main = 'index.js'
  packageJson.types = 'index.d.ts'
  delete packageJson.scripts
  delete packageJson.devDependencies

  await write(join(distPath, 'package.json'), JSON.stringify(packageJson, null, 2))
}

async function generateReadme() {
  const readme = await file(join(__dirname, '../README.md')).text()

  await write(join(distPath, 'README.md'), readme)
}

async function generateLicense() {
  const license = await file(join(__dirname, '../LICENSE')).text()

  await write(join(distPath, 'LICENSE'), license)
}

async function main() {
  await clean()
  await buildAll()
  await generatePackageJson()
  await generateReadme()
  await generateLicense()
}

main()
