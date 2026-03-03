// File diff search (Ctrl+F) and go-to-line (Ctrl+G) for ado-pr-threads.html

// --- File search (Ctrl+F) ---

let _fileSearchDebounceTimer = null;

function fileSearchInputChanged() {
    clearTimeout(_fileSearchDebounceTimer);
    _fileSearchDebounceTimer = setTimeout(runFileSearch, 150);
}

function openFileSearch() {
    fileSearchActive = true;
    const widget = document.getElementById('fileSearchWidget');
    if (!widget) return;
    widget.style.display = 'flex';
    // Restore option button states
    document.getElementById('fileSearchCaseBtn')?.classList.toggle('active', fileSearchCaseSensitive);
    document.getElementById('fileSearchWordBtn')?.classList.toggle('active', fileSearchWholeWord);
    const input = document.getElementById('fileSearchInput');
    if (!input) return;
    // Pre-fill with selection if no existing query
    if (!fileSearchQuery) {
        const sel = window.getSelection()?.toString().trim();
        if (sel && !sel.includes('\n')) fileSearchQuery = sel;
    }
    input.value = fileSearchQuery;
    input.focus();
    input.select();
    if (fileSearchQuery) runFileSearch();
}

function closeFileSearch() {
    fileSearchActive = false;
    const widget = document.getElementById('fileSearchWidget');
    if (widget) widget.style.display = 'none';
    clearFileSearchHighlights();
    fileSearchResults = [];
    fileSearchDataResults = [];
    fileSearchIndex = -1;
    fileSearchQuery = '';
    fileSearchHitLineIndices = [];
    currentDiffScroller?.setSearchHighlights(null);
    diffMinimapDraw?.();
}

function toggleFileSearchCase() {
    fileSearchCaseSensitive = !fileSearchCaseSensitive;
    document.getElementById('fileSearchCaseBtn')?.classList.toggle('active', fileSearchCaseSensitive);
    runFileSearch();
}

function toggleFileSearchWord() {
    fileSearchWholeWord = !fileSearchWholeWord;
    document.getElementById('fileSearchWordBtn')?.classList.toggle('active', fileSearchWholeWord);
    runFileSearch();
}

function clearFileSearchHighlights() {
    for (const mark of document.querySelectorAll('mark.search-highlight')) {
        const parent = mark.parentNode;
        if (!parent) continue;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    }
}

// Data-model search results (used when scroller is active)
let fileSearchDataResults = []; // [{codeRowIdx, rowIndex, offsets: [{start,end}]}]

function runFileSearch() {
    clearFileSearchHighlights();
    fileSearchResults = [];
    fileSearchHitLineIndices = [];
    fileSearchDataResults = [];

    const input = document.getElementById('fileSearchInput');
    fileSearchQuery = input?.value || '';

    if (!fileSearchQuery) {
        updateFileSearchCount();
        diffMinimapDraw?.();
        return;
    }

    let flags = fileSearchCaseSensitive ? 'g' : 'gi';
    let pattern = fileSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (fileSearchWholeWord) pattern = `\\b${pattern}\\b`;
    let regex;
    try { regex = new RegExp(pattern, flags); } catch { updateFileSearchCount(); return; }

    if (currentDiffScroller) {
        runFileSearchWithScroller(regex);
    } else {
        runFileSearchLegacy(regex);
    }

    fileSearchIndex = (fileSearchDataResults.length > 0 || fileSearchResults.length > 0) ? 0 : -1;
    updateFileSearchHighlightCurrent();
    updateFileSearchCount();
    scrollToCurrentSearchResult();
    diffMinimapDraw?.();
}

