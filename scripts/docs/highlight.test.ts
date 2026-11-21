import { describe, expect, test } from 'bun:test'
import { renderCodeLines } from './highlight'

describe('renderCodeLines', () => {
  test('escapes HTML characters inside TypeScript generics and operators', () => {
    const src = `export const repo = token<Order | undefined>('Order')\nconst ok = 1 < 2 && 3 > 1\nconst attr = "a&b"\n`
    const out = renderCodeLines(src, { lang: 'ts' })
    expect(out.html).toContain('&lt;')
    expect(out.html).toContain('&gt;')
    expect(out.html).toContain('&amp;&amp;')
    expect(out.html).toContain('&quot;a&amp;b&quot;')
    expect(out.html).not.toContain('<Order')
  })

  test('maps TypeScript tokens to print-ink classes and wraps numbered lines', () => {
    const src = [
      '// domain contract',
      '/* line one',
      '   line two */',
      'type RepoId = string',
      'interface Order { id: RepoId }',
      'export function findOrder(id: string) {',
      `  return \`ord_\${id}\``,
      '}',
      '',
    ].join('\n')
    const out = renderCodeLines(src, { lang: 'ts' })
    expect(out.html).toContain('<span class="pln">1</span>')
    expect(out.html).toContain('<span class="cm">// domain contract</span>')
    expect(out.html).toContain('<span class="pl"><span class="pln">2</span><span class="cm">/* line one</span></span>')
    expect(out.html).toContain('<span class="pl"><span class="pln">3</span><span class="cm">   line two */</span></span>')
    expect(out.html).toContain('<span class="kw">type</span> <span class="ty">RepoId</span> = <span class="ty">string</span>')
    expect(out.html).toContain('<span class="kw">interface</span> <span class="ty">Order</span>')
    expect(out.html).toContain('<span class="kw">function</span> <span class="fn">findOrder</span>')
    expect(out.html).toContain(`<span class="str">\`ord_\${</span>id<span class="str">}\`</span>`)
  })

  test('extracts // [!hl] and # [!hl] lines and strips directives from both HTML and rawClean', () => {
    const src = `const a = 1\nconst b = 2 // [!hl]\n`
    const out = renderCodeLines(src, { lang: 'ts' })
    expect(out.highlightedLines).toEqual([2])
    expect(out.html).toContain('class="pl hl"')
    expect(out.html).not.toContain('[!hl]')
    expect(out.rawClean).toBe('const a = 1\nconst b = 2')

    const shOut = renderCodeLines(`# install\nbun add -d dn-ioc # [!hl]\nbunx skills add MunMunMiao/dn-ioc\n`, { lang: 'bash' })
    expect(shOut.highlightedLines).toEqual([2])
    expect(shOut.html).toContain('class="pl hl"')
    expect(shOut.html).toContain('<span class="cm"># install</span>')
    expect(shOut.html).toContain('<span class="fn">bun</span> add <span class="kw">-d</span> dn-ioc')
    expect(shOut.html).toContain('<span class="fn">bunx</span> skills add MunMunMiao/dn-ioc')
    expect(shOut.html).not.toContain('<span class="kw">-ioc</span>')
    expect(shOut.html).not.toContain('[!hl]')
    expect(shOut.rawClean).toBe('# install\nbun add -d dn-ioc\nbunx skills add MunMunMiao/dn-ioc')
  })

  test('slices named #region blocks, strips region comments in full-file mode, and throws on missing region', () => {
    const src = `// #region alpha\nconst x = 'hi'\n// #endregion\nconst y = 2\n`
    const sliced = renderCodeLines(src, { lang: 'ts', region: 'alpha' })
    expect(sliced.rawClean).toBe(`const x = 'hi'`)
    expect(sliced.html).not.toContain('#region')

    const full = renderCodeLines(src, { lang: 'ts' })
    expect(full.rawClean).toBe(`const x = 'hi'\nconst y = 2`)
    expect(full.html).not.toContain('#region')
    expect(full.html).not.toContain('#endregion')

    expect(() => renderCodeLines(src, { lang: 'ts', region: 'missing' })).toThrow(/Unknown code region: missing/)
  })

  test('tokenizes json and html snippets with escaped markup', () => {
    const jsonOut = renderCodeLines(`{\n  "imports": "https://esm.sh/dn-ioc",\n  "strict": true\n}\n`, { lang: 'json' })
    expect(jsonOut.html).toContain('<span class="ty">&quot;imports&quot;</span>')
    expect(jsonOut.html).toContain('<span class="str">&quot;https://esm.sh/dn-ioc&quot;</span>')
    expect(jsonOut.html).toContain('<span class="kw">true</span>')

    const htmlOut = renderCodeLines(`<!-- map -->\n<script type="importmap"></script>\n`, { lang: 'html' })
    expect(htmlOut.html).toContain('<span class="cm">&lt;!-- map --&gt;</span>')
    expect(htmlOut.html).toContain('&lt;<span class="kw">script</span>')
    expect(htmlOut.html).toContain('<span class="ty">type</span>=<span class="str">&quot;importmap&quot;</span>')
    expect(htmlOut.html).not.toContain('<script')
  })
})
