/**
 * Histogram Diff Algorithm
 *
 * Similar to Git's histogram diff - finds low-occurrence lines as anchors
 * and recursively diffs regions between them. Produces clean, readable diffs
 * that respect logical code boundaries.
 */

const HistogramDiff = {
    /**
     * Compute a line-by-line diff between two texts
     * @param {string} oldText - Original text
     * @param {string} newText - New text
     * @returns {Array} Array of {type: 'unchanged'|'added'|'removed', content: string, oldLine?: number, newLine?: number}
     */
    diff(oldText, newText) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        return this.diffLines(oldLines, newLines);
    },

    /**
     * Compute a line-by-line diff between two arrays of lines
     * @param {string[]} oldLines - Original lines
     * @param {string[]} newLines - New lines
     * @returns {Array} Diff entries with type, content, and line numbers
     */
    diffLines(oldLines, newLines) {
        const diff = [];
        this._diffRegion(oldLines, 0, oldLines.length, newLines, 0, newLines.length, diff);

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
     * Recursively diff a region using histogram algorithm
     */
    _diffRegion(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result) {
        // Base case: empty regions
        if (oldStart >= oldEnd && newStart >= newEnd) {
            return;
        }

        // All old lines removed
        if (oldStart >= oldEnd) {
            for (let j = newStart; j < newEnd; j++) {
                result.push({ type: 'added', content: newLines[j] });
            }
            return;
        }

        // All new lines added
        if (newStart >= newEnd) {
            for (let i = oldStart; i < oldEnd; i++) {
                result.push({ type: 'removed', content: oldLines[i] });
            }
            return;
        }

        // Small region: use simple LCS
        const oldLen = oldEnd - oldStart;
        const newLen = newEnd - newStart;
        if (oldLen + newLen <= 10) {
            this._simpleLCS(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result);
            return;
        }

        // Build histogram and find best anchor
        const anchor = this._findAnchor(oldLines, oldStart, oldEnd, newLines, newStart, newEnd);

        if (!anchor) {
            // No good anchor found, fall back to LCS
            this._simpleLCS(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result);
            return;
        }

        // Recursively diff regions before and after anchor
        this._diffRegion(oldLines, oldStart, anchor.oldIndex, newLines, newStart, anchor.newIndex, result);
        result.push({ type: 'unchanged', content: anchor.line });
        this._diffRegion(oldLines, anchor.oldIndex + 1, oldEnd, newLines, anchor.newIndex + 1, newEnd, result);
    },

    /**
     * Find the best anchor line using histogram approach
     * Prefers lines with low occurrence count (unique lines are best)
     */
    _findAnchor(oldLines, oldStart, oldEnd, newLines, newStart, newEnd) {
        // Build histogram for old region
        const oldHist = new Map();
        for (let i = oldStart; i < oldEnd; i++) {
            const line = oldLines[i];
            if (!oldHist.has(line)) {
                oldHist.set(line, { count: 0, indices: [] });
            }
            const entry = oldHist.get(line);
            entry.count++;
            entry.indices.push(i);
        }

        // Find best anchor: line that exists in both with lowest combined count
        let bestAnchor = null;
        let bestScore = Infinity;

        // Build histogram for new region and find matches
        const newHist = new Map();
        for (let j = newStart; j < newEnd; j++) {
            const line = newLines[j];
            if (!newHist.has(line)) {
                newHist.set(line, { count: 0, indices: [] });
            }
            const entry = newHist.get(line);
            entry.count++;
            entry.indices.push(j);
        }

        // Find line with lowest occurrence in both files
        for (const [line, oldEntry] of oldHist) {
            // Skip empty or whitespace-only lines as anchors
            if (!line.trim()) continue;

            const newEntry = newHist.get(line);
            if (!newEntry) continue;

            // Score = product of occurrences (lower is better, 1 = unique in both)
            const score = oldEntry.count * newEntry.count;

            if (score < bestScore) {
                bestScore = score;
                // Use first occurrence in each
                bestAnchor = {
                    line,
                    oldIndex: oldEntry.indices[0],
                    newIndex: newEntry.indices[0]
                };
            }

            // Perfect anchor found (unique in both)
            if (score === 1) break;
        }

        return bestAnchor;
    },

    /**
     * Simple LCS for small regions - O(n*m) but fine for small inputs
     */
    _simpleLCS(oldLines, oldStart, oldEnd, newLines, newStart, newEnd, result) {
        const m = oldEnd - oldStart;
        const n = newEnd - newStart;

        // Build LCS table
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[oldStart + i - 1] === newLines[newStart + j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build diff (collect in reverse, then add to result)
        const localDiff = [];
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[oldStart + i - 1] === newLines[newStart + j - 1]) {
                localDiff.push({ type: 'unchanged', content: oldLines[oldStart + i - 1] });
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
     * @returns {{added: number, removed: number}}
     */
    stats(oldText, newText) {
        const diff = this.diff(oldText, newText);
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
