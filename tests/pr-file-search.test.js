import { describe, it, expect } from 'vitest';

// Stub globals needed for module load
globalThis.fileSearchActive = false;
globalThis.fileSearchQuery = '';
globalThis.fileSearchCaseSensitive = false;
globalThis.fileSearchWholeWord = false;
globalThis.fileSearchResults = [];
globalThis.fileSearchDataResults = [];
globalThis.fileSearchIndex = -1;
globalThis.fileSearchHitLineIndices = [];
globalThis.currentDiffScroller = null;
globalThis.goToLineSide = 'new';
globalThis.diffMinimapDraw = null;
globalThis.sbsScrollSync = null;
globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => null }),
    createTextNode: (t) => ({ textContent: t }),
    createElement: () => ({ className: '', textContent: '' }),
};
globalThis.window = globalThis.window || {};
globalThis.getEffectiveDisplayMode = () => 'inline';

const { buildSearchResults, computeNextIndex, getFileSearchTotalCount } =
    await import('../js/pr-file-search.js');

// --- buildSearchResults ---

describe('buildSearchResults', () => {
    it('returns empty results for empty code rows', () => {
        const result = buildSearchResults([], () => '', /test/g);
        expect(result.dataResults).toEqual([]);
        expect(result.hitLineIndices).toEqual([]);
        expect(result.highlightMap.size).toBe(0);
    });

    it('finds matches in code rows', () => {
        const rows = [
            { index: 0 },
            { index: 1 },
            { index: 2 },
        ];
        const getText = (row) => ['hello world', 'foo bar', 'hello again'][row.index];

        const result = buildSearchResults(rows, getText, /hello/g);
        expect(result.dataResults.length).toBe(2);
        expect(result.hitLineIndices.length).toBe(2);
    });

    it('returns correct offsets for matches', () => {
        const rows = [{ index: 0 }];
        const getText = () => 'abc def abc';

        const result = buildSearchResults(rows, getText, /abc/g);
        expect(result.dataResults[0].offsets).toEqual([
            { start: 0, end: 3 },
            { start: 8, end: 11 },
        ]);
        expect(result.hitLineIndices.length).toBe(2);
    });

    it('handles case-insensitive regex', () => {
        const rows = [{ index: 0 }];
        const getText = () => 'Hello HELLO hello';

        const result = buildSearchResults(rows, getText, /hello/gi);
        expect(result.hitLineIndices.length).toBe(3);
    });

    it('handles no matches', () => {
        const rows = [{ index: 0 }, { index: 1 }];
        const getText = () => 'no match here';

        const result = buildSearchResults(rows, getText, /xyz/g);
        expect(result.dataResults).toEqual([]);
        expect(result.hitLineIndices).toEqual([]);
    });

    it('skips rows with null/empty text', () => {
        const rows = [{ index: 0 }, { index: 1 }, { index: 2 }];
        const getText = (row) => [null, '', 'hello'][row.index];

        const result = buildSearchResults(rows, getText, /hello/g);
        expect(result.dataResults.length).toBe(1);
        expect(result.dataResults[0].codeRowIdx).toBe(2);
    });

    it('builds correct highlightMap keyed by rowIndex', () => {
        const rows = [{ index: 10 }, { index: 20 }];
        const getText = (row) => row.index === 10 ? 'match' : 'no';

        const result = buildSearchResults(rows, getText, /match/g);
        expect(result.highlightMap.has(10)).toBe(true);
        expect(result.highlightMap.has(20)).toBe(false);
        expect(result.highlightMap.get(10)).toEqual([{ start: 0, end: 5 }]);
    });

    it('handles zero-length match by advancing lastIndex', () => {
        const rows = [{ index: 0 }];
        const getText = () => 'abc';

        // Empty regex matches at every position — should not infinite loop
        const result = buildSearchResults(rows, getText, /(?:)/g);
        // Should get at least 1 match but not hang
        expect(result.hitLineIndices.length).toBeGreaterThanOrEqual(1);
    });

    it('tracks codeRowIdx and rowIndex separately', () => {
        const rows = [{ index: 5 }, { index: 10 }];
        const getText = (row) => row.index === 5 ? 'match' : 'match';

        const result = buildSearchResults(rows, getText, /match/g);
        expect(result.dataResults[0].codeRowIdx).toBe(0);
        expect(result.dataResults[0].rowIndex).toBe(5);
        expect(result.dataResults[1].codeRowIdx).toBe(1);
        expect(result.dataResults[1].rowIndex).toBe(10);
    });

    it('records multiple matches per row in hitLineIndices', () => {
        const rows = [{ index: 0 }];
        const getText = () => 'aaa';

        const result = buildSearchResults(rows, getText, /a/g);
        expect(result.hitLineIndices.length).toBe(3);
        // All should reference the same visibleIdx
        expect(result.hitLineIndices.every(h => h.visibleIdx === 0)).toBe(true);
        // markIdx should be sequential
        expect(result.hitLineIndices.map(h => h.markIdx)).toEqual([0, 1, 2]);
    });
});

// --- computeNextIndex ---

describe('computeNextIndex', () => {
    it('returns -1 when total is 0', () => {
        expect(computeNextIndex(0, 1, 0)).toBe(-1);
    });

    it('advances forward', () => {
        expect(computeNextIndex(0, 1, 5)).toBe(1);
        expect(computeNextIndex(3, 1, 5)).toBe(4);
    });

    it('wraps forward (last to first)', () => {
        expect(computeNextIndex(4, 1, 5)).toBe(0);
    });

    it('goes backward', () => {
        expect(computeNextIndex(3, -1, 5)).toBe(2);
    });

    it('wraps backward (first to last)', () => {
        expect(computeNextIndex(0, -1, 5)).toBe(4);
    });

    it('handles delta of 0', () => {
        expect(computeNextIndex(2, 0, 5)).toBe(2);
    });

    it('handles single-element total', () => {
        expect(computeNextIndex(0, 1, 1)).toBe(0);
        expect(computeNextIndex(0, -1, 1)).toBe(0);
    });
});

// --- getFileSearchTotalCount ---

describe('getFileSearchTotalCount', () => {
    it('returns fileSearchResults.length when no scroller', () => {
        globalThis.currentDiffScroller = null;
        globalThis.fileSearchResults = [1, 2, 3];
        globalThis.fileSearchHitLineIndices = [1];
        expect(getFileSearchTotalCount()).toBe(3);
    });

    it('returns fileSearchHitLineIndices.length when scroller is active', () => {
        globalThis.currentDiffScroller = {}; // truthy
        globalThis.fileSearchResults = [1];
        globalThis.fileSearchHitLineIndices = [1, 2, 3, 4, 5];
        expect(getFileSearchTotalCount()).toBe(5);
    });

    it('returns 0 when both are empty', () => {
        globalThis.currentDiffScroller = null;
        globalThis.fileSearchResults = [];
        expect(getFileSearchTotalCount()).toBe(0);
    });
});
