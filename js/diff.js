/**
 * Histogram Diff Algorithm
 *
 * Similar to Git's histogram diff - finds low-occurrence lines as anchors
 * and recursively diffs regions between them. Produces clean, readable diffs
 * that respect logical code boundaries.
 */

const HistogramDiff = {
    /**
     * Normalize a line for whitespace-insensitive comparison.
     * Trims leading/trailing whitespace and collapses internal runs to a single space.
     */
    _normalizeWS(line) {
        return line.trim().replace(/\s+/g, ' ');
    },

    /** Compare two lines, optionally ignoring whitespace differences */
    _eq(a, b, ignoreWS) {
        if (!ignoreWS) return a === b;
        return this._normalizeWS(a) === this._normalizeWS(b);
    },

    /**
     * Compute a line-by-line diff between two texts
     * @param {string} oldText - Original text
     * @param {string} newText - New text
     * @param {object} [options]
     * @param {boolean} [options.ignoreWhitespace=true] - Treat lines that differ only in whitespace as unchanged
     * @returns {Array} Array of {type: 'unchanged'|'added'|'removed', content: string, oldLine?: number, newLine?: number}
     */
    diff(oldText, newText, options = {}) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        return this.diffLines(oldLines, newLines, options);
    },

    /**
     * Compute a line-by-line diff between two arrays of lines
     * @param {string[]} oldLines - Original lines
     * @param {string[]} newLines - New lines
     * @param {object} [options]
     * @param {boolean} [options.ignoreWhitespace=true] - Treat lines that differ only in whitespace as unchanged
     * @returns {Array} Diff entries with type, content, and line numbers
     */
    diffLines(oldLines, newLines, options = {}) {
        const ignoreWS = options.ignoreWhitespace !== false;
        const diff = [];
        this._diffRegion(oldLines, 0, oldLines.length, newLines, 0, newLines.length, diff, ignoreWS);

        // Add line numbers
        let oldLineNum = 1;
        let newLineNum = 1;
        for (const entry of diff) {
            if (entry.type === 'unchanged') {
                entry.oldLine = oldLineNum++;
                entry.newLine = newLineNum++;
            } else if (entry.type === 'removed') {
                entry.oldLine = oldLineNum++;
            } else if (entry.type === 'added') {
                entry.newLine = newLineNum++;
            }
        }

        return diff;
    },

    /**
     * Iteratively diff a region using histogram algorithm (avoids stack overflow on large files)
     */
    _diffRegion(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result, ignoreWS) {
        // Use an explicit stack to avoid call stack overflow on large files.
        // Each task is either:
        //   { type: 'region', oldStart, oldEnd, newStart, newEnd }
        //   { type: 'line', entry }  — a pre-resolved anchor line to emit
        //   { type: 'unchanged_batch', lines, start, end }  — contiguous unchanged lines (suffix)
        const stack = [{ type: 'region', oldStart, oldEnd, newStart, newEnd }];

        while (stack.length > 0) {
            const task = stack.pop();

            if (task.type === 'line') {
                result.push(task.entry);
                continue;
            }

            if (task.type === 'unchanged_batch') {
                const { lines, start, end } = task;
                for (let i = start; i < end; i++) {
                    result.push({ type: 'unchanged', content: lines[i] });
                }
                continue;
            }

            let { oldStart: os, oldEnd: oe, newStart: ns, newEnd: ne } = task;

            // Empty region
            if (os >= oe && ns >= ne) continue;

            // All old lines removed
            if (os >= oe) {
                for (let j = ns; j < ne; j++) result.push({ type: 'added', content: newLines[j] });
                continue;
            }

            // All new lines added
            if (ns >= ne) {
                for (let i = os; i < oe; i++) result.push({ type: 'removed', content: oldLines[i] });
                continue;
            }

            // Trim common prefix: emit unchanged lines directly (they come first in output).
            // Use new-file content so whitespace-normalized matches show current indentation.
            while (os < oe && ns < ne && this._eq(oldLines[os], newLines[ns], ignoreWS)) {
                result.push({ type: 'unchanged', content: newLines[ns] });
                os++;
                ns++;
            }

            // Trim common suffix: defer as a batch task (processed after middle region).
            // Store new-file indices so content reflects current indentation.
            let sfx = 0;
            while (oe - 1 - sfx >= os && ne - 1 - sfx >= ns &&
                   this._eq(oldLines[oe - 1 - sfx], newLines[ne - 1 - sfx], ignoreWS)) {
                sfx++;
            }
            if (sfx > 0) {
                stack.push({ type: 'unchanged_batch', lines: newLines, start: ne - sfx, end: ne });
                oe -= sfx;
                ne -= sfx;
            }

            // Re-check after trimming
            if (os >= oe && ns >= ne) continue;
            if (os >= oe) {
                for (let j = ns; j < ne; j++) result.push({ type: 'added', content: newLines[j] });
                continue;
            }
            if (ns >= ne) {
                for (let i = os; i < oe; i++) result.push({ type: 'removed', content: oldLines[i] });
                continue;
            }

            // Small region: use simple LCS
            if ((oe - os) + (ne - ns) <= 10) {
                this._simpleLCS(oldLines, os, oe, newLines, ns, ne, result, ignoreWS);
                continue;
            }

            // Build histogram and find best anchor
            const anchor = this._findAnchor(oldLines, os, oe, newLines, ns, ne, ignoreWS);

            if (!anchor) {
                this._simpleLCS(oldLines, os, oe, newLines, ns, ne, result, ignoreWS);
                continue;
            }

            // Push tasks in reverse order (stack is LIFO) to process left-to-right:
            // after-anchor first (processed last), then anchor line, then before-anchor (processed first)
            stack.push({ type: 'region', oldStart: anchor.oldIndex + 1, oldEnd: oe, newStart: anchor.newIndex + 1, newEnd: ne });
            stack.push({ type: 'line', entry: { type: 'unchanged', content: anchor.line } });
            stack.push({ type: 'region', oldStart: os, oldEnd: anchor.oldIndex, newStart: ns, newEnd: anchor.newIndex });
        }
    },

    /**
     * Find the best anchor line using histogram approach
     * Prefers lines with low occurrence count (unique lines are best)
     */
    _findAnchor(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, ignoreWS) {
        // Build histogram for old region. Key is normalized content when ignoring whitespace.
        const oldHist = new Map();
        for (let i = oldStart; i < oldEnd; i++) {
            const key = ignoreWS ? this._normalizeWS(oldLines[i]) : oldLines[i];
            if (!oldHist.has(key)) {
                oldHist.set(key, { count: 0, indices: [] });
            }
            const entry = oldHist.get(key);
            entry.count++;
            entry.indices.push(i);
        }

        // Find best anchor: line that exists in both with lowest combined count
        let bestAnchor = null;
        let bestScore = Infinity;

        // Build histogram for new region and find matches
        const newHist = new Map();
        for (let j = newStart; j < newEnd; j++) {
            const key = ignoreWS ? this._normalizeWS(newLines[j]) : newLines[j];
            if (!newHist.has(key)) {
                newHist.set(key, { count: 0, indices: [] });
            }
            const entry = newHist.get(key);
            entry.count++;
            entry.indices.push(j);
        }

        const oldLen = oldEnd - oldStart;
        const newLen = newEnd - newStart;

        // Find line with lowest occurrence in both files.
        // Among equal-score candidates, prefer the anchor whose relative position
        // in the old region is closest to its relative position in the new region.
        // This avoids picking a moved line as anchor (it would have a large positional
        // delta), which would incorrectly mark all stable lines as added/removed.
        let bestPosDelta = Infinity;
        for (const [key, oldEntry] of oldHist) {
            // Skip empty or whitespace-only lines as anchors
            if (!key.trim()) continue;

            const newEntry = newHist.get(key);
            if (!newEntry) continue;

            // Score = product of occurrences (lower is better, 1 = unique in both)
            const score = oldEntry.count * newEntry.count;

            if (score <= bestScore) {
                const oldIndex = oldEntry.indices[0];
                const newIndex = newEntry.indices[0];
                const posDelta = Math.abs(
                    (oldIndex - oldStart) / oldLen - (newIndex - newStart) / newLen
                );
                if (score < bestScore || posDelta < bestPosDelta) {
                    bestScore = score;
                    bestPosDelta = posDelta;
                    // Emit new-file content so whitespace-normalized anchors show current indentation
                    bestAnchor = { line: newLines[newIndex], oldIndex, newIndex };
                }
            }
        }

        return bestAnchor;
    },

    /**
     * Simple LCS for small regions - O(n*m) but fine for small inputs
     */
    _simpleLCS(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result, ignoreWS) {
        const m = oldEnd - oldStart;
        const n = newEnd - newStart;

        // Build LCS table
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (this._eq(oldLines[oldStart + i - 1], newLines[newStart + j - 1], ignoreWS)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build diff (collect in reverse, then add to result).
        // Use new-file content for unchanged lines (correct indentation when ignoring whitespace).
        const localDiff = [];
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && this._eq(oldLines[oldStart + i - 1], newLines[newStart + j - 1], ignoreWS)) {
                localDiff.push({ type: 'unchanged', content: newLines[newStart + j - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                localDiff.push({ type: 'added', content: newLines[newStart + j - 1] });
                j--;
            } else {
                localDiff.push({ type: 'removed', content: oldLines[oldStart + i - 1] });
                i--;
            }
        }

        // Reverse and add to result
        for (let k = localDiff.length - 1; k >= 0; k--) {
            result.push(localDiff[k]);
        }
    },

    /**
     * Count added and removed lines (for stats)
     * @param {string} oldText - Original text
     * @param {string} newText - New text
     * @param {object} [options] - Same options as diff()
     * @returns {{added: number, removed: number}}
     */
    stats(oldText, newText, options = {}) {
        const diff = this.diff(oldText, newText, options);
        let added = 0, removed = 0;
        for (const entry of diff) {
            if (entry.type === 'added') added++;
            else if (entry.type === 'removed') removed++;
        }
        return { added, removed };
    }
};

// Export for use in HTML files
if (typeof window !== 'undefined') {
    window.HistogramDiff = HistogramDiff;
}

// Export for use in Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistogramDiff;
}
