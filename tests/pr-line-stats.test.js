import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals
globalThis.HistogramDiff = {
    stats: (oldText, newText) => {
        // Simple real implementation for testing
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        let added = 0, removed = 0;
        // Naive: count lines in new not in old as added, lines in old not in new as removed
        const oldSet = new Set(oldLines);
        const newSet = new Set(newLines);
        for (const l of newLines) if (!oldSet.has(l)) added++;
        for (const l of oldLines) if (!newSet.has(l)) removed++;
        return { added, removed };
    },
};
globalThis.PRThreadsUtils = {
    getLineStatsCacheKey: vi.fn((config, prId, iterCount) => `linestats_${config.serverUrl}_${prId}_${iterCount}`),
};

// Mock localStorage
const store = {};
globalThis.localStorage = {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
};

const { computeLineDiff, getCachedLineStats, setCachedLineStats, getLineStatsCacheKey } =
    await import('../js/pr-line-stats.js');

describe('computeLineDiff', () => {
    it('returns zero stats for identical content', () => {
        const result = computeLineDiff('hello\nworld', 'hello\nworld');
        expect(result.added).toBe(0);
        expect(result.removed).toBe(0);
    });

    it('detects added lines', () => {
        const result = computeLineDiff('a', 'a\nb');
        expect(result.added).toBeGreaterThan(0);
        expect(result.removed).toBe(0);
    });

    it('detects removed lines', () => {
        const result = computeLineDiff('a\nb', 'a');
        expect(result.added).toBe(0);
        expect(result.removed).toBeGreaterThan(0);
    });

    it('detects both added and removed lines', () => {
        const result = computeLineDiff('old line', 'new line');
        expect(result.added).toBeGreaterThan(0);
        expect(result.removed).toBeGreaterThan(0);
    });
});

describe('getLineStatsCacheKey', () => {
    it('delegates to PRThreadsUtils.getLineStatsCacheKey', () => {
        const config = { serverUrl: 'https://dev.azure.com' };
        const result = getLineStatsCacheKey(config, 42, 5);
        expect(PRThreadsUtils.getLineStatsCacheKey).toHaveBeenCalledWith(config, 42, 5);
        expect(result).toBe('linestats_https://dev.azure.com_42_5');
    });
});

describe('getCachedLineStats / setCachedLineStats', () => {
    beforeEach(() => {
        Object.keys(store).forEach(k => delete store[k]);
        localStorage.getItem.mockClear();
        localStorage.setItem.mockClear();
    });

    it('returns null when no cache entry exists', () => {
        expect(getCachedLineStats('missing-key')).toBeNull();
    });

    it('round-trips stats through cache', () => {
        setCachedLineStats('test-key', { added: 10, removed: 5 });
        const result = getCachedLineStats('test-key');
        expect(result).toEqual({ added: 10, removed: 5 });
    });

    it('returns null for invalid JSON in cache', () => {
        store['bad-key'] = 'not valid json{{{';
        expect(getCachedLineStats('bad-key')).toBeNull();
    });
});
