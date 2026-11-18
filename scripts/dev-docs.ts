import { existsSync, watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { runDocsBuild } from './build-docs'

const REPO_ROOT = join(import.meta.dir, '..')
const DIST_DIR = resolve(REPO_ROOT, 'docs/dist')
const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT ?? 8765)

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function normalizeMixedCaseLocalePrefix(pathname: string): string | null {
  const rules: [RegExp, string][] = [
    [/^\/en-US(?:\/(.*))?$/i, '/$1'],
    [/^\/zh-Hans(\/.*|$)/, '/zh-hans$1'],
    [/^\/zh-Hant-HK(\/.*|$)/, '/zh-hant-hk$1'],
    [/^\/zh-Hant-TW(\/.*|$)/, '/zh-hant-tw$1'],
  ]
  for (const [pattern, target] of rules) {
    if (pattern.test(pathname)) {
      const redirected = pathname.replace(pattern, target) || '/'
      if (redirected !== pathname) {
        return redirected.endsWith('/') || extname(redirected) ? redirected : `${redirected}/`
      }
    }
  }
  return null
}

async function resolveStaticFile(pathname: string): Promise<string | null> {
  const safeRel = decodeURIComponent(pathname).replace(/^\/+/, '')
  const candidate = resolve(DIST_DIR, safeRel)
  if (candidate !== DIST_DIR && !candidate.startsWith(`${DIST_DIR}${sep}`)) {
    return null
  }

  try {
    const info = await stat(candidate)
    if (info.isFile()) {
      return candidate
    }
    if (info.isDirectory()) {
      const indexFile = join(candidate, 'index.html')
      const indexInfo = await stat(indexFile)
      if (indexInfo.isFile()) {
        return indexFile
      }
    }
  } catch {
    return null
  }
  return null
}

async function rebuild(label: string): Promise<void> {
  const started = performance.now()
  try {
    const res = await runDocsBuild(REPO_ROOT)
    const ms = (performance.now() - started).toFixed(0)
    console.log(`[docs:dev] ${label}: built ${res.pagesWritten} page(s) [${res.localesBuilt.join(', ')}] in ${ms}ms`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[docs:dev] ${label} failed: ${msg}`)
  }
}

if (import.meta.main) {
  await rebuild('Initial build')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const watchTargets = [
    join(REPO_ROOT, 'docs/content'),
    join(REPO_ROOT, 'docs/examples'),
    join(REPO_ROOT, 'docs/assets'),
    join(REPO_ROOT, 'docs/llms.txt'),
  ]

  for (const target of watchTargets) {
    if (!existsSync(target)) {
      continue
    }
    watch(target, { recursive: true }, (_event, filename) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        void rebuild(`Rebuilt (${filename ?? 'change'})`)
      }, 80)
    })
  }

  const server = Bun.serve({
    hostname: HOST,
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url)
      const redirectTarget = normalizeMixedCaseLocalePrefix(url.pathname)
      if (redirectTarget) {
        return Response.redirect(`${url.origin}${redirectTarget}${url.search}`, 301)
      }

      const filePath = await resolveStaticFile(url.pathname)
      if (!filePath) {
        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }

      const ext = extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
      return new Response(Bun.file(filePath), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      })
    },
  })

  console.log(`[docs:dev] Serving docs/dist at http://${server.hostname}:${server.port}`)
}
