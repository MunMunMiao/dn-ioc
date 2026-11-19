export type LocaleCode = 'en-US' | 'zh-Hans' | 'zh-Hant-HK' | 'zh-Hant-TW' | 'ja' | 'ko' | 'es' | 'fr' | 'ar'
export type PartId = 'start' | 'kernel' | 'patterns' | 'reference'

export interface LocaleConfig {
  code: LocaleCode
  htmlLang: string
  dir: 'ltr' | 'rtl'
  label: string
  urlPrefix: string
  ui: {
    contents: string
    search: string
    searchPlaceholder: string
    noResults: string
    copy: string
    copied: string
    prev: string
    next: string
    page: string
    language: string
    theme: string
    autoTheme: string
    lightTheme: string
    darkTheme: string
    files: string
    lightPaper: string
    darkCard: string
    parts: Record<PartId, string>
  }
}

export const SITE_ORIGIN = 'https://dn-ioc.lyz.cloud'
export const DEFAULT_LOCALE: LocaleCode = 'en-US'

export const LOCALES: readonly LocaleConfig[] = [
  {
    code: 'en-US',
    htmlLang: 'en-US',
    dir: 'ltr',
    label: 'English (US)',
    urlPrefix: '/',
    ui: {
      contents: 'Contents',
      search: 'Search',
      searchPlaceholder: 'Jump to a topic or API...',
      noResults: 'Nothing matched that query.',
      copy: 'Copy',
      copied: 'Copied',
      prev: 'Previous',
      next: 'Next',
      page: 'Page',
      language: 'Language',
      theme: 'Theme',
      autoTheme: 'Auto',
      lightTheme: 'Light',
      darkTheme: 'Dark',
      files: 'Files',
      lightPaper: 'Cotton Paper',
      darkCard: 'Dark Cardstock',
      parts: {
        start: 'Get Started',
        kernel: 'Core Kernel',
        patterns: 'Engineering Patterns',
        reference: 'Reference',
      },
    },
  },
  {
    code: 'zh-Hans',
    htmlLang: 'zh-Hans',
    dir: 'ltr',
    label: '简体中文',
    urlPrefix: '/zh-hans/',
    ui: {
      contents: '目录',
      search: '搜索',
      searchPlaceholder: '搜章节、API 或报错信息…',
      noResults: '没找到相关内容，换个词试试？',
      copy: '复制',
      copied: '已复制',
      prev: '上一章',
      next: '下一章',
      page: '页',
      language: '语言',
      theme: '外观主题',
      autoTheme: '自动',
      lightTheme: '浅色',
      darkTheme: '深色',
      files: '文件列表',
      lightPaper: '浅色棉纸',
      darkCard: '深色卡纸',
      parts: {
        start: '快速开始',
        kernel: '核心原语',
        patterns: '工程架构实战',
        reference: '速查参考',
      },
    },
  },
  {
    code: 'zh-Hant-HK',
    htmlLang: 'zh-Hant-HK',
    dir: 'ltr',
    label: '繁體中文（香港）',
    urlPrefix: '/zh-hant-hk/',
    ui: {
      contents: '目錄',
      search: '搜尋',
      searchPlaceholder: '搵章節、API 或者 Error…',
      noResults: '搵唔到相關內容，轉個字眼再試吓？',
      copy: '複製',
      copied: '複製咗',
      prev: '上一篇',
      next: '下一篇',
      page: '頁',
      language: '語言',
      theme: '外觀主題',
      autoTheme: '自動',
      lightTheme: '淺色',
      darkTheme: '深色',
      files: '檔案列表',
      lightPaper: '淺色棉紙',
      darkCard: '深色卡紙',
      parts: {
        start: '快速開始',
        kernel: '核心原語',
        patterns: '實戰架構模式',
        reference: 'API 速查',
      },
    },
  },
  {
    code: 'zh-Hant-TW',
    htmlLang: 'zh-Hant-TW',
    dir: 'ltr',
    label: '繁體中文（台灣）',
    urlPrefix: '/zh-hant-tw/',
    ui: {
      contents: '目錄',
      search: '搜尋',
      searchPlaceholder: '搜尋章節、API 或錯誤訊息…',
      noResults: '找不到相關內容，換個關鍵字試試看？',
      copy: '複製',
      copied: '已複製',
      prev: '上一章',
      next: '下一章',
      page: '頁',
      language: '語言',
      theme: '外觀主題',
      autoTheme: '自動',
      lightTheme: '淺色',
      darkTheme: '深色',
      files: '檔案列表',
      lightPaper: '淺色棉紙',
      darkCard: '深色厚卡',
      parts: {
        start: '快速開始',
        kernel: '核心原語',
        patterns: '專案架構實戰',
        reference: '速查手冊',
      },
    },
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    dir: 'ltr',
    label: '日本語',
    urlPrefix: '/ja/',
    ui: {
      contents: '目次',
      search: '検索',
      searchPlaceholder: 'トピックや API を検索…',
      noResults: '一致する項目が見つかりませんでした。',
      copy: 'コピー',
      copied: 'コピー済み',
      prev: '前へ',
      next: '次へ',
      page: 'ページ',
      language: '言語',
      theme: 'テーマ',
      autoTheme: '自動',
      lightTheme: 'ライト',
      darkTheme: 'ダーク',
      files: 'ファイル',
      lightPaper: 'コットン紙',
      darkCard: 'ダークカード',
      parts: {
        start: 'はじめに',
        kernel: 'コア機能',
        patterns: '実践アーキテクチャ',
        reference: 'リファレンス',
      },
    },
  },
  {
    code: 'ko',
    htmlLang: 'ko',
    dir: 'ltr',
    label: '한국어',
    urlPrefix: '/ko/',
    ui: {
      contents: '목차',
      search: '검색',
      searchPlaceholder: '주제나 API를 검색해 보세요…',
      noResults: '일치하는 결과가 없어요.',
      copy: '복사',
      copied: '복사됨',
      prev: '이전',
      next: '다음',
      page: '페이지',
      language: '언어',
      theme: '테마',
      autoTheme: '자동',
      lightTheme: '라이트',
      darkTheme: '다크',
      files: '파일',
      lightPaper: '코튼 페이퍼',
      darkCard: '다크 카드스톡',
      parts: {
        start: '시작하기',
        kernel: '핵심 기본기',
        patterns: '실전 아키텍처',
        reference: '레퍼런스',
      },
    },
  },
  {
    code: 'es',
    htmlLang: 'es',
    dir: 'ltr',
    label: 'Español',
    urlPrefix: '/es/',
    ui: {
      contents: 'Índice',
      search: 'Buscar',
      searchPlaceholder: 'Busca un tema o API…',
      noResults: 'No encontramos nada con esa búsqueda.',
      copy: 'Copiar',
      copied: 'Copiado',
      prev: 'Anterior',
      next: 'Siguiente',
      page: 'Pág.',
      language: 'Idioma',
      theme: 'Tema',
      autoTheme: 'Auto',
      lightTheme: 'Claro',
      darkTheme: 'Oscuro',
      files: 'Archivos',
      lightPaper: 'Papel algodón',
      darkCard: 'Cartulina oscura',
      parts: {
        start: 'Primeros pasos',
        kernel: 'Núcleo base',
        patterns: 'Patrones reales',
        reference: 'Referencia',
      },
    },
  },
  {
    code: 'fr',
    htmlLang: 'fr',
    dir: 'ltr',
    label: 'Français',
    urlPrefix: '/fr/',
    ui: {
      contents: 'Sommaire',
      search: 'Rechercher',
      searchPlaceholder: 'Chercher un sujet ou une API…',
      noResults: 'Aucun résultat pour cette recherche.',
      copy: 'Copier',
      copied: 'Copié',
      prev: 'Précédent',
      next: 'Suivant',
      page: 'Page',
      language: 'Langue',
      theme: 'Thème',
      autoTheme: 'Auto',
      lightTheme: 'Clair',
      darkTheme: 'Sombre',
      files: 'Fichiers',
      lightPaper: 'Papier coton',
      darkCard: 'Carton sombre',
      parts: {
        start: 'Démarrage',
        kernel: 'Noyau de base',
        patterns: 'Patterns d’architecture',
        reference: 'Référence',
      },
    },
  },
  {
    code: 'ar',
    htmlLang: 'ar',
    dir: 'rtl',
    label: 'العربية',
    urlPrefix: '/ar/',
    ui: {
      contents: 'المحتويات',
      search: 'بحث',
      searchPlaceholder: 'ابحث عن موضوع أو API أو رسالة خطأ…',
      noResults: 'ما لقينا نتيجة مطابقة، جرّب كلمة ثانية.',
      copy: 'نسخ',
      copied: 'تم النسخ',
      prev: 'السابق',
      next: 'التالي',
      page: 'صفحة',
      language: 'اللغة',
      theme: 'المظهر',
      autoTheme: 'تلقائي',
      lightTheme: 'فاتح',
      darkTheme: 'داكن',
      files: 'الملفات',
      lightPaper: 'ورق فاتح',
      darkCard: 'ورق داكن',
      parts: {
        start: 'البداية السريعة',
        kernel: 'النواة الأساسية',
        patterns: 'أنماط وهندسة عملية',
        reference: 'المرجع السريع',
      },
    },
  },
]

const LOCALE_MAP = new Map<LocaleCode, LocaleConfig>(LOCALES.map(loc => [loc.code, loc]))

export function getLocale(code: LocaleCode): LocaleConfig {
  const found = LOCALE_MAP.get(code)
  if (!found) {
    throw new Error(`Unknown locale: ${code}`)
  }
  return found
}

export function chapterHref(locale: LocaleCode, slug: string): string {
  const { urlPrefix } = getLocale(locale)
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '')
  return cleanSlug ? `${urlPrefix}${cleanSlug}/` : urlPrefix
}

export function absoluteChapterUrl(locale: LocaleCode, slug: string): string {
  return `${SITE_ORIGIN}${chapterHref(locale, slug)}`
}
