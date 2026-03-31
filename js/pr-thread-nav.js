// Thread and hunk jump navigation for ado-pr-threads.html

function scrollToThread(threadId) {
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByThreadId(threadId);
        if (!row) return;
        // Uncollapse if needed
        if (row.collapsed) {
            row.collapsed = false;
            row.measuredHeight = null;
            // Only this row's height is invalidated; don't call invalidateHeights()
            // which would clear all threads and cause estimate-based clipping.
            currentDiffScroller.recalcLayout();
        }
        currentDiffScroller.scrollToRow(row, { block: 'center', behavior: 'smooth' });
        // Update DOM state after scroll renders the element
        setTimeout(() => {
            const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
            if (threadEl) {
                threadEl.classList.remove('collapsed');
                // Measure actual height after expanding and update layout so
                // the scroller knows the real size (estimate may be wrong).
                const row = currentDiffScroller.getRowByThreadId(threadId);
                if (row) {
                    const actualH = threadEl.getBoundingClientRect().height;
                    if (actualH > 0 && actualH !== row.measuredHeight) {
                        row.measuredHeight = actualH;
                        currentDiffScroller.recalcLayout();
                        // recalcLayout re-targets the smooth scroll if still in progress.
                        // If it already settled, snap to the corrected position instantly.
                        if (!currentDiffScroller.hasPendingScrollTarget()) {
                            currentDiffScroller.scrollToRow(row, { block: 'center' });
                        }
                    }
                }
                // Update gutter avatar
                const avatarEl = document.querySelector(`.diff-gutter-avatar[data-thread-id="${threadId}"]`);
                if (avatarEl) {
                    avatarEl.style.display = 'none';
                    const stack = avatarEl.closest('.diff-gutter-stack');
                    if (stack) updateGutterStack(stack);
                }
                clearThreadFocus();
                threadEl.classList.add('focused');
                threadEl.addEventListener('animationend', () => threadEl.classList.remove('focused'), { once: true });
            }
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            stickyLinesInvalidate?.();
        }, 50);
    } else {
        const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
        if (!threadEl) return;
        if (threadEl.classList.contains('collapsed')) {
            threadEl.classList.remove('collapsed');
            const avatarEl = document.querySelector(`.diff-gutter-avatar[data-thread-id="${threadId}"]`);
            if (avatarEl) {
                avatarEl.style.display = 'none';
                const stack = avatarEl.closest('.diff-gutter-stack');
                if (stack) updateGutterStack(stack);
            }
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            stickyLinesInvalidate?.();
        }
        threadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearThreadFocus();
        threadEl.classList.add('focused');
        threadEl.addEventListener('animationend', () => threadEl.classList.remove('focused'), { once: true });
    }

    // Highlight corresponding file tree entry
    const treeEntry = document.querySelector(`.file-tree-thread[data-thread-id="${threadId}"]`);
    if (treeEntry) {
        const threadList = treeEntry.closest('.file-tree-threads');
        if (threadList && threadList.classList.contains('collapsed')) {
            threadList.classList.remove('collapsed');
            const badge = threadList.previousElementSibling?.querySelector('.file-thread-count');
            if (badge) badge.classList.add('expanded');
        }
        treeEntry.classList.add('focused');
        treeEntry.addEventListener('animationend', () => treeEntry.classList.remove('focused'), { once: true });
    }
}

function clearThreadFocus() {
    document.querySelectorAll('.inline-thread.focused, .file-tree-thread.focused').forEach(el => el.classList.remove('focused'));
}

function saveDiffScroll() {
    const area = document.querySelector('#fileDiffPanel .diff-scroll-area');
    return area ? area.scrollTop : 0;
}

function restoreDiffScroll(saved) {
    if (!saved && saved !== 0) return;
    const area = document.querySelector('#fileDiffPanel .diff-scroll-area');
    if (area) area.scrollTop = saved;
}

// Thread jump navigation — sorted thread IDs for the current file
let currentFileThreadIds = [];
let currentThreadNavIndex = -1;

function sortThreadsByPosition(threads) {
    if (!threads || threads.length === 0) return [];
    return [...threads]
        .filter(t => !t.isDeleted && t.threadContext)
        .sort((a, b) => {
            const lineA = a.threadContext?.rightFileStart?.line || a.threadContext?.leftFileStart?.line || 0;
            const lineB = b.threadContext?.rightFileStart?.line || b.threadContext?.leftFileStart?.line || 0;
            if (lineA !== lineB) return lineA - lineB;
            const offsetA = a.threadContext?.rightFileStart?.offset || a.threadContext?.leftFileStart?.offset || 0;
            const offsetB = b.threadContext?.rightFileStart?.offset || b.threadContext?.leftFileStart?.offset || 0;
            return offsetA - offsetB;
        })
        .map(t => t.id);
}

