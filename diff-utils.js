/**
 * Diff Utilities
 *
 * Pure functions for diff rendering, thread highlighting, and file path
 * tracking across iterations. Extracted from ado-pr-threads.html for
 * testability.
 */

let _escapeHtml = null;

const HIGHLIGHT_MARK_STYLE = 'background: #ffe082; color: #000000; font-weight: 600;';

function cropDiffToRegion(diff, startLine, endLine, useRight, contextLines = 5) {
    const regionStart = Math.max(1, startLine - contextLines);
    const regionEnd = endLine + contextLines;

    let firstIdx = -1, lastIdx = -1;
    let lastNewLine = 0, lastOldLine = 0;

    for (let i = 0; i < diff.length; i++) {
        const entry = diff[i];
        if (entry.newLine !== undefined) lastNewLine = entry.newLine;
        if (entry.oldLine !== undefined) lastOldLine = entry.oldLine;

        const line = useRight
            ? (entry.newLine ?? lastNewLine)
            : (entry.oldLine ?? lastOldLine);

        if (line >= regionStart && line <= regionEnd) {
            if (firstIdx === -1) firstIdx = i;
            lastIdx = i;
        }
    }

    if (firstIdx === -1) return [];
    return diff.slice(firstIdx, lastIdx + 1);
}

function applyThreadHighlight(rawContent, lineNum, tr) {
    if (!tr.appliesToView) return _escapeHtml(rawContent);
    const isInRange = lineNum >= tr.startLine && lineNum <= tr.endLine;
    if (!isInRange) return _escapeHtml(rawContent);

    const adjStart = Math.max(0, tr.startOffset - 1);
    const adjEnd = tr.endOffset > 0 ? Math.max(0, tr.endOffset - 1) : 0;

    // If no offsets (whole-line comment), highlight entire line
    if (tr.startOffset === 0 && tr.endOffset === 0) {
        return `<mark style="${HIGHLIGHT_MARK_STYLE}">${_escapeHtml(rawContent)}</mark>`;
    }

    if (lineNum === tr.startLine && lineNum === tr.endLine && adjEnd > 0) {
        const before = _escapeHtml(rawContent.substring(0, adjStart));
        const highlighted = _escapeHtml(rawContent.substring(adjStart, adjEnd));
        const after = _escapeHtml(rawContent.substring(adjEnd));
        return `${before}<mark style="${HIGHLIGHT_MARK_STYLE}">${highlighted}</mark>${after}`;
    } else if (lineNum === tr.startLine) {
        const before = _escapeHtml(rawContent.substring(0, adjStart));
        const highlighted = _escapeHtml(rawContent.substring(adjStart));
        return `${before}<mark style="${HIGHLIGHT_MARK_STYLE}">${highlighted}</mark>`;
    } else if (lineNum === tr.endLine && adjEnd > 0) {
        const highlighted = _escapeHtml(rawContent.substring(0, adjEnd));
        const after = _escapeHtml(rawContent.substring(adjEnd));
        return `<mark style="${HIGHLIGHT_MARK_STYLE}">${highlighted}</mark>${after}`;
    } else {
        return `<mark style="${HIGHLIGHT_MARK_STYLE}">${_escapeHtml(rawContent)}</mark>`;
    }
}

function getHighlightedContent(rawContent, lineNum, isNewLine, threadRanges) {
    for (const tr of threadRanges) {
        if (!tr.appliesToView) continue;
        const matchesRight = tr.useRight && isNewLine && lineNum >= tr.startLine && lineNum <= tr.endLine;
        const matchesLeft = !tr.useRight && !isNewLine && lineNum >= tr.startLine && lineNum <= tr.endLine;
        if (matchesRight || matchesLeft) {
            return { html: applyThreadHighlight(rawContent, lineNum, tr), commented: true };
        }
    }
    return { html: _escapeHtml(rawContent), commented: false };
}

