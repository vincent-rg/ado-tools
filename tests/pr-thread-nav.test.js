import { describe, it, expect } from 'vitest';
import { sortThreadsByPosition } from '../js/pr-thread-nav.js';

describe('sortThreadsByPosition', () => {
    it('returns empty array for null input', () => {
        expect(sortThreadsByPosition(null)).toEqual([]);
    });

    it('returns empty array for empty input', () => {
        expect(sortThreadsByPosition([])).toEqual([]);
    });

    it('sorts threads by line number ascending', () => {
        const threads = [
            { id: 3, threadContext: { rightFileStart: { line: 30, offset: 1 } } },
            { id: 1, threadContext: { rightFileStart: { line: 10, offset: 1 } } },
            { id: 2, threadContext: { rightFileStart: { line: 20, offset: 1 } } },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([1, 2, 3]);
    });

    it('sorts by offset when lines are equal', () => {
        const threads = [
            { id: 2, threadContext: { rightFileStart: { line: 10, offset: 20 } } },
            { id: 1, threadContext: { rightFileStart: { line: 10, offset: 5 } } },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([1, 2]);
    });

    it('filters out deleted threads', () => {
        const threads = [
            { id: 1, threadContext: { rightFileStart: { line: 10, offset: 1 } } },
            { id: 2, isDeleted: true, threadContext: { rightFileStart: { line: 5, offset: 1 } } },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([1]);
    });

    it('filters out threads without threadContext', () => {
        const threads = [
            { id: 1, threadContext: { rightFileStart: { line: 10, offset: 1 } } },
            { id: 2 },
            { id: 3, threadContext: null },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([1]);
    });

    it('falls back to leftFileStart when rightFileStart is absent', () => {
        const threads = [
            { id: 2, threadContext: { leftFileStart: { line: 20, offset: 1 } } },
            { id: 1, threadContext: { leftFileStart: { line: 5, offset: 1 } } },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([1, 2]);
    });

    it('prefers rightFileStart over leftFileStart', () => {
        const threads = [
            { id: 1, threadContext: { rightFileStart: { line: 100, offset: 1 }, leftFileStart: { line: 1, offset: 1 } } },
            { id: 2, threadContext: { rightFileStart: { line: 50, offset: 1 } } },
        ];
        // rightFileStart is used: 50 < 100
        expect(sortThreadsByPosition(threads)).toEqual([2, 1]);
    });

    it('does not mutate the input array', () => {
        const threads = [
            { id: 2, threadContext: { rightFileStart: { line: 20, offset: 1 } } },
            { id: 1, threadContext: { rightFileStart: { line: 10, offset: 1 } } },
        ];
        const original = [...threads];
        sortThreadsByPosition(threads);
        expect(threads).toEqual(original);
    });

    it('handles single thread', () => {
        const threads = [
            { id: 42, threadContext: { rightFileStart: { line: 1, offset: 1 } } },
        ];
        expect(sortThreadsByPosition(threads)).toEqual([42]);
    });
});