function runFileSearchWithScroller(regex) {
    const codeRows = currentDiffScroller.getCodeRows();
    let totalMatches = 0;

    for (let codeIdx = 0; codeIdx < codeRows.length; codeIdx++) {
        const row = codeRows[codeIdx];
        const text = currentDiffScroller.getRowTextContent(row);
        if (!text) continue;

        regex.lastIndex = 0;
        let match;
        const offsets = [];
        while ((match = regex.exec(text)) !== null) {
            offsets.push({ start: match.index, end: match.index + match[0].length });
            fileSearchHitLineIndices.push({ visibleIdx: codeIdx, markIdx: totalMatches });
            totalMatches++;
            if (match[0].length === 0) { regex.lastIndex++; break; }
        }

        if (offsets.length > 0) {
            fileSearchDataResults.push({ codeRowIdx: codeIdx, rowIndex: row.index, offsets });
        }
    }

    // Build search highlight map for scroller (applied at render time)
    const highlightMap = new Map();
    for (const dr of fileSearchDataResults) {
        highlightMap.set(dr.rowIndex, dr.offsets);
    }
    currentDiffScroller.setSearchHighlights(highlightMap, regex);
}

function runFileSearchLegacy(regex) {
    const diffPanel = document.getElementById('fileDiffPanel');
    if (!diffPanel) return;
    const diffContainer = diffPanel.querySelector('.diff-lines');
    if (!diffContainer) return;

    const visibleRows = [];
    const visibleRowIdx = new Map();
    for (const c of diffContainer.children) {
        if (!c.classList.contains('inline-thread') &&
            !c.classList.contains('sbs-thread-row') &&
            !c.classList.contains('diff-hunk-separator')) {
            visibleRowIdx.set(c, visibleRows.length);
            visibleRows.push(c);
        }
    }

    for (const cell of diffContainer.querySelectorAll('.diff-content')) {
        const rowEl = cell.closest('.diff-line, .sbs-row');
        const visibleIdx = rowEl ? (visibleRowIdx.get(rowEl) ?? -1) : -1;

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        for (const textNode of textNodes) {
            const text = textNode.textContent;
            const parts = [];
            let lastIndex = 0;
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex)
                    parts.push(document.createTextNode(text.slice(lastIndex, match.index)));
                const mark = document.createElement('mark');
                mark.className = 'search-highlight';
                mark.textContent = match[0];
                parts.push(mark);
                fileSearchResults.push(mark);
                if (visibleIdx >= 0)
                    fileSearchHitLineIndices.push({ visibleIdx, markIdx: fileSearchResults.length - 1 });
                lastIndex = match.index + match[0].length;
                if (match[0].length === 0) { regex.lastIndex++; break; }
            }
            if (parts.length > 0) {
                if (lastIndex < text.length)
                    parts.push(document.createTextNode(text.slice(lastIndex)));
                const parent = textNode.parentNode;
                for (const part of parts) parent.insertBefore(part, textNode);
                parent.removeChild(textNode);
            }
        }
    }
}

function getFileSearchTotalCount() {
    // Data-model path stores matches in fileSearchHitLineIndices, legacy in fileSearchResults
    return currentDiffScroller ? fileSearchHitLineIndices.length : fileSearchResults.length;
}

function updateFileSearchHighlightCurrent() {
    if (currentDiffScroller) {
        // Scroller handles highlight rendering; we just need to re-render
        // to update the "current" marker
        return;
    }
    for (let i = 0; i < fileSearchResults.length; i++)
        fileSearchResults[i].classList.toggle('current', i === fileSearchIndex);
}

