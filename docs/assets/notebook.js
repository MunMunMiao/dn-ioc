;(() => {
  const root = document.documentElement
  const docRail = document.getElementById('doc-rail')
  const contentsToggle = document.querySelector('[data-toggle-contents]')
  const railBackdrop = document.querySelector('[data-close-contents]')
  const langMenu = document.querySelector('details.lang-menu')
  const themeToggle = document.querySelector('[data-toggle-theme]')
  const searchOpenBtns = Array.from(document.querySelectorAll('[data-open-search]'))
  const searchModal = document.getElementById('search-modal')
  const searchInput = document.getElementById('search-input')
  const searchResults = document.getElementById('search-results')
  const searchCloseBtn = document.querySelector('[data-close-search]')
  const copyTimers = new WeakMap()

  const copyTextToClipboard = async text => {
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

  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const tabBtn = target.closest('.p-tab')
    if (tabBtn) {
      const paperCode = tabBtn.closest('.paper-code')
      const tabIndex = tabBtn.getAttribute('data-tab')
      if (paperCode && tabIndex !== null) {
        const tabs = paperCode.querySelectorAll('.p-tab')
        for (const tab of tabs) {
          const isSelected = tab.getAttribute('data-tab') === tabIndex
          tab.classList.toggle('is-active', isSelected)
          tab.setAttribute('aria-selected', isSelected ? 'true' : 'false')
        }
        const panels = paperCode.querySelectorAll('.p-pre')
        for (const panel of panels) {
          panel.classList.toggle('is-active', panel.getAttribute('data-panel') === tabIndex)
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

  const syncThemeToggle = () => {
    if (!themeToggle) {
      return
    }
    const current = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light'
    const lightLabel = themeToggle.getAttribute('data-light-label') || 'Light'
    const darkLabel = themeToggle.getAttribute('data-dark-label') || 'Dark'
    const nextLabel = current === 'dark' ? lightLabel : darkLabel
    themeToggle.setAttribute('title', nextLabel)
    themeToggle.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false')
  }

  syncThemeToggle()

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextMode = root.getAttribute('data-mode') === 'dark' ? 'light' : 'dark'
      root.setAttribute('data-mode', nextMode)
      try {
        localStorage.setItem('dn-ioc-theme', nextMode)
      } catch (_err) {
        // Ignore storage write errors in restricted browsing contexts
      }
      syncThemeToggle()
    })
  }

  const setContentsOpen = open => {
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

  const escapeHtml = text =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const foldWithOffsets = text => {
    let folded = ''
    const offsets = []
    let idx = 0
    for (const ch of text) {
      const piece = ch
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
        .toLowerCase()
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

  const foldQuery = query =>
    query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .toLowerCase()
      .trim()

  const highlightText = (text, terms) => {
    if (terms.length === 0 || !text) {
      return escapeHtml(text)
    }
    const { folded, offsets } = foldWithOffsets(text)
    const ranges = []
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
          ranges.push([startPair[0], endPair[1]])
        }
        from = hit + Math.max(1, term.length)
      }
    }
    if (ranges.length === 0) {
      return escapeHtml(text)
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
    const merged = [ranges[0]]
    for (let i = 1; i < ranges.length; i++) {
      const prev = merged[merged.length - 1]
      const curr = ranges[i]
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

  let searchIndexPromise = null
  let currentMatches = []
  let selectedMatchIdx = 0

  const loadSearchIndex = () => {
    if (searchIndexPromise) {
      return searchIndexPromise
    }
    const url = searchModal ? searchModal.getAttribute('data-search-url') : null
    if (!url) {
      searchIndexPromise = Promise.resolve([])
      return searchIndexPromise
    }
    searchIndexPromise = fetch(url)
      .then(res => (res.ok ? res.json() : []))
      .then(items =>
        Array.isArray(items)
          ? items.map(item => ({
              title: String(item.title || ''),
              chapterTitle: String(item.chapterTitle || ''),
              href: String(item.href || '/'),
              excerpt: String(item.excerpt || ''),
              foldedTitle: foldQuery(String(item.title || '')),
              foldedChapter: foldQuery(String(item.chapterTitle || '')),
              foldedExcerpt: foldQuery(String(item.excerpt || '')),
            }))
          : [],
      )
      .catch(() => [])
    return searchIndexPromise
  }

  const updateSelectedResult = nextIdx => {
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

  const renderSearchResults = async rawQuery => {
    if (!searchResults || !searchModal) {
      return
    }
    const items = await loadSearchIndex()
    const normalized = foldQuery(rawQuery)
    const terms = normalized ? normalized.split(/\s+/).filter(Boolean) : []

    if (terms.length === 0) {
      currentMatches = items.slice(0, 10)
    } else {
      const scored = []
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

  const closeSearch = () => {
    if (searchModal instanceof HTMLDialogElement && searchModal.open) {
      searchModal.close()
    }
  }

  const openSearch = () => {
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
      renderSearchResults(searchInput.value)
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
      renderSearchResults(searchInput.value)
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
        setContentsOpen(false)
      }
      if (langMenu?.hasAttribute('open')) {
        langMenu.removeAttribute('open')
      }
      return
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
