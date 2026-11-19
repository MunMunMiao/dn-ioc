import { describe, expect, test } from 'bun:test'
import { absoluteChapterUrl, chapterHref, DEFAULT_LOCALE, getLocale, LOCALES, type LocaleCode, SITE_ORIGIN } from '../../docs/locales'

describe('locales registry', () => {
  test('registers all 9 required locales with en-US as default, dir, and native labels', () => {
    expect(SITE_ORIGIN).toBe('https://dn-ioc.lyz.cloud')
    expect(DEFAULT_LOCALE).toBe('en-US')
    expect(LOCALES.map(l => l.code)).toEqual(['en-US', 'zh-Hans', 'zh-Hant-HK', 'zh-Hant-TW', 'ja', 'ko', 'es', 'fr', 'ar'])
    expect(LOCALES.map(l => l.label)).toEqual([
      'English (US)',
      '简体中文',
      '繁體中文（香港）',
      '繁體中文（台灣）',
      '日本語',
      '한국어',
      'Español',
      'Français',
      'العربية',
    ])

    for (const loc of LOCALES) {
      const resolved = getLocale(loc.code)
      expect(resolved.htmlLang).toBe(loc.code)
      expect(resolved.dir).toBe(loc.code === 'ar' ? 'rtl' : 'ltr')
      expect(resolved.ui.contents.length).toBeGreaterThan(0)
      expect(resolved.ui.search.length).toBeGreaterThan(0)
      expect(resolved.ui.searchPlaceholder.length).toBeGreaterThan(0)
      expect(resolved.ui.noResults.length).toBeGreaterThan(0)
      expect(resolved.ui.copy.length).toBeGreaterThan(0)
      expect(resolved.ui.copied.length).toBeGreaterThan(0)
      expect(resolved.ui.prev.length).toBeGreaterThan(0)
      expect(resolved.ui.next.length).toBeGreaterThan(0)
      expect(resolved.ui.page.length).toBeGreaterThan(0)
      expect(resolved.ui.language.length).toBeGreaterThan(0)
      expect(resolved.ui.theme.length).toBeGreaterThan(0)
      expect(resolved.ui.autoTheme.length).toBeGreaterThan(0)
      expect(resolved.ui.lightTheme.length).toBeGreaterThan(0)
      expect(resolved.ui.darkTheme.length).toBeGreaterThan(0)
      expect(resolved.ui.files.length).toBeGreaterThan(0)
      expect(resolved.ui.lightPaper.length).toBeGreaterThan(0)
      expect(resolved.ui.darkCard.length).toBeGreaterThan(0)
      expect(resolved.ui.parts.start.length).toBeGreaterThan(0)
      expect(resolved.ui.parts.kernel.length).toBeGreaterThan(0)
      expect(resolved.ui.parts.patterns.length).toBeGreaterThan(0)
      expect(resolved.ui.parts.reference.length).toBeGreaterThan(0)
    }

    expect(getLocale('ar').dir).toBe('rtl')
    for (const code of ['en-US', 'zh-Hans', 'zh-Hant-HK', 'zh-Hant-TW', 'ja', 'ko', 'es', 'fr'] as const) {
      expect(getLocale(code).dir).toBe('ltr')
    }

    const hk = getLocale('zh-Hant-HK')
    const tw = getLocale('zh-Hant-TW')
    expect(hk.ui.copied).not.toBe(tw.ui.copied)
    expect(hk.ui.noResults).not.toBe(tw.ui.noResults)

    expect(() => getLocale('de' as LocaleCode)).toThrow(/Unknown locale/)
  })

  test('formats root and lowercase localized chapter URLs and absolute URLs without double slashes', () => {
    expect(chapterHref('en-US', '')).toBe('/')
    expect(chapterHref('en-US', 'ddd')).toBe('/ddd/')
    expect(chapterHref('zh-Hans', '')).toBe('/zh-hans/')
    expect(chapterHref('zh-Hans', 'ddd')).toBe('/zh-hans/ddd/')
    expect(chapterHref('zh-Hant-HK', 'mvc')).toBe('/zh-hant-hk/mvc/')
    expect(chapterHref('zh-Hant-TW', 'tokens')).toBe('/zh-hant-tw/tokens/')
    expect(chapterHref('ja', '')).toBe('/ja/')
    expect(chapterHref('ko', 'async')).toBe('/ko/async/')
    expect(chapterHref('es', 'scopes')).toBe('/es/scopes/')
    expect(chapterHref('fr', 'errors')).toBe('/fr/errors/')
    expect(chapterHref('ar', '')).toBe('/ar/')
    expect(chapterHref('ar', 'ddd')).toBe('/ar/ddd/')

    expect(absoluteChapterUrl('en-US', '')).toBe('https://dn-ioc.lyz.cloud/')
    expect(absoluteChapterUrl('en-US', 'ddd')).toBe('https://dn-ioc.lyz.cloud/ddd/')
    expect(absoluteChapterUrl('zh-Hant-HK', 'ddd')).toBe('https://dn-ioc.lyz.cloud/zh-hant-hk/ddd/')
    expect(absoluteChapterUrl('ar', 'ddd')).toBe('https://dn-ioc.lyz.cloud/ar/ddd/')
  })
})
