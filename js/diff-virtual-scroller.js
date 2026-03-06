/**
 * Virtual Scroller for Diff View
 *
 * Only renders visible rows + a buffer to avoid DOM bloat for large files.
 * Works with both inline and side-by-side diff modes.
 *
 * IIFE exposing window.DiffVirtualScroller (matching project convention).
 */
const DiffVirtualScroller = (() => {
    // Small file threshold — below this, render all rows without position:absolute
    const SMALL_FILE_THRESHOLD = 500;
    // Overscan: render this many extra pixels above/below viewport
    const OVERSCAN_PX = 1500;
    // Default code row height (monospace, line-height: 1.5, no wrapping)
    const DEFAULT_CODE_HEIGHT = 19; // will be measured once at mount time
    // Collapsed threads use display:none so they take no space in the layout
    const COLLAPSED_THREAD_HEIGHT = 0;
    // Estimate per-comment height for expanded threads
    const PER_COMMENT_HEIGHT = 60;
    const THREAD_BASE_HEIGHT = 40;
    // Hunk separator height
    const HUNK_SEPARATOR_HEIGHT = 0; // hunk separators are not used in file view currently

    /**
     * Build a flat array of virtual row descriptors from diff + thread data.
     *
     * For inline mode: mirrors renderDiffLines logic.
     * For SBS mode: mirrors renderDiffLinesSideBySide logic.
     *
     * @param {Array} diff - Array of {type, content} from HistogramDiff
     * @param {Array} threadRanges - Thread range objects from DiffUtils.buildThreadRange
     * @param {object} options
     * @param {Function} options.getLinePrefix - (newLineNum, oldLineNum) => html
     * @param {Function} options.renderInlineThread - (thread, appliesToView) => html
     * @param {string} options.mode - 'inline' | 'side-by-side'
     * @param {number} options.startOldLine
     * @param {number} options.startNewLine
     * @returns {object} { rows, lineNumMapRight, lineNumMapLeft, hunkStarts, threadIdMap }
     */
    function buildVirtualRows(diff, threadRanges, options = {}) {
        const mode = options.mode || 'inline';
        if (mode === 'side-by-side') {
            return buildVirtualRowsSbs(diff, threadRanges, options);
        }
        return buildVirtualRowsInline(diff, threadRanges, options);
    }

    function buildVirtualRowsInline(diff, threadRanges, options) {
        const startOld = options.startOldLine ?? 1;
        const startNew = options.startNewLine ?? 1;
        const getLinePrefix = options.getLinePrefix || null;
        const renderInlineThread = options.renderInlineThread || (() => '');
        const isAddedFile = options.isAddedFile || false;
        const isDeletedFile = options.isDeletedFile || false;

        const rows = [];
        // Clone thread ranges so we can mark insertion without mutating originals
        const trClones = threadRanges.map(tr => ({ ...tr, inserted: false }));

        let oldLineNum = startOld;
        let newLineNum = startNew;
        let hunkIndex = 0;
        let inChange = false;

        // Insert file-level threads (startLine === 0 && endLine === 0) at the top
        for (const tr of trClones) {
            if (tr.startLine === 0 && tr.endLine === 0) {
                tr.inserted = true;
                rows.push({
                    type: 'thread',
                    threadId: tr.thread.id,
                    threadHtml: renderInlineThread(tr.thread, tr.appliesToView),
                    collapsed: isThreadCollapsedByDefault(tr),
                    commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
                });
            }
        }

        for (const entry of diff) {
            let curOld = null, curNew = null;
            let cssClass, minimapColor, hunkIdx = null;

            if (entry.type === 'unchanged') {
                inChange = false;
                curOld = oldLineNum;
                curNew = newLineNum;
                cssClass = 'diff-unchanged';
                minimapColor = null;
                oldLineNum++;
                newLineNum++;
            } else if (entry.type === 'removed') {
                if (!inChange) { hunkIdx = hunkIndex++; inChange = true; }
                curOld = oldLineNum;
                cssClass = isDeletedFile ? 'diff-unchanged' : 'diff-removed';
                minimapColor = isDeletedFile ? null : '#f85149';
                oldLineNum++;
            } else if (entry.type === 'added') {
                if (!inChange) { hunkIdx = hunkIndex++; inChange = true; }
                curNew = newLineNum;
                cssClass = isAddedFile ? 'diff-unchanged' : 'diff-added';
                minimapColor = isAddedFile ? null : '#3fb950';
                newLineNum++;
            }

            const prefixHtml = getLinePrefix ? getLinePrefix(curNew, curOld) : '';

            rows.push({
                type: 'code',
                diffEntry: entry,
                oldLineNum: curOld,
                newLineNum: curNew,
                cssClass,
                minimapColor,
                hunkIndex: hunkIdx,
                prefixHtml,
            });

            // Check for thread suffixes after this line
            appendThreadSuffixesInline(rows, trClones, curNew, curOld, renderInlineThread);
        }

        // Remaining threads beyond end of file
        for (const tr of trClones) {
            if (!tr.inserted) {
                rows.push({
                    type: 'thread',
                    threadId: tr.thread.id,
                    threadHtml: renderInlineThread(tr.thread, tr.appliesToView),
                    collapsed: isThreadCollapsedByDefault(tr),
                    commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
                });
            }
        }

        return buildResult(rows);
    }

    function appendThreadSuffixesInline(rows, trClones, curNew, curOld, renderInlineThread) {
        for (const tr of trClones) {
            if (tr.inserted) continue;
            const lineNum = tr.useRight ? curNew : curOld;
            if (lineNum != null && lineNum >= tr.endLine) {
                tr.inserted = true;
                rows.push({
                    type: 'thread',
                    threadId: tr.thread.id,
                    threadHtml: renderInlineThread(tr.thread, tr.appliesToView),
                    collapsed: isThreadCollapsedByDefault(tr),
                    commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
                });
            }
        }
    }

    function buildVirtualRowsSbs(diff, threadRanges, options) {
        const startOld = options.startOldLine ?? 1;
        const startNew = options.startNewLine ?? 1;
        const getLinePrefix = options.getLinePrefix || null;
        const renderInlineThread = options.renderInlineThread || (() => '');
        const isAddedFile = options.isAddedFile || false;
        const isDeletedFile = options.isDeletedFile || false;

        const rows = [];
        const trClones = threadRanges.map(tr => ({ ...tr, inserted: false }));

        let oldLineNum = startOld;
        let newLineNum = startNew;
        let i = 0;
        let hunkIndex = 0;

        // File-level threads
        for (const tr of trClones) {
            if (tr.startLine === 0 && tr.endLine === 0) {
                tr.inserted = true;
                rows.push({
                    type: 'sbs-thread',
                    threadId: tr.thread.id,
                    leftHtml: tr.useRight ? '' : renderInlineThread(tr.thread, tr.appliesToView),
                    rightHtml: tr.useRight ? renderInlineThread(tr.thread, tr.appliesToView) : '',
                    collapsed: isThreadCollapsedByDefault(tr),
                    commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
                });
            }
        }

        while (i < diff.length) {
            const entry = diff[i];

            if (entry.type === 'unchanged') {
                const leftPrefix = getLinePrefix ? getLinePrefix(null, oldLineNum) : '';
                const rightPrefix = getLinePrefix ? getLinePrefix(newLineNum, null) : '';

                rows.push({
                    type: 'code',
                    diffEntry: entry,
                    oldLineNum: oldLineNum,
                    newLineNum: newLineNum,
                    cssClass: 'diff-unchanged',
                    minimapColor: null,
                    hunkIndex: null,
                    prefixHtml: '',  // not used in SBS
                    sbsMode: true,
                    sbsLeft: isAddedFile ? { lineNum: null, content: '', cssClass: 'sbs-gone', prefixHtml: '' } : { lineNum: oldLineNum, content: entry.content, cssClass: '', prefixHtml: leftPrefix },
                    sbsRight: isDeletedFile ? { lineNum: null, content: '', cssClass: 'sbs-gone', prefixHtml: '' } : { lineNum: newLineNum, content: entry.content, cssClass: '', prefixHtml: rightPrefix },
                });

                appendThreadSuffixesSbs(rows, trClones, newLineNum, oldLineNum, renderInlineThread);
                oldLineNum++;
                newLineNum++;
                i++;
            } else {
                // Collect consecutive removed then added
                const removed = [];
                while (i < diff.length && diff[i].type === 'removed') {
                    removed.push(diff[i]);
                    i++;
                }
                const added = [];
                while (i < diff.length && diff[i].type === 'added') {
                    added.push(diff[i]);
                    i++;
                }

                const maxLen = Math.max(removed.length, added.length);
                for (let j = 0; j < maxLen; j++) {
                    let sbsLeft, sbsRight;
                    let curOld = null, curNew = null;
                    let minimapColor = null;

                    if (j < removed.length) {
                        curOld = oldLineNum;
                        const leftPrefix = getLinePrefix ? getLinePrefix(null, oldLineNum) : '';
                        sbsLeft = { lineNum: oldLineNum, content: removed[j].content, cssClass: isDeletedFile ? '' : 'diff-removed', prefixHtml: leftPrefix, charDiff: removed[j].charDiff || null };
                        oldLineNum++;
                    } else {
                        sbsLeft = { lineNum: null, content: '', cssClass: isAddedFile ? 'sbs-gone' : 'sbs-empty', prefixHtml: '', charDiff: null };
                    }

                    if (j < added.length) {
                        curNew = newLineNum;
                        const rightPrefix = getLinePrefix ? getLinePrefix(newLineNum, null) : '';
                        sbsRight = { lineNum: newLineNum, content: added[j].content, cssClass: isAddedFile ? '' : 'diff-added', prefixHtml: rightPrefix, charDiff: added[j].charDiff || null };
                        newLineNum++;
                    } else {
                        sbsRight = { lineNum: null, content: '', cssClass: isDeletedFile ? 'sbs-gone' : 'sbs-empty', prefixHtml: '', charDiff: null };
                    }

                    // Minimap color
                    if (sbsLeft.cssClass === 'diff-removed' && sbsRight.cssClass === 'diff-added') {
                        minimapColor = '#e3b341'; // modified — amber
                    } else if (sbsLeft.cssClass === 'diff-removed') {
                        minimapColor = '#f85149';
                    } else if (sbsRight.cssClass === 'diff-added') {
                        minimapColor = '#3fb950';
                    }

                    rows.push({
                        type: 'code',
                        diffEntry: j < removed.length ? removed[j] : (j < added.length ? added[j] : null),
                        oldLineNum: curOld,
                        newLineNum: curNew,
                        cssClass: 'sbs-row',
                        minimapColor,
                        hunkIndex: j === 0 ? hunkIndex : null,
                        prefixHtml: '',
                        sbsMode: true,
                        sbsLeft,
                        sbsRight,
                    });

                    appendThreadSuffixesSbs(rows, trClones, curNew, curOld, renderInlineThread);
                }
                hunkIndex++;
            }
        }

        // Remaining threads
        for (const tr of trClones) {
            if (tr.inserted) continue;
            const threadHtml = renderInlineThread(tr.thread, tr.appliesToView);
            rows.push({
                type: 'sbs-thread',
                threadId: tr.thread.id,
                leftHtml: tr.useRight ? '' : threadHtml,
                rightHtml: tr.useRight ? threadHtml : '',
                collapsed: isThreadCollapsedByDefault(tr),
                commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
            });
        }

        return buildResult(rows);
    }

    function appendThreadSuffixesSbs(rows, trClones, curNew, curOld, renderInlineThread) {
        // Collect left and right thread htmls, then pair into sbs-thread rows
        const leftThreads = [];
        const rightThreads = [];
        for (const tr of trClones) {
            if (tr.inserted) continue;
            const lineNum = tr.useRight ? curNew : curOld;
            if (lineNum != null && lineNum >= tr.endLine) {
                tr.inserted = true;
                const threadHtml = renderInlineThread(tr.thread, tr.appliesToView);
                if (tr.useRight) rightThreads.push({ tr, html: threadHtml });
                else leftThreads.push({ tr, html: threadHtml });
            }
        }

        const maxLen = Math.max(leftThreads.length, rightThreads.length);
        for (let j = 0; j < maxLen; j++) {
            const left = j < leftThreads.length ? leftThreads[j] : null;
            const right = j < rightThreads.length ? rightThreads[j] : null;
            const tr = left?.tr || right?.tr;
            rows.push({
                type: 'sbs-thread',
                threadId: (left?.tr || right?.tr).thread.id,
                leftHtml: left ? left.html : '',
                rightHtml: right ? right.html : '',
                collapsed: isThreadCollapsedByDefault(tr),
                commentCount: tr.thread.comments?.filter(c => c.commentType !== 'system' && c.commentType !== 3 && !c.isDeleted).length || 1,
            });
        }
    }

    function isThreadCollapsedByDefault(tr) {
        const status = tr.thread.status;
        return (status === 'fixed' || status === 'closed' || status === 'wontFix') || !tr.appliesToView;
    }

    function buildResult(rows) {
        // Assign indices and build lookup maps
        const lineNumMapRight = new Map(); // newLineNum -> rowIndex
        const lineNumMapLeft = new Map();  // oldLineNum -> rowIndex
        const hunkStarts = [];             // rowIndex[] of first row per hunk
        const threadIdMap = new Map();     // threadId -> rowIndex

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            row.index = i;
            if (row.type === 'code') {
                if (row.newLineNum != null) lineNumMapRight.set(row.newLineNum, i);
                if (row.oldLineNum != null) lineNumMapLeft.set(row.oldLineNum, i);
                if (row.hunkIndex != null) hunkStarts.push(i);
            } else if (row.type === 'thread' || row.type === 'sbs-thread') {
                threadIdMap.set(row.threadId, i);
            }
        }

        // Assign minimapColor to thread rows: inherit from the preceding code row when the
        // surrounding context is a contiguous zone of a single change type. This ensures that
        // expanded thread panels inside an all-added / all-removed / all-modified zone are
        // painted with that zone's color instead of appearing as unmodified space.
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.type !== 'thread' && row.type !== 'sbs-thread') continue;

            // Color of the code row this thread is attached to
            let precedingColor = null;
            for (let j = i - 1; j >= 0; j--) {
                if (rows[j].type === 'code') { precedingColor = rows[j].minimapColor; break; }
            }
            if (!precedingColor) continue;

            // Color of the next code row after this thread block
            let followingColor = undefined; // undefined = end of diff
            for (let j = i + 1; j < rows.length; j++) {
                if (rows[j].type === 'code') { followingColor = rows[j].minimapColor; break; }
            }

            // Apply only when the zone is contiguous and single-type:
            // following row is unchanged (null), end of diff (undefined), or same color.
            if (followingColor === undefined || followingColor === null || followingColor === precedingColor) {
                row.minimapColor = precedingColor;
            }
        }

        return { rows, lineNumMapRight, lineNumMapLeft, hunkStarts, threadIdMap };
    }

    /**
     * Estimate the height of a thread row.
     */
    function estimateThreadHeight(row, codeRowHeight) {
        if (row.collapsed) return COLLAPSED_THREAD_HEIGHT;
        return THREAD_BASE_HEIGHT + (row.commentCount || 1) * PER_COMMENT_HEIGHT;
    }

    /**
     * Compute layout: assign top/height to each row.
     *
     * extraFormAfterIndex / extraFormShift: when a comment form is spliced in
     * after a row, its height is added to the cumulative top so subsequent
     * rows are pushed down correctly. Pass -1 / 0 when no form is present.
     */
    function computeLayout(rows, codeRowHeight, extraFormAfterIndex = -1, extraFormShift = 0) {
        let top = 0;
        for (const row of rows) {
            row.top = top;
            if (row.type === 'code') {
                row.height = codeRowHeight;
            } else {
                // Thread row: use measured height if available, else estimate
                if (row.measuredHeight != null) {
                    row.height = row.measuredHeight;
                } else {
                    row.height = estimateThreadHeight(row, codeRowHeight);
                }
            }
            top += row.height;
            // If a comment form is spliced in after this row, reserve its height
            if (extraFormAfterIndex >= 0 && row.index === extraFormAfterIndex) {
                top += extraFormShift;
            }
        }
        return top; // total height
    }

    /**
     * Binary search for the first row whose bottom edge (top + height) > targetTop.
     */
    function findFirstVisibleRow(rows, targetTop) {
        let lo = 0, hi = rows.length - 1, result = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (rows[mid].top + rows[mid].height > targetTop) {
                result = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return result;
    }

    /**
     * Create a virtual scroller instance.
     */
    function create(options) {
        const {
            diff,
            threadRanges,
            mode,              // 'inline' | 'side-by-side'
            getLinePrefix,
            renderInlineThread,
            threadRangesRaw,   // original threadRanges for getHighlightedContent
            startOldLine,
            startNewLine,
            isAddedFile,
            isDeletedFile,
            isUnchangedFile,
        } = options;

        // Build the virtual row data model
        const built = buildVirtualRows(diff, threadRanges, {
            mode,
            getLinePrefix,
            renderInlineThread: renderInlineThread || (() => ''),
            startOldLine,
            startNewLine,
            isAddedFile,
            isDeletedFile,
        });

        const { rows, lineNumMapRight, lineNumMapLeft, hunkStarts, threadIdMap } = built;

        // State
        let _scrollArea = null;
        let _container = null;   // .diff-lines element
        let _codeRowHeight = DEFAULT_CODE_HEIGHT;
        let _totalHeight = 0;
        let _isSmallFile = rows.length < SMALL_FILE_THRESHOLD;
        let _renderedRange = { start: -1, end: -1 }; // indices currently in DOM
        let _renderedElements = new Map();  // rowIndex -> DOM element
        let _rafId = null;
        let _destroyed = false;
        let _rowRenderedCallbacks = [];
        let _searchHighlights = null;  // Map<rowIndex, [{start, end}]> or null
        let _searchRegex = null;       // RegExp for applying highlights to rendered elements
        let _currentSearchMatch = null; // {rowIndex, offsetIndex} or null
        let _pendingScrollTarget = null; // { row, block } set during smooth navigation; cleared on arrival
        let _mode = mode || 'inline';

        // Extra comment-form state (spliced between rows while editing)
        let _extraFormEl = null;
        let _extraFormAfterIndex = -1;
        let _extraFormShift = 0;
        let _extraFormObserver = null;  // ResizeObserver tracking form height changes

        /**
         * Create the HTML for a single inline code row.
         */
        function buildInlineCodeRowHtml(row) {
            const entry = row.diffEntry;
            const hunkAttr = row.hunkIndex != null ? ` data-hunk="${row.hunkIndex}"` : '';

            let contentHtml;
            if (entry.type === 'unchanged') {
                const r = DiffUtils.getHighlightedContent(entry.content, row.newLineNum, true, threadRangesRaw || []);
                if (!r.commented) {
                    const r2 = DiffUtils.getHighlightedContent(entry.content, row.oldLineNum, false, threadRangesRaw || []);
                    contentHtml = r2.html;
                } else {
                    contentHtml = r.html;
                }
            } else if (entry.type === 'removed') {
                ({ html: contentHtml } = DiffUtils.getHighlightedContent(entry.content, row.oldLineNum, false, threadRangesRaw || [], entry.charDiff || null));
            } else if (entry.type === 'added') {
                ({ html: contentHtml } = DiffUtils.getHighlightedContent(entry.content, row.newLineNum, true, threadRangesRaw || [], entry.charDiff || null));
            }

            const indicator = row.cssClass === 'diff-removed' ? '−' : (row.cssClass === 'diff-added' ? '+' : ' ');
            const oldNum = row.oldLineNum != null ? row.oldLineNum : '';
            const newNum = row.newLineNum != null ? row.newLineNum : '';
            const lineNums = isUnchangedFile
                ? `<span class="diff-line-number">${newNum}</span>`
                : `<span class="diff-line-number">${oldNum}</span><span class="diff-line-number">${newNum}</span>`;

            return `<div class="diff-line ${row.cssClass}"${hunkAttr}><span class="diff-avatar-slot">${row.prefixHtml}</span>${lineNums}<span class="diff-indicator">${indicator}</span><span class="diff-content">${contentHtml}</span></div>`;
        }

        /**
         * Create the HTML for a single SBS code row.
         */
        function buildSbsCodeRowHtml(row) {
            const hunkAttr = row.hunkIndex != null ? ` data-hunk="${row.hunkIndex}"` : '';
            const left = row.sbsLeft;
            const right = row.sbsRight;

            let leftContentHtml, rightContentHtml;
            if (left.cssClass === 'sbs-empty' || left.cssClass === 'sbs-gone') {
                leftContentHtml = '';
            } else {
                ({ html: leftContentHtml } = DiffUtils.getHighlightedContent(left.content, left.lineNum, false, threadRangesRaw || [], left.charDiff || null));
            }
            if (right.cssClass === 'sbs-empty' || right.cssClass === 'sbs-gone') {
                rightContentHtml = '';
            } else {
                ({ html: rightContentHtml } = DiffUtils.getHighlightedContent(right.content, right.lineNum, true, threadRangesRaw || [], right.charDiff || null));
            }

            const leftNum = left.lineNum != null ? left.lineNum : '';
            const rightNum = right.lineNum != null ? right.lineNum : '';

            const leftCls = left.cssClass ? ` ${left.cssClass}` : '';
            const rightCls = right.cssClass ? ` ${right.cssClass}` : '';

            return `<div class="sbs-row${row.cssClass === 'diff-unchanged' ? ' diff-unchanged' : ''}"${hunkAttr}><div class="sbs-left${leftCls}"><span class="diff-avatar-slot">${left.prefixHtml}</span><span class="diff-line-number">${leftNum}</span><span class="diff-content">${leftContentHtml}</span></div><div class="sbs-right${rightCls}"><span class="diff-avatar-slot">${right.prefixHtml}</span><span class="diff-line-number">${rightNum}</span><span class="diff-content">${rightContentHtml}</span></div></div>`;
        }

        /**
         * Create a DOM element for a row.
         */
        function createRowElement(row) {
            let html;
            if (row.type === 'code') {
                if (row.sbsMode) {
                    html = buildSbsCodeRowHtml(row);
                } else {
                    html = buildInlineCodeRowHtml(row);
                }
            } else if (row.type === 'thread') {
                html = row.threadHtml;
            } else if (row.type === 'sbs-thread') {
                const leftContent = row.leftHtml
                    ? `<div class="sbs-thread-side sbs-thread-left">${row.leftHtml}</div>`
                    : `<div class="sbs-thread-spacer sbs-thread-left"></div>`;
                const rightContent = row.rightHtml
                    ? `<div class="sbs-thread-side">${row.rightHtml}</div>`
                    : `<div class="sbs-thread-spacer"></div>`;
                html = `<div class="sbs-thread-row">${leftContent}${rightContent}</div>`;
            }

            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            const el = wrapper.firstElementChild;

            // Sync collapsed state: threadHtml is baked at build time but row.collapsed
            // may have changed (e.g. scrollToThread uncollapsed it before rendering).
            if (row.type === 'thread') {
                el.classList.toggle('collapsed', row.collapsed);
            } else if (row.type === 'sbs-thread') {
                for (const t of el.querySelectorAll('.inline-thread')) {
                    t.classList.toggle('collapsed', row.collapsed);
                }
            }

            // Sync gutter avatar visibility for code rows. The prefixHtml is baked at
            // build time, so when the virtual scroller recycles a DOM element the avatar
            // reverts to its initial display state. Re-apply the current collapsed state
            // from the thread row data model so the avatar stays hidden when the thread
            // is expanded (and visible again when the thread is collapsed).
            if (row.type === 'code') {
                for (const avatarEl of el.querySelectorAll('.diff-gutter-avatar[data-thread-id]')) {
                    const tid = parseInt(avatarEl.getAttribute('data-thread-id'));
                    const threadRow = getRowByThreadId(tid);
                    if (threadRow) {
                        avatarEl.style.display = threadRow.collapsed ? '' : 'none';
                    }
                }
                // Re-sync gutter stack count and visibility after updating individual avatars
                for (const stack of el.querySelectorAll('.diff-gutter-stack')) {
                    const avatars = stack.querySelectorAll('.diff-gutter-avatar');
                    const collapsedCount = Array.from(avatars).filter(a => a.style.display !== 'none').length;
                    const countEl = stack.querySelector('.diff-gutter-stack-count');
                    if (countEl) countEl.textContent = collapsedCount;
                    stack.style.display = collapsedCount === 0 ? 'none' : '';
                }
            }

            // Apply search highlights if active
            if (_searchRegex && _searchHighlights?.has(row.index) && row.type === 'code') {
                applySearchHighlightsToElement(el, row.index);
            }

            return el;
        }

        /**
         * Apply search highlights to a rendered element using the stored regex.
         * Uses the same text-node walking approach as the legacy search path.
         */
        function applySearchHighlightsToElement(el, rowIndex) {
            if (!_searchRegex) return;

            const currentOffsetIdx = (_currentSearchMatch && _currentSearchMatch.rowIndex === rowIndex)
                ? _currentSearchMatch.offsetIndex : null;
            let matchCount = 0;

            for (const cell of el.querySelectorAll('.diff-content')) {
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                const textNodes = [];
                let node;
                while ((node = walker.nextNode())) textNodes.push(node);

                for (const textNode of textNodes) {
                    const text = textNode.textContent;
                    const parts = [];
                    let lastIndex = 0;
                    _searchRegex.lastIndex = 0;
                    let match;
                    while ((match = _searchRegex.exec(text)) !== null) {
                        if (match.index > lastIndex)
                            parts.push(document.createTextNode(text.slice(lastIndex, match.index)));
                        const mark = document.createElement('mark');
                        mark.className = 'search-highlight';
                        if (currentOffsetIdx !== null && matchCount === currentOffsetIdx)
                            mark.classList.add('current');
                        mark.textContent = match[0];
                        parts.push(mark);
                        matchCount++;
                        lastIndex = match.index + match[0].length;
                        if (match[0].length === 0) { _searchRegex.lastIndex++; break; }
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

        /**
         * Measure the actual code row height from the DOM.
         */
        function measureCodeRowHeight() {
            if (!_container || !_scrollArea) return DEFAULT_CODE_HEIGHT;
            // Create a temporary hidden row to measure
            const testEl = document.createElement('div');
            testEl.innerHTML = `<div class="diff-line diff-unchanged" style="position:absolute;visibility:hidden;"><span class="diff-avatar-slot"></span><span class="diff-line-number">1</span><span class="diff-line-number">1</span><span class="diff-indicator"> </span><span class="diff-content">x</span></div>`;
            const row = testEl.firstElementChild;
            _container.appendChild(row);
            const h = row.getBoundingClientRect().height;
            _container.removeChild(row);
            return h > 0 ? h : DEFAULT_CODE_HEIGHT;
        }

        /**
         * Mount the scroller: takes over the .diff-lines container.
         */
        function mount(scrollArea, diffLinesContainer) {
            _scrollArea = scrollArea;
            _container = diffLinesContainer;

            // Measure actual code row height
            _codeRowHeight = measureCodeRowHeight();

            // Compute layout
            _totalHeight = computeLayout(rows, _codeRowHeight);

            if (_isSmallFile) {
                // Render all rows directly (no position:absolute)
                renderAllRows();
            } else {
                // Set container to relative positioning with total height
                _container.style.position = 'relative';
                _container.style.height = _totalHeight + 'px';
                _container.style.overflow = 'hidden';

                // Initial render
                renderVisibleRows();

                // Attach scroll handler (RAF-throttled)
                _scrollArea.addEventListener('scroll', onScroll, { passive: true });
            }
        }

        /**
         * For small files: render everything without virtualization.
         */
        function renderAllRows() {
            const fragment = document.createDocumentFragment();
            for (const row of rows) {
                const el = createRowElement(row);
                _renderedElements.set(row.index, el);
                fragment.appendChild(el);
            }
            _container.appendChild(fragment);
            _renderedRange = { start: 0, end: rows.length - 1 };

            // Measure thread heights and notify
            measureThreadHeights();
            notifyRowsRendered(0, rows.length - 1);
        }

        function onScroll() {
            if (_rafId != null) return;
            _rafId = requestAnimationFrame(() => {
                _rafId = null;
                if (_destroyed) return;
                // Clear pending navigation target once smooth scroll has settled
                if (_pendingScrollTarget) {
                    const expected = computeScrollTargetTop(_pendingScrollTarget.row, _pendingScrollTarget.block);
                    if (Math.abs(_scrollArea.scrollTop - expected) <= 2) {
                        _pendingScrollTarget = null;
                    }
                }
                renderVisibleRows();
            });
        }

        /**
         * Determine which rows to render and update DOM.
         */
        function renderVisibleRows() {
            if (!_scrollArea || !_container || rows.length === 0) return;

            const scrollTop = _scrollArea.scrollTop;
            const viewportHeight = _scrollArea.clientHeight;
            const rangeTop = Math.max(0, scrollTop - OVERSCAN_PX);
            const rangeBottom = scrollTop + viewportHeight + OVERSCAN_PX;

            const startIdx = findFirstVisibleRow(rows, rangeTop);
            let endIdx = startIdx;
            while (endIdx < rows.length - 1 && rows[endIdx].top < rangeBottom) {
                endIdx++;
            }

            // Check if range changed
            if (startIdx === _renderedRange.start && endIdx === _renderedRange.end) return;

            // Remove elements outside new range
            for (const [idx, el] of _renderedElements) {
                if (idx < startIdx || idx > endIdx) {
                    el.remove();
                    _renderedElements.delete(idx);
                }
            }

            // Add elements in new range that aren't already rendered
            const fragment = document.createDocumentFragment();
            let needsInsert = false;

            for (let i = startIdx; i <= endIdx; i++) {
                if (_renderedElements.has(i)) continue;

                const row = rows[i];
                const el = createRowElement(row);

                // Position absolutely
                el.style.position = 'absolute';
                el.style.top = row.top + 'px';
                el.style.width = '100%';
                el.style.boxSizing = 'border-box';

                _renderedElements.set(i, el);
                fragment.appendChild(el);
                needsInsert = true;
            }

            if (needsInsert) {
                _container.appendChild(fragment);
            }

            const prevStart = _renderedRange.start;
            const prevEnd = _renderedRange.end;
            _renderedRange = { start: startIdx, end: endIdx };

            // Measure thread row heights for newly rendered rows
            measureThreadHeightsInRange(startIdx, endIdx);

            // Notify callbacks for newly rendered rows
            if (prevStart === -1) {
                notifyRowsRendered(startIdx, endIdx);
            } else {
                if (startIdx < prevStart) notifyRowsRendered(startIdx, Math.min(prevStart - 1, endIdx));
                if (endIdx > prevEnd) notifyRowsRendered(Math.max(prevEnd + 1, startIdx), endIdx);
            }
        }

        /**
         * Measure actual thread row heights and recalc layout if needed.
         */
        function measureThreadHeights() {
            measureThreadHeightsInRange(0, rows.length - 1);
        }

        function measureThreadHeightsInRange(start, end) {
            let needsRecalc = false;
            for (let i = start; i <= end; i++) {
                const row = rows[i];
                if (row.type === 'code') continue;
                const el = _renderedElements.get(i);
                if (!el) continue;

                const actual = el.getBoundingClientRect().height;
                if (actual > 0 && (row.measuredHeight == null || Math.abs(actual - row.measuredHeight) > 2)) {
                    row.measuredHeight = actual;
                    needsRecalc = true;
                }
            }
            if (needsRecalc && !_isSmallFile) {
                recalcLayoutInternal();
            }
        }

        function notifyRowsRendered(start, end) {
            for (const cb of _rowRenderedCallbacks) {
                for (let i = start; i <= end; i++) {
                    const el = _renderedElements.get(i);
                    if (el) cb(rows[i], el);
                }
            }
        }

        /**
         * Recalculate layout after height changes (thread toggle, font change).
         */
        function recalcLayoutInternal() {
            if (_isSmallFile) return; // small files don't use absolute positioning
            const scrollTop = _scrollArea?.scrollTop || 0;

            // Find the row currently at the top of viewport for scroll anchoring
            const anchorIdx = findFirstVisibleRow(rows, scrollTop);
            const anchorOffset = scrollTop - rows[anchorIdx].top;

            // Recompute layout (accounting for spliced comment form if present)
            _totalHeight = computeLayout(rows, _codeRowHeight, _extraFormAfterIndex, _extraFormShift);
            _container.style.height = _totalHeight + 'px';

            // Update positions of rendered elements
            for (const [idx, el] of _renderedElements) {
                el.style.top = rows[idx].top + 'px';
            }

            // Keep comment form element positioned correctly
            if (_extraFormEl && _extraFormAfterIndex >= 0) {
                const r = rows[_extraFormAfterIndex];
                _extraFormEl.style.top = (r.top + r.height) + 'px';
            }

            // If a navigation scroll is in progress, re-apply it to the updated row
            // position rather than anchoring — anchoring would cancel the smooth scroll
            // and land the viewport at the wrong place.
            if (_pendingScrollTarget) {
                const newTarget = computeScrollTargetTop(_pendingScrollTarget.row, _pendingScrollTarget.block);
                _scrollArea.scrollTo({ top: newTarget, behavior: 'smooth' });
            } else {
                // Anchor scroll position to prevent jump during normal scrolling
                _scrollArea.scrollTop = rows[anchorIdx].top + anchorOffset;
            }
        }

        // ===== Public API =====

        function destroy() {
            _destroyed = true;
            if (_rafId != null) cancelAnimationFrame(_rafId);
            if (_scrollArea) _scrollArea.removeEventListener('scroll', onScroll);
            if (_extraFormObserver) { _extraFormObserver.disconnect(); _extraFormObserver = null; }
            _renderedElements.clear();
            _scrollArea = null;
            _container = null;
            _rowRenderedCallbacks = [];
        }

        function getRowByLineNum(lineNum, side) {
            const idx = (side === 'old' ? lineNumMapLeft : lineNumMapRight).get(lineNum);
            return idx != null ? rows[idx] : null;
        }

        function getRowByHunkIndex(idx) {
            return idx >= 0 && idx < hunkStarts.length ? rows[hunkStarts[idx]] : null;
        }

        function getHunkCount() {
            return hunkStarts.length;
        }

        function getRowByThreadId(id) {
            const idx = threadIdMap.get(id);
            return idx != null ? rows[idx] : null;
        }

        function getCodeRows() {
            return rows.filter(r => r.type === 'code');
        }

        function getAllRows() {
            return rows;
        }

        function computeScrollTargetTop(row, block) {
            const viewportH = _scrollArea.clientHeight;
            let top;
            if (block === 'center') {
                top = row.top + row.height / 2 - viewportH / 2;
            } else if (block === 'start') {
                top = row.top;
            } else {
                top = row.top + row.height - viewportH;
            }
            return Math.max(0, Math.min(top, _scrollArea.scrollHeight - viewportH));
        }

        function scrollToRow(row, opts = {}) {
            if (!_scrollArea || !row) return;
            const block = opts.block || 'center';

            // Ensure the row is rendered first
            ensureRowRendered(row);

            const targetScrollTop = computeScrollTargetTop(row, block);

            if (opts.behavior === 'smooth') {
                // Track the navigation target so recalcLayoutInternal can re-apply
                // it (instead of doing scroll anchoring) if heights are measured
                // and layout shifts during the smooth scroll animation.
                _pendingScrollTarget = { row, block };
                _scrollArea.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
            } else {
                _pendingScrollTarget = null;
                _scrollArea.scrollTop = targetScrollTop;
            }

            // Re-render to ensure the row and surrounding rows are in DOM
            if (!_isSmallFile) {
                renderVisibleRows();
            }
        }

        function ensureRowRendered(row) {
            if (_isSmallFile) return; // all rows always rendered
            if (_renderedElements.has(row.index)) return;

            // Temporarily render just this row
            const el = createRowElement(row);
            el.style.position = 'absolute';
            el.style.top = row.top + 'px';
            el.style.width = '100%';
            el.style.boxSizing = 'border-box';
            _container.appendChild(el);
            _renderedElements.set(row.index, el);
        }

        function getRenderedElement(row) {
            if (!row) return null;
            return _renderedElements.get(row.index) || null;
        }

        function getTopVisibleCodeRow() {
            if (!_scrollArea) return null;
            const scrollTop = _scrollArea.scrollTop;
            const idx = findFirstVisibleRow(rows, scrollTop);
            // Find the first code row at or after idx
            for (let i = idx; i < rows.length; i++) {
                if (rows[i].type === 'code') return rows[i];
            }
            return null;
        }

        // Returns the first visible line number for the given side, skipping spacer rows.
        // side: 'old' (left pane) | 'new' (right pane) | null (prefer new, fall back to old)
        function getTopVisibleLineNum(side) {
            if (!_scrollArea) return null;
            const scrollTop = _scrollArea.scrollTop;
            const idx = findFirstVisibleRow(rows, scrollTop);
            for (let i = idx; i < rows.length; i++) {
                const row = rows[i];
                if (row.type !== 'code') continue;
                let lineNum;
                if (side === 'old') {
                    lineNum = row.oldLineNum;
                } else if (side === 'new') {
                    lineNum = row.newLineNum;
                } else {
                    lineNum = row.newLineNum ?? row.oldLineNum;
                }
                if (lineNum != null) return lineNum;
            }
            return null;
        }

        function getRowTextContent(row) {
            if (!row || row.type !== 'code') return '';
            if (row.sbsMode) {
                return (row.sbsLeft.content || '') + '\n' + (row.sbsRight.content || '');
            }
            return row.diffEntry?.content || '';
        }

        function setCurrentSearchMatch(match) {
            // match: {rowIndex, offsetIndex} or null
            // Remove .current from previously rendered current mark
            if (_currentSearchMatch) {
                const el = _renderedElements.get(_currentSearchMatch.rowIndex);
                if (el) {
                    el.querySelectorAll('mark.search-highlight.current')
                        .forEach(m => m.classList.remove('current'));
                }
            }
            _currentSearchMatch = match;
            // Add .current to new current mark if already rendered
            if (match) {
                const el = _renderedElements.get(match.rowIndex);
                if (el) {
                    const marks = el.querySelectorAll('mark.search-highlight');
                    if (marks[match.offsetIndex]) marks[match.offsetIndex].classList.add('current');
                }
            }
        }

        function setSearchHighlights(highlights, regex) {
            // highlights: Map<rowIndex, [{start, end}]> or null
            // regex: RegExp used for applying highlights to rendered DOM
            _searchHighlights = highlights;
            _searchRegex = regex || null;
            if (!highlights) _currentSearchMatch = null;
            // Re-render visible rows that have highlight changes
            if (!_isSmallFile) {
                // Force re-render of all currently visible rows
                const { start, end } = _renderedRange;
                for (let i = start; i <= end; i++) {
                    const el = _renderedElements.get(i);
                    if (el) {
                        el.remove();
                        _renderedElements.delete(i);
                    }
                }
                _renderedRange = { start: -1, end: -1 };
                renderVisibleRows();
            } else {
                // For small files, re-render all
                if (_container) {
                    _container.innerHTML = '';
                    _renderedElements.clear();
                    renderAllRows();
                }
            }
        }

        function invalidateHeights() {
            // Clear measured heights on all thread rows
            for (const row of rows) {
                if (row.type !== 'code') {
                    row.measuredHeight = null;
                }
            }
        }

        function recalcLayout() {
            if (_isSmallFile) return;
            _totalHeight = computeLayout(rows, _codeRowHeight, _extraFormAfterIndex, _extraFormShift);
            _container.style.height = _totalHeight + 'px';
            for (const [idx, el] of _renderedElements) {
                el.style.top = rows[idx].top + 'px';
            }
            if (_extraFormEl && _extraFormAfterIndex >= 0) {
                const r = rows[_extraFormAfterIndex];
                _extraFormEl.style.top = (r.top + r.height) + 'px';
            }
        }

        /**
         * Splice a comment-form element into the layout after a given row DOM element,
         * shifting all subsequent rows down so the form pushes content rather than overlaying it.
         * No-op for small files (which use normal DOM flow and don't need this).
         */
        function insertFormRow(formEl, afterElement, onLayoutChange) {
            if (_isSmallFile) return;

            // Reverse-lookup: find the row index that owns afterElement
            let afterIndex = -1;
            for (const [idx, el] of _renderedElements) {
                if (el === afterElement) { afterIndex = idx; break; }
            }
            if (afterIndex === -1) return;

            // Clean up any previous form first
            if (_extraFormEl) removeFormRow();

            // Position the form absolutely right below the target row and append to container
            const r = rows[afterIndex];
            const formTop = r.top + r.height;
            formEl.style.position = 'absolute';
            formEl.style.top = formTop + 'px';
            formEl.style.left = '0';
            formEl.style.right = '0';
            formEl.style.zIndex = '10';
            formEl.style.boxSizing = 'border-box';
            _container.appendChild(formEl);

            // Measure actual rendered height (getBoundingClientRect forces layout)
            const formH = formEl.getBoundingClientRect().height || 130;

            // Store state and re-run layout so subsequent rows are shifted
            _extraFormEl = formEl;
            _extraFormAfterIndex = afterIndex;
            _extraFormShift = formH;

            _totalHeight = computeLayout(rows, _codeRowHeight, _extraFormAfterIndex, _extraFormShift);
            _container.style.height = _totalHeight + 'px';

            // Update positions of all currently-rendered rows after insertion point
            for (const [idx, el] of _renderedElements) {
                if (idx > afterIndex) el.style.top = rows[idx].top + 'px';
            }

            // Scroll to show the form if it's below the current viewport
            if (_scrollArea) {
                const visibleBottom = _scrollArea.scrollTop + _scrollArea.clientHeight;
                if (formTop + formH > visibleBottom) {
                    _scrollArea.scrollTop = Math.min(
                        formTop,
                        formTop + formH - _scrollArea.clientHeight + 8
                    );
                }
            }

            // Watch for height changes as the user types / preview expands
            _extraFormObserver = new ResizeObserver(() => {
                if (!_extraFormEl) return;
                const newH = _extraFormEl.getBoundingClientRect().height;
                if (newH <= 0 || Math.abs(newH - _extraFormShift) <= 1) return;
                _extraFormShift = newH;
                _totalHeight = computeLayout(rows, _codeRowHeight, _extraFormAfterIndex, _extraFormShift);
                _container.style.height = _totalHeight + 'px';
                for (const [idx, el] of _renderedElements) {
                    if (idx > _extraFormAfterIndex) el.style.top = rows[idx].top + 'px';
                }
                onLayoutChange?.();
            });
            _extraFormObserver.observe(formEl);
        }

        /**
         * Remove the spliced comment form and restore the original row layout.
         */
        function removeFormRow() {
            if (!_extraFormEl || _isSmallFile) return;

            if (_extraFormObserver) { _extraFormObserver.disconnect(); _extraFormObserver = null; }
            _extraFormEl.remove();
            const afterIndex = _extraFormAfterIndex;

            _extraFormEl = null;
            _extraFormAfterIndex = -1;
            _extraFormShift = 0;

            // Recompute layout without the form shift
            _totalHeight = computeLayout(rows, _codeRowHeight);
            _container.style.height = _totalHeight + 'px';

            // Restore positions of rows that were shifted
            for (const [idx, el] of _renderedElements) {
                if (idx > afterIndex) el.style.top = rows[idx].top + 'px';
            }
        }

        /**
         * Return position and color of the spliced comment-form for minimap rendering,
         * or null when no form is currently inserted.
         */
        function getExtraFormInfo() {
            if (_extraFormAfterIndex < 0 || !_extraFormEl) return null;
            const r = rows[_extraFormAfterIndex];
            return { top: r.top + r.height, height: _extraFormShift, minimapColor: r.minimapColor ?? null };
        }

        function onRowRendered(callback) {
            _rowRenderedCallbacks.push(callback);
        }

        function isSmallFile() {
            return _isSmallFile;
        }

        function getMode() {
            return _mode;
        }

        function getTotalHeight() {
            return _totalHeight;
        }

        return {
            mount,
            destroy,
            getRowByLineNum,
            getRowByHunkIndex,
            getHunkCount,
            getRowByThreadId,
            getCodeRows,
            getAllRows,
            scrollToRow,
            hasPendingScrollTarget: () => _pendingScrollTarget !== null,
            getRenderedElement,
            getTopVisibleCodeRow,
            getTopVisibleLineNum,
            getRowTextContent,
            setSearchHighlights,
            setCurrentSearchMatch,
            invalidateHeights,
            recalcLayout,
            onRowRendered,
            isSmallFile,
            getMode,
            getTotalHeight,
            insertFormRow,
            removeFormRow,
            getExtraFormInfo,
        };
    }

    return { create, buildVirtualRows };
})();

// Export for use in HTML files
if (typeof window !== 'undefined') {
    window.DiffVirtualScroller = DiffVirtualScroller;
}

// Export for use in Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffVirtualScroller;
}
