import { build, file, write } from 'bun'
import { rm } from 'fs/promises';
import { join } from 'path'

const distPath = join(__dirname, '../dist')

// clean dist
await rm(distPath, { recursive: true, force: true });

// build
{
  await Promise.all([
    build({
      entrypoints: ['./src/index.ts'],
      outdir: distPath,
      target: 'browser',
      format: 'esm',
      naming: {
        entry: 'index.js',
        asset: 'index.js'
      }
    }),
    build({
      entrypoints: ['./src/index.ts'],
      outdir: distPath,
      target: 'browser',
      format: 'esm',
      minify: true,
      naming: {
        entry: 'index.min.js',
        asset: 'index.min.js'
      }
    })
  ])
}

// generate package.json
{
  const packageJson = await file(join(__dirname, '../package.json')).json()

  packageJson.main = 'index.js'
  packageJson.types = 'index.d.ts'
  delete packageJson.scripts
  delete packageJson.devDependencies

  await write(join(distPath, 'package.json'), JSON.stringify(packageJson, null, 2))
}

// generate readme
{
  const readme = await file(join(__dirname, '../README.md')).text()

  await write(join(distPath, 'README.md'), readme)
}

// generate license
{
  const license = await file(join(__dirname, '../LICENSE')).text()

  await write(join(distPath, 'LICENSE'), license)
}