function updateFileSearchCount() {
    const el = document.getElementById('fileSearchCount');
    if (!el) return;
    const prevBtn = document.getElementById('fileSearchPrevBtn');
    const nextBtn = document.getElementById('fileSearchNextBtn');
    const total = getFileSearchTotalCount();
    const hasResults = total > 0;
    if (!fileSearchQuery) el.textContent = '';
    else if (!hasResults) el.textContent = 'No results';
    else el.textContent = `${fileSearchIndex + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = !hasResults;
    if (nextBtn) nextBtn.disabled = !hasResults;
}

function navigateFileSearch(delta) {
    const total = getFileSearchTotalCount();
    if (total === 0) return;
    fileSearchIndex = (fileSearchIndex + delta + total) % total;
    updateFileSearchHighlightCurrent();
    updateFileSearchCount();
    scrollToCurrentSearchResult();
    diffMinimapDraw?.();
}

function scrollToCurrentSearchResult() {
    const total = getFileSearchTotalCount();
    if (fileSearchIndex < 0 || fileSearchIndex >= total) return;

    if (currentDiffScroller) {
        // Find which data result contains this match index
        let matchCounter = 0;
        for (const dr of fileSearchDataResults) {
            for (const offset of dr.offsets) {
                if (matchCounter === fileSearchIndex) {
                    const codeRows = currentDiffScroller.getCodeRows();
                    const row = codeRows[dr.codeRowIdx];
                    if (row) {
                        currentDiffScroller.scrollToRow(row, { block: 'center', behavior: 'smooth' });
                    }
                    return;
                }
                matchCounter++;
            }
        }
        return;
    }

    // Legacy path
    const mark = fileSearchResults[fileSearchIndex];
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // In SBS mode, horizontal scroll is handled via custom scrollbar (transforms),
    // not native scrollLeft — scrollIntoView can't reach it, so we apply it manually.
    if (sbsScrollSync) {
        const { applyScroll, scrollRange, getCurrentOffset } = sbsScrollSync;
        const pane = mark.closest('.sbs-left, .sbs-right');
        if (pane) {
            const markRect = mark.getBoundingClientRect();
            const paneRect = pane.getBoundingClientRect();
            const markLeft = markRect.left - paneRect.left + getCurrentOffset();
            const desiredOffset = markLeft - pane.clientWidth / 2 + markRect.width / 2;
            const clampedOffset = Math.max(0, Math.min(scrollRange, desiredOffset));
            applyScroll(scrollRange > 0 ? clampedOffset / scrollRange : 0);
        }
    }
}

// --- Go-to-line (Ctrl+G) ---

function openGoToLine() {
    const widget = document.getElementById('gotoLineWidget');
    if (!widget) return;
    const btn = document.getElementById('gotoLineSideBtn');
    if (btn) btn.textContent = goToLineSide === 'new' ? 'New' : 'Old';
    widget.style.display = 'flex';
    const input = document.getElementById('gotoLineInput');
    if (input) { input.focus(); input.select(); }
}

function closeGoToLine() {
    const widget = document.getElementById('gotoLineWidget');
    if (widget) widget.style.display = 'none';
}

function toggleGoToLineSide() {
    goToLineSide = goToLineSide === 'new' ? 'old' : 'new';
    const btn = document.getElementById('gotoLineSideBtn');
    if (btn) btn.textContent = goToLineSide === 'new' ? 'New' : 'Old';
    document.getElementById('gotoLineInput')?.focus();
}

function goToLine(lineNum, side) {
    if (!lineNum || lineNum < 1) return;

    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByLineNum(lineNum, side);
        if (!row) return;
        currentDiffScroller.scrollToRow(row, { block: 'center', behavior: 'smooth' });
        // Flash the rendered element after scroll
        setTimeout(() => {
            const el = currentDiffScroller.getRenderedElement(row);
            if (el) {
                el.classList.remove('goto-line-flash');
                void el.offsetWidth;
                el.classList.add('goto-line-flash');
                el.addEventListener('animationend', () => el.classList.remove('goto-line-flash'), { once: true });
            }
        }, 50);
        return;
    }

    // Legacy DOM path
    const diffPanel = document.getElementById('fileDiffPanel');
    if (!diffPanel) return;
    const effectiveMode = getEffectiveDisplayMode();
    let targetEl = null;

    if (effectiveMode === 'side-by-side') {
        const paneSelector = side === 'old' ? '.sbs-left' : '.sbs-right';
        for (const row of diffPanel.querySelectorAll('.sbs-row')) {
            const numEl = row.querySelector(`${paneSelector} .diff-line-number`);
            if (numEl?.textContent.trim() === String(lineNum)) { targetEl = row; break; }
        }
    } else {
        for (const row of diffPanel.querySelectorAll('.diff-line')) {
            const spans = row.querySelectorAll('.diff-line-number');
            if (spans.length < 2) continue;
            const span = side === 'old' ? spans[0] : spans[1];
            if (span.textContent.trim() === String(lineNum)) { targetEl = row; break; }
        }
    }

    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.remove('goto-line-flash');
    void targetEl.offsetWidth;
    targetEl.classList.add('goto-line-flash');
    targetEl.addEventListener('animationend', () => targetEl.classList.remove('goto-line-flash'), { once: true });
}