function buildThreadRange(thread, viewIterStart, viewIterEnd) {
    const ctx = thread.threadContext;
    const useRight = !!ctx.rightFileStart;
    const startLine = (useRight ? ctx.rightFileStart?.line : ctx.leftFileStart?.line) || 0;
    const endLine = (useRight ? (ctx.rightFileEnd?.line || ctx.rightFileStart?.line) : (ctx.leftFileEnd?.line || ctx.leftFileStart?.line)) || startLine;
    const startOffset = (useRight ? ctx.rightFileStart?.offset : ctx.leftFileStart?.offset) || 0;
    const endOffset = (useRight ? ctx.rightFileEnd?.offset : ctx.leftFileEnd?.offset) || 0;

    const threadIter = thread.pullRequestThreadContext?.iterationContext?.secondComparingIteration;
    const appliesToView = !threadIter || (threadIter >= viewIterStart && threadIter <= viewIterEnd);

    return { thread, startLine, endLine, startOffset, endOffset, useRight, appliesToView, inserted: false };
}

function renderDiffLines(diff, threadRanges, options = {}) {
    const startOld = options.startOldLine ?? 1;
    const startNew = options.startNewLine ?? 1;
    const getLinePrefix = options.getLinePrefix || null;
    const getLineSuffix = options.getLineSuffix || null;

    let html = '';
    let oldLineNum = startOld;
    let newLineNum = startNew;

    for (const entry of diff) {
        let curOld = null, curNew = null;
        let contentHtml, commented;

        if (entry.type === 'unchanged') {
            curOld = oldLineNum; curNew = newLineNum;
            const r = getHighlightedContent(entry.content, newLineNum, true, threadRanges);
            if (!r.commented) {
                const r2 = getHighlightedContent(entry.content, oldLineNum, false, threadRanges);
                contentHtml = r2.html; commented = r2.commented;
            } else {
                contentHtml = r.html; commented = true;
            }
            const commentedClass = commented ? ' diff-line-commented' : '';
            const prefix = getLinePrefix ? getLinePrefix(newLineNum, oldLineNum) : '';
            html += `<div class="diff-line diff-unchanged${commentedClass}">${prefix}<span class="diff-line-number">${oldLineNum}</span><span class="diff-line-number">${newLineNum}</span><span class="diff-indicator"> </span><span class="diff-content">${contentHtml}</span></div>`;
            oldLineNum++;
            newLineNum++;
        } else if (entry.type === 'removed') {
            curOld = oldLineNum;
            ({ html: contentHtml, commented } = getHighlightedContent(entry.content, oldLineNum, false, threadRanges));
            const commentedClass = commented ? ' diff-line-commented' : '';
            const prefix = getLinePrefix ? getLinePrefix(null, oldLineNum) : '';
            html += `<div class="diff-line diff-removed${commentedClass}">${prefix}<span class="diff-line-number">${oldLineNum}</span><span class="diff-line-number"></span><span class="diff-indicator">−</span><span class="diff-content">${contentHtml}</span></div>`;
            oldLineNum++;
        } else if (entry.type === 'added') {
            curNew = newLineNum;
            ({ html: contentHtml, commented } = getHighlightedContent(entry.content, newLineNum, true, threadRanges));
            const commentedClass = commented ? ' diff-line-commented' : '';
            const prefix = getLinePrefix ? getLinePrefix(newLineNum, null) : '';
            html += `<div class="diff-line diff-added${commentedClass}">${prefix}<span class="diff-line-number"></span><span class="diff-line-number">${newLineNum}</span><span class="diff-indicator">+</span><span class="diff-content">${contentHtml}</span></div>`;
            newLineNum++;
        }

        if (getLineSuffix) {
            html += getLineSuffix(curNew, curOld);
        }
    }

    return html;
}