function getSortedFileThreadIds() {
    if (!selectedFilePath) return [];
    return sortThreadsByPosition(threadsByFilePath.get(selectedFilePath));
}

function updateThreadNav(jumpedToId) {
    currentFileThreadIds = getSortedFileThreadIds();
    const nav = document.getElementById('threadNav');
    const collapseBar = document.getElementById('threadCollapseAllBar');
    if (!nav) return;
    if (currentFileThreadIds.length === 0) {
        nav.style.display = 'none';
        if (collapseBar) collapseBar.style.display = 'none';
        return;
    }
    nav.style.display = 'flex';
    if (collapseBar) collapseBar.style.display = '';
    if (jumpedToId !== undefined) {
        currentThreadNavIndex = currentFileThreadIds.indexOf(jumpedToId);
    }
    const label = document.getElementById('threadNavLabel');
    const prevBtn = document.getElementById('threadNavPrev');
    const nextBtn = document.getElementById('threadNavNext');
    if (label) label.textContent = currentThreadNavIndex >= 0
        ? `${currentThreadNavIndex + 1}/${currentFileThreadIds.length}`
        : `${currentFileThreadIds.length} threads`;
    if (prevBtn) prevBtn.disabled = currentThreadNavIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentThreadNavIndex >= currentFileThreadIds.length - 1;
}

function jumpToNextThread() {
    if (currentFileThreadIds.length === 0) return;
    const nextIndex = currentThreadNavIndex < 0 ? 0 : Math.min(currentThreadNavIndex + 1, currentFileThreadIds.length - 1);
    currentThreadNavIndex = nextIndex;
    scrollToThread(currentFileThreadIds[nextIndex]);
    updateThreadNav(currentFileThreadIds[nextIndex]);
}

function jumpToPrevThread() {
    if (currentFileThreadIds.length === 0) return;
    const prevIndex = currentThreadNavIndex < 0 ? 0 : Math.max(currentThreadNavIndex - 1, 0);
    currentThreadNavIndex = prevIndex;
    scrollToThread(currentFileThreadIds[prevIndex]);
    updateThreadNav(currentFileThreadIds[prevIndex]);
}

// Hunk (modification) jump navigation
let currentHunkIndex = -1;

function getHunkCount() {
    if (currentDiffScroller) return currentDiffScroller.getHunkCount();
    return document.querySelectorAll('#fileDiffPanel [data-hunk]').length;
}

function updateHunkNav(index) {
    const nav = document.getElementById('hunkNav');
    if (!nav) return;
    const count = getHunkCount();
    if (count === 0) { nav.style.display = 'none'; return; }
    nav.style.display = 'flex';
    currentHunkIndex = index ?? -1;
    const label = document.getElementById('hunkNavLabel');
    const prevBtn = document.getElementById('hunkNavPrev');
    const nextBtn = document.getElementById('hunkNavNext');
    if (label) label.textContent = currentHunkIndex >= 0
        ? `${currentHunkIndex + 1}/${count}`
        : `${count} changes`;
    if (prevBtn) prevBtn.disabled = currentHunkIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentHunkIndex >= count - 1;
}

function scrollToHunk(index) {
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByHunkIndex(index);
        if (row) currentDiffScroller.scrollToRow(row, { block: 'center', behavior: 'smooth' });
        return;
    }
    const hunks = document.querySelectorAll('#fileDiffPanel [data-hunk]');
    if (index < 0 || index >= hunks.length) return;
    hunks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function jumpToNextHunk() {
    const count = getHunkCount();
    if (count === 0) return;
    const nextIndex = currentHunkIndex < 0 ? 0 : Math.min(currentHunkIndex + 1, count - 1);
    currentHunkIndex = nextIndex;
    scrollToHunk(nextIndex);
    updateHunkNav(nextIndex);
}

function jumpToPrevHunk() {
    const count = getHunkCount();
    if (count === 0) return;
    const prevIndex = currentHunkIndex < 0 ? 0 : Math.max(currentHunkIndex - 1, 0);
    currentHunkIndex = prevIndex;
    scrollToHunk(prevIndex);
    updateHunkNav(prevIndex);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sortThreadsByPosition };
}
