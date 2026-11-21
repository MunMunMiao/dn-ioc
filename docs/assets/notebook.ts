;(() => {
  type ThemePref = 'auto' | 'light' | 'dark'
  type ThemeMode = 'light' | 'dark'

  interface RawSearchItem {
    title?: unknown
    chapterTitle?: unknown
    href?: unknown
    excerpt?: unknown
  }

  interface IndexedSearchItem {
    title: string
    chapterTitle: string
    href: string
    excerpt: string
    foldedTitle: string
    foldedChapter: string
    foldedExcerpt: string
  }

  const root = document.documentElement
  const docRail = document.getElementById('doc-rail')
  const contentsToggle = document.querySelector<HTMLElement>('[data-toggle-contents]')
  const railBackdrop = document.querySelector<HTMLElement>('[data-close-contents]')
  const langMenu = document.querySelector<HTMLDetailsElement>('details.lang-menu')
  const themeButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-theme-set]'))
  const searchOpenBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-open-search]'))
  const searchModal = document.getElementById('search-modal')
  const searchInput = document.getElementById('search-input')
  const searchResults = document.getElementById('search-results')
  const searchCloseBtn = document.querySelector<HTMLElement>('[data-close-search]')
  const copyTimers = new WeakMap<Element, number>()

  const copyTextToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return
    }
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    document.body.removeChild(area)
  }

  const activateCodeTab = (tabBtn: Element): void => {
    const paperCode = tabBtn.closest('.paper-code')
    const tabIndex = tabBtn.getAttribute('data-tab')
    if (!paperCode || tabIndex === null) {
      return
    }
    const tabButtons = paperCode.querySelectorAll('.p-tab')
    for (const btn of tabButtons) {
      const isSelected = btn.getAttribute('data-tab') === tabIndex
      btn.classList.toggle('is-active', isSelected)
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false')
    }
    const panels = paperCode.querySelectorAll('.p-pre')
    for (const panel of panels) {
      panel.classList.toggle('is-active', panel.getAttribute('data-panel') === tabIndex)
    }
  }

  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const tabBtn = target.closest('.p-tab')
    if (tabBtn) {
      activateCodeTab(tabBtn)
      return
    }

    const fileBtn = target.closest('.p-tree-file')
    if (fileBtn) {
      const paperCode = fileBtn.closest('.paper-code')
      const fileIndex = fileBtn.getAttribute('data-file')
      if (paperCode && fileIndex !== null) {
        const fileButtons = paperCode.querySelectorAll('.p-tree-file')
        for (const btn of fileButtons) {
          const isSelected = btn.getAttribute('data-file') === fileIndex
          btn.classList.toggle('is-active', isSelected)
          btn.setAttribute('aria-selected', isSelected ? 'true' : 'false')
        }
        const panels = paperCode.querySelectorAll('.p-pre')
        for (const panel of panels) {
          panel.classList.toggle('is-active', panel.getAttribute('data-panel') === fileIndex)
        }
        const filenameEl = paperCode.querySelector('.p-filename')
        const filePath = fileBtn.getAttribute('data-path')
        if (filenameEl && filePath) {
          filenameEl.textContent = filePath
        }
      }
      return
    }

    const copyBtn = target.closest('.p-copy')
    if (copyBtn) {
      const paperCode = copyBtn.closest('.paper-code')
      const activePanel = paperCode ? paperCode.querySelector('.p-pre.is-active') || paperCode.querySelector('.p-pre') : null
      if (activePanel) {
        const rawCode = activePanel.getAttribute('data-raw') ?? activePanel.textContent ?? ''
        const copyLabel = copyBtn.getAttribute('data-copy') || 'Copy'
        const copiedLabel = copyBtn.getAttribute('data-copied') || 'Copied'
        copyTextToClipboard(rawCode).then(
          () => {
            copyBtn.textContent = copiedLabel
            copyBtn.classList.add('is-copied')
            const prevTimer = copyTimers.get(copyBtn)
            if (prevTimer) {
              window.clearTimeout(prevTimer)
            }
            const nextTimer = window.setTimeout(() => {
              copyBtn.textContent = copyLabel
              copyBtn.classList.remove('is-copied')
            }, 1600)
            copyTimers.set(copyBtn, nextTimer)
          },
          () => {
            copyBtn.textContent = copyLabel
          },
        )
      }
    }
  })

  const THEME_STORAGE_KEY = 'dn-ioc-theme'
  const isThemePref = (value: string | null): value is ThemePref => value === 'auto' || value === 'light' || value === 'dark'
  const colorSchemeQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

  const readStoredThemePref = (): ThemePref => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (isThemePref(stored)) {
        return stored
      }
    } catch (_err) {
      // Ignore storage read errors in restricted browsing contexts
    }
    const attr = root.getAttribute('data-theme-pref')
    return isThemePref(attr) ? attr : 'auto'
  }

  const resolveThemeMode = (pref: ThemePref): ThemeMode => {
    if (pref === 'light' || pref === 'dark') {
      return pref
    }
    return colorSchemeQuery?.matches ? 'dark' : 'light'
  }

  let currentThemePref: ThemePref = readStoredThemePref()

  const applyThemePref = (pref: string | null, persist: boolean): void => {
    currentThemePref = isThemePref(pref) ? pref : 'auto'
    const resolvedMode = resolveThemeMode(currentThemePref)
    root.setAttribute('data-theme-pref', currentThemePref)
    root.setAttribute('data-mode', resolvedMode)
    for (const btn of themeButtons) {
      const isSelected = btn.getAttribute('data-theme-set') === currentThemePref
      btn.classList.toggle('is-active', isSelected)
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
    }
    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, currentThemePref)
      } catch (_err) {
        // Ignore storage write errors in restricted browsing contexts
      }
    }
  }

  applyThemePref(currentThemePref, false)

  for (const btn of themeButtons) {
    btn.addEventListener('click', () => {
      const nextPref = btn.getAttribute('data-theme-set') || 'auto'
      applyThemePref(nextPref, true)
    })
  }

  if (colorSchemeQuery) {
    const onSystemSchemeChange = (): void => {
      if (currentThemePref === 'auto') {
        applyThemePref('auto', false)
      }
    }
    if (typeof colorSchemeQuery.addEventListener === 'function') {
      colorSchemeQuery.addEventListener('change', onSystemSchemeChange)
    } else if (typeof colorSchemeQuery.addListener === 'function') {
      colorSchemeQuery.addListener(onSystemSchemeChange)
    }
  }

  const setContentsOpen = (open: boolean): void => {
    if (docRail) {
      docRail.classList.toggle('is-open', open)
    }
    if (contentsToggle) {
      contentsToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    if (railBackdrop) {
      railBackdrop.hidden = !open
    }
  }

  if (contentsToggle && docRail) {
    contentsToggle.addEventListener('click', () => {
      setContentsOpen(!docRail.classList.contains('is-open'))
    })
    docRail.addEventListener('click', event => {
      const target = event.target
      if (target instanceof Element && target.closest('a')) {
        setContentsOpen(false)
      }
    })
  }

  if (railBackdrop) {
    railBackdrop.addEventListener('click', () => {
      setContentsOpen(false)
    })
  }

  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    if (docRail?.classList.contains('is-open') && !docRail.contains(target) && !contentsToggle?.contains(target)) {
      setContentsOpen(false)
    }
    if (langMenu?.hasAttribute('open') && !langMenu.contains(target)) {
      langMenu.removeAttribute('open')
    }
  })

  const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const COMBINING_MARKS_RE = /[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g
  const TRAILING_MARK_RE = /[\u0300-\u036f\u064B-\u065F\u0670]/

  const normalizeTextChunk = (value: string): string =>
    value
      .normalize('NFD')
      .replace(COMBINING_MARKS_RE, '')
      .normalize('NFC')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .toLowerCase()

  const foldWithOffsets = (text: string): { folded: string; offsets: [number, number][] } => {
    let folded = ''
    const offsets: [number, number][] = []
    let idx = 0
    for (const ch of text) {
      const piece = normalizeTextChunk(ch)
      const nextIdx = idx + ch.length
      let units = piece.length
      while (units > 0) {
        offsets.push([idx, nextIdx])
        units -= 1
      }
      folded += piece
      idx = nextIdx
    }
    return { folded, offsets }
  }

  const foldQuery = (query: string): string => normalizeTextChunk(query).trim()

  const highlightText = (text: string, terms: readonly string[]): string => {
    if (terms.length === 0 || !text) {
      return escapeHtml(text)
    }
    const { folded, offsets } = foldWithOffsets(text)
    const ranges: [number, number][] = []
    for (const term of terms) {
      if (!term) {
        continue
      }
      let from = 0
      while (from <= folded.length - term.length) {
        const hit = folded.indexOf(term, from)
        if (hit === -1) {
          break
        }
        const startPair = offsets[hit]
        const endPair = offsets[hit + term.length - 1]
        if (startPair && endPair) {
          let end = endPair[1]
          while (end < text.length && TRAILING_MARK_RE.test(text[end]!)) {
            end += 1
          }
          ranges.push([startPair[0], end])
        }
        from = hit + Math.max(1, term.length)
      }
    }
    if (ranges.length === 0) {
      return escapeHtml(text)
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
    const merged: [number, number][] = [ranges[0]!]
    for (let i = 1; i < ranges.length; i++) {
      const prev = merged[merged.length - 1]!
      const curr = ranges[i]!
      if (curr[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], curr[1])
      } else {
        merged.push(curr)
      }
    }
    let html = ''
    let cursor = 0
    for (const [start, end] of merged) {
      if (start > cursor) {
        html += escapeHtml(text.slice(cursor, start))
      }
      html += `<mark class="search-hit">${escapeHtml(text.slice(start, end))}</mark>`
      cursor = end
    }
    if (cursor < text.length) {
      html += escapeHtml(text.slice(cursor))
    }
    return html
  }

  let searchIndexPromise: Promise<IndexedSearchItem[]> | null = null
  let currentMatches: IndexedSearchItem[] = []
  let selectedMatchIdx = 0

  const loadSearchIndex = (): Promise<IndexedSearchItem[]> => {
    if (searchIndexPromise) {
      return searchIndexPromise
    }
    const url = searchModal ? searchModal.getAttribute('data-search-url') : null
    if (!url) {
      searchIndexPromise = Promise.resolve([])
      return searchIndexPromise
    }
    searchIndexPromise = fetch(url)
      .then(res => (res.ok ? (res.json() as Promise<unknown>) : []))
      .then(items =>
        Array.isArray(items)
          ? items.map((raw): IndexedSearchItem => {
              const item = (raw ?? {}) as RawSearchItem
              const title = String(item.title || '')
              const chapterTitle = String(item.chapterTitle || '')
              const excerpt = String(item.excerpt || '')
              return {
                title,
                chapterTitle,
                href: String(item.href || '/'),
                excerpt,
                foldedTitle: foldQuery(title),
                foldedChapter: foldQuery(chapterTitle),
                foldedExcerpt: foldQuery(excerpt),
              }
            })
          : [],
      )
      .catch(() => [])
    return searchIndexPromise
  }

  const updateSelectedResult = (nextIdx: number): void => {
    if (!searchResults || currentMatches.length === 0) {
      return
    }
    const count = currentMatches.length
    selectedMatchIdx = ((nextIdx % count) + count) % count
    const optionEls = searchResults.querySelectorAll('.search-item')
    let index = 0
    for (const el of optionEls) {
      const isSelected = index === selectedMatchIdx
      el.classList.toggle('is-selected', isSelected)
      el.setAttribute('aria-selected', isSelected ? 'true' : 'false')
      if (isSelected) {
        el.scrollIntoView({ block: 'nearest' })
      }
      index += 1
    }
  }

  const renderSearchResults = async (rawQuery: string): Promise<void> => {
    if (!searchResults || !searchModal) {
      return
    }
    const items = await loadSearchIndex()
    const normalized = foldQuery(rawQuery)
    const terms = normalized ? normalized.split(/\s+/).filter(Boolean) : []

    if (terms.length === 0) {
      currentMatches = items.slice(0, 10)
    } else {
      const scored: Array<{ item: IndexedSearchItem; score: number }> = []
      for (const item of items) {
        let score = 0
        let matchedAll = true
        for (const term of terms) {
          const inTitle = item.foldedTitle.includes(term)
          const inChapter = item.foldedChapter.includes(term)
          const inExcerpt = item.foldedExcerpt.includes(term)
          if (!inTitle && !inChapter && !inExcerpt) {
            matchedAll = false
            break
          }
          if (inTitle) {
            score += item.foldedTitle.startsWith(term) ? 12 : 8
          }
          if (inChapter) {
            score += 4
          }
          if (inExcerpt) {
            score += 2
          }
        }
        if (matchedAll) {
          scored.push({ item, score })
        }
      }
      scored.sort((a, b) => b.score - a.score)
      currentMatches = scored.slice(0, 20).map(entry => entry.item)
    }

    if (currentMatches.length === 0) {
      const emptyLabel = searchModal.getAttribute('data-no-results') || 'No results.'
      searchResults.innerHTML = `<p class="search-empty">${escapeHtml(emptyLabel)}</p>`
      selectedMatchIdx = 0
      return
    }

    selectedMatchIdx = 0
    searchResults.innerHTML = currentMatches
      .map(
        (entry, idx) =>
          `<a class="search-item${idx === 0 ? ' is-selected' : ''}" role="option" aria-selected="${idx === 0 ? 'true' : 'false'}" data-result-idx="${idx}" href="${escapeHtml(entry.href)}"><span class="search-item-chapter">${highlightText(entry.chapterTitle, terms)}</span><span class="search-item-title">${highlightText(entry.title, terms)}</span><span class="search-item-excerpt">${highlightText(entry.excerpt, terms)}</span></a>`,
      )
      .join('')
  }

  const closeSearch = (): void => {
    if (searchModal instanceof HTMLDialogElement && searchModal.open) {
      searchModal.close()
    }
  }

  const openSearch = (): void => {
    if (!(searchModal instanceof HTMLDialogElement)) {
      return
    }
    setContentsOpen(false)
    if (langMenu) {
      langMenu.removeAttribute('open')
    }
    if (!searchModal.open) {
      searchModal.showModal()
    }
    if (searchInput instanceof HTMLInputElement) {
      searchInput.focus()
      searchInput.select()
      void renderSearchResults(searchInput.value)
    }
  }

  for (const btn of searchOpenBtns) {
    btn.addEventListener('click', openSearch)
  }

  if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', closeSearch)
  }

  if (searchModal instanceof HTMLDialogElement) {
    searchModal.addEventListener('click', event => {
      if (event.target === searchModal) {
        closeSearch()
      }
      const target = event.target
      if (target instanceof Element && target.closest('.search-item')) {
        closeSearch()
      }
    })
  }

  if (searchResults) {
    searchResults.addEventListener('mousemove', event => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const itemEl = target.closest('.search-item')
      if (itemEl) {
        const idx = Number.parseInt(itemEl.getAttribute('data-result-idx') || '0', 10)
        if (!Number.isNaN(idx) && idx !== selectedMatchIdx) {
          updateSelectedResult(idx)
        }
      }
    })
  }

  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener('input', () => {
      void renderSearchResults(searchInput.value)
    })
    searchInput.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) {
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        updateSelectedResult(selectedMatchIdx + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        updateSelectedResult(selectedMatchIdx - 1)
      } else if (event.key === 'Enter') {
        const chosen = currentMatches[selectedMatchIdx]
        if (chosen) {
          event.preventDefault()
          closeSearch()
          window.location.href = chosen.href
        }
      }
    })
  }

  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) {
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (searchModal instanceof HTMLDialogElement && searchModal.open) {
        closeSearch()
      } else {
        openSearch()
      }
      return
    }
    if (event.key === 'Escape') {
      if (docRail?.classList.contains('is-open')) {
        const shouldRestoreFocus = Boolean(
          docRail && (docRail.contains(document.activeElement) || document.activeElement === contentsToggle),
        )
        setContentsOpen(false)
        if (shouldRestoreFocus && contentsToggle instanceof HTMLElement) {
          contentsToggle.focus()
        }
      }
      if (langMenu?.hasAttribute('open')) {
        langMenu.removeAttribute('open')
      }
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
      const active = document.activeElement
      if (active instanceof Element && active.classList.contains('p-tab')) {
        const paperCode = active.closest('.paper-code')
        if (paperCode) {
          const tabs = Array.from(paperCode.querySelectorAll('.p-tab'))
          const idx = tabs.indexOf(active)
          if (idx !== -1 && tabs.length > 1) {
            event.preventDefault()
            let nextIdx = idx
            if (event.key === 'ArrowRight') {
              nextIdx = (idx + 1) % tabs.length
            } else if (event.key === 'ArrowLeft') {
              nextIdx = (idx - 1 + tabs.length) % tabs.length
            } else if (event.key === 'Home') {
              nextIdx = 0
            } else if (event.key === 'End') {
              nextIdx = tabs.length - 1
            }
            const nextTab = tabs[nextIdx]
            if (nextTab) {
              activateCodeTab(nextTab)
              if (nextTab instanceof HTMLElement) {
                nextTab.focus()
              }
            }
          }
        }
        return
      }
    }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const active = document.activeElement
      const isEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      if (!isEditable && !(searchModal instanceof HTMLDialogElement && searchModal.open)) {
        event.preventDefault()
        openSearch()
      }
    }
  })
})()