function renderDiffLinesSideBySide(diff, threadRanges, options = {}) {
    const startOld = options.startOldLine ?? 1;
    const startNew = options.startNewLine ?? 1;
    const getLinePrefix = options.getLinePrefix || null;
    const getLineSuffix = options.getLineSuffix || null;

    let html = '';
    let oldLineNum = startOld;
    let newLineNum = startNew;
    let i = 0;

    while (i < diff.length) {
        const entry = diff[i];

        if (entry.type === 'unchanged') {
            const { html: contentHtmlR, commented: commentedR } = getHighlightedContent(entry.content, newLineNum, true, threadRanges);
            const { html: contentHtmlL, commented: commentedL } = getHighlightedContent(entry.content, oldLineNum, false, threadRanges);
            const commented = commentedR || commentedL;
            const commentedClassL = (commentedL ? ' diff-line-commented' : '');
            const commentedClassR = (commentedR ? ' diff-line-commented' : '');
            const prefix = getLinePrefix ? getLinePrefix(newLineNum, oldLineNum) : '';
            html += `<div class="sbs-row diff-unchanged">${prefix}<div class="sbs-left${commentedClassL}"><span class="diff-line-number">${oldLineNum}</span><span class="diff-content">${contentHtmlL}</span></div><div class="sbs-right${commentedClassR}"><span class="diff-line-number">${newLineNum}</span><span class="diff-content">${contentHtmlR}</span></div></div>`;
            if (getLineSuffix) html += getLineSuffix(newLineNum, oldLineNum);
            oldLineNum++;
            newLineNum++;
            i++;
        } else {
            // Collect consecutive removed then added entries into a hunk
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
                let leftHtml, rightHtml;
                let curOld = null, curNew = null;

                if (j < removed.length) {
                    curOld = oldLineNum;
                    const { html: cHtml, commented } = getHighlightedContent(removed[j].content, oldLineNum, false, threadRanges);
                    const commentedClass = commented ? ' diff-line-commented' : '';
                    leftHtml = `<div class="sbs-left diff-removed${commentedClass}"><span class="diff-line-number">${oldLineNum}</span><span class="diff-content">${cHtml}</span></div>`;
                    oldLineNum++;
                } else {
                    leftHtml = `<div class="sbs-left sbs-empty"><span class="diff-line-number"></span><span class="diff-content"></span></div>`;
                }

                if (j < added.length) {
                    curNew = newLineNum;
                    const { html: cHtml, commented } = getHighlightedContent(added[j].content, newLineNum, true, threadRanges);
                    const commentedClass = commented ? ' diff-line-commented' : '';
                    rightHtml = `<div class="sbs-right diff-added${commentedClass}"><span class="diff-line-number">${newLineNum}</span><span class="diff-content">${cHtml}</span></div>`;
                    newLineNum++;
                } else {
                    rightHtml = `<div class="sbs-right sbs-empty"><span class="diff-line-number"></span><span class="diff-content"></span></div>`;
                }

                const prefix = getLinePrefix ? getLinePrefix(curNew, curOld) : '';
                html += `<div class="sbs-row">${prefix}${leftHtml}${rightHtml}</div>`;
                if (getLineSuffix) html += getLineSuffix(curNew, curOld);
            }
            continue;
        }
    }

    return html;
}

/**
 * Build file path history across iterations.
 * @param {string} filePath - Current known file path
 * @param {number} knownIterationId - Iteration where filePath is known
 * @param {object} deps - Dependencies: { iterations, cache, getChanges }
 * @returns {Promise<Map>} Map<iterationId, filePath>
 */
async function buildFilePathHistory(filePath, knownIterationId, deps) {
    const { iterations, cache, getChanges } = deps;

    const cacheKey = `${filePath}@${knownIterationId}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const sortedIterations = [...iterations].sort((a, b) => a.id - b.id);
    const pathHistory = new Map();

    const knownIndex = sortedIterations.findIndex(it => it.id === knownIterationId);
    if (knownIndex === -1) {
        for (const it of sortedIterations) {
            pathHistory.set(it.id, filePath);
        }
        cache.set(cacheKey, pathHistory);
        return pathHistory;
    }

    pathHistory.set(knownIterationId, filePath);

    // Walk backwards from known iteration to first
    let currentPath = filePath;
    for (let i = knownIndex; i >= 0; i--) {
        const iteration = sortedIterations[i];
        const changes = await getChanges(iteration.id);

        for (const change of changes) {
            const changeType = (change.changeType || '').toLowerCase();
            const oldPath = change.sourceServerItem || change.originalPath;
            if (changeType.includes('rename') && change.item?.path === currentPath && oldPath) {
                currentPath = oldPath;
                break;
            }
        }
        pathHistory.set(iteration.id, currentPath);
    }

    // Walk forwards from known iteration to last
    currentPath = filePath;
    for (let i = knownIndex + 1; i < sortedIterations.length; i++) {
        const iteration = sortedIterations[i];
        const changes = await getChanges(iteration.id);

        for (const change of changes) {
            const changeType = (change.changeType || '').toLowerCase();
            const oldPath = change.sourceServerItem || change.originalPath;
            if (changeType.includes('rename') && oldPath === currentPath && change.item?.path) {
                currentPath = change.item.path;
                break;
            }
        }
        pathHistory.set(iteration.id, currentPath);
    }

    // Cache under all path+iteration combinations
    for (const [iterationId, pathAtIteration] of pathHistory) {
        const altCacheKey = `${pathAtIteration}@${iterationId}`;
        if (!cache.has(altCacheKey)) {
            cache.set(altCacheKey, pathHistory);
        }
    }

    return pathHistory;
}

/**
 * Get file path at a specific iteration.
 * @param {string} filePath - Current known file path
 * @param {number} knownIterationId - Iteration where filePath is known
 * @param {number} targetIterationId - Iteration to resolve path for
 * @param {object} deps - Dependencies: { iterations, cache, getChanges }
 * @returns {Promise<string>}
 */
async function getFilePathAtIteration(filePath, knownIterationId, targetIterationId, deps) {
    const history = await buildFilePathHistory(filePath, knownIterationId, deps);
    return history.get(targetIterationId) || filePath;
}

/**
 * Get or compute a file diff, with caching.
 * @param {string} filePath - File path (new side)
 * @param {string} oldCommitId - Base commit
 * @param {string} newCommitId - Target commit
 * @param {string} oldFilePath - Old file path (if renamed)
 * @param {object} deps - Dependencies: { config, cache, getFileContent, diff }
 * @returns {Promise<object>} { diff, addedCount, removedCount, oldFetchFailed, newFetchFailed }
 */
async function getOrComputeFileDiff(filePath, oldCommitId, newCommitId, oldFilePath, deps) {
    const { config, cache, getFileContent, diff: diffAlgo } = deps;

    const cacheKey = `${filePath}:${oldCommitId || 'null'}-${newCommitId || 'null'}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let oldFetchFailed = false, newFetchFailed = false;
    const [oldContent, newContent] = await Promise.all([
        oldCommitId
            ? getFileContent(config, oldFilePath || filePath, { version: oldCommitId, versionType: 'commit' }).catch(() => { oldFetchFailed = true; return ''; })
            : Promise.resolve(''),
        newCommitId
            ? getFileContent(config, filePath, { version: newCommitId, versionType: 'commit' }).catch(() => { newFetchFailed = true; return ''; })
            : Promise.resolve('')
    ]);

    const diffResult = diffAlgo.diff(oldContent, newContent);

    let addedCount = 0, removedCount = 0;
    for (const entry of diffResult) {
        if (entry.type === 'added') addedCount++;
        else if (entry.type === 'removed') removedCount++;
    }

    const result = { diff: diffResult, addedCount, removedCount, oldFetchFailed, newFetchFailed };
    if (!oldFetchFailed && !newFetchFailed) {
        cache.set(cacheKey, result);
    }
    return result;
}

const DiffUtils = {
    init(escapeHtml) { _escapeHtml = escapeHtml; },
    HIGHLIGHT_MARK_STYLE,
    cropDiffToRegion,
    buildThreadRange,
    applyThreadHighlight,
    getHighlightedContent,
    renderDiffLines,
    renderDiffLinesSideBySide,
    buildFilePathHistory,
    getFilePathAtIteration,
    getOrComputeFileDiff,
};

// Export for use in HTML files
if (typeof window !== 'undefined') {
    window.DiffUtils = DiffUtils;
}

// Export for use in Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffUtils;
}
