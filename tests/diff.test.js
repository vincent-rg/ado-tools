import { describe, it, expect } from 'vitest';
import HistogramDiff from '../diff.js';

describe('HistogramDiff', () => {
    describe('diff', () => {
        it('treats two empty strings as one unchanged empty line', () => {
            // ''.split('\n') produces [''], so there is one "line"
            const result = HistogramDiff.diff('', '');
            expect(result).toEqual([
                { type: 'unchanged', content: '', oldLine: 1, newLine: 1 },
            ]);
        });

        it('detects lines added when old is empty', () => {
            const result = HistogramDiff.diff('', 'a\nb');
            const added = result.filter(e => e.type === 'added');
            expect(added.map(e => e.content)).toEqual(expect.arrayContaining(['a', 'b']));
            // The empty line from '' is removed
            const removed = result.filter(e => e.type === 'removed');
            expect(removed.length).toBe(1);
            expect(removed[0].content).toBe('');
        });

        it('detects lines removed when new is empty', () => {
            const result = HistogramDiff.diff('a\nb', '');
            const removed = result.filter(e => e.type === 'removed');
            expect(removed.map(e => e.content)).toEqual(expect.arrayContaining(['a', 'b']));
        });

        it('detects unchanged text', () => {
            const result = HistogramDiff.diff('hello\nworld', 'hello\nworld');
            expect(result).toEqual([
                { type: 'unchanged', content: 'hello', oldLine: 1, newLine: 1 },
                { type: 'unchanged', content: 'world', oldLine: 2, newLine: 2 },
            ]);
        });

        it('detects a single line change', () => {
            const result = HistogramDiff.diff('hello\nworld', 'hello\nearth');
            const types = result.map(e => e.type);
            expect(types).toContain('unchanged');
            expect(types).toContain('removed');
            expect(types).toContain('added');

            const unchanged = result.filter(e => e.type === 'unchanged');
            expect(unchanged[0].content).toBe('hello');

            const removed = result.filter(e => e.type === 'removed');
            expect(removed[0].content).toBe('world');

            const added = result.filter(e => e.type === 'added');
            expect(added[0].content).toBe('earth');
        });

        it('handles multiline changes correctly', () => {
            const old = 'a\nb\nc\nd\ne';
            const neu = 'a\nx\ny\nd\ne';
            const result = HistogramDiff.diff(old, neu);

            const unchanged = result.filter(e => e.type === 'unchanged').map(e => e.content);
            expect(unchanged).toContain('a');
            expect(unchanged).toContain('d');
            expect(unchanged).toContain('e');

            const removed = result.filter(e => e.type === 'removed').map(e => e.content);
            expect(removed).toEqual(expect.arrayContaining(['b', 'c']));

            const added = result.filter(e => e.type === 'added').map(e => e.content);
            expect(added).toEqual(expect.arrayContaining(['x', 'y']));
        });

        it('assigns correct line numbers', () => {
            const result = HistogramDiff.diff('a\nb\nc', 'a\nx\nc');
            const a = result.find(e => e.content === 'a');
            expect(a.oldLine).toBe(1);
            expect(a.newLine).toBe(1);

            const b = result.find(e => e.content === 'b');
            expect(b.oldLine).toBe(2);
            expect(b.newLine).toBeUndefined();

            const x = result.find(e => e.content === 'x');
            expect(x.newLine).toBe(2);
            expect(x.oldLine).toBeUndefined();

            const c = result.find(e => e.content === 'c');
            expect(c.oldLine).toBe(3);
            expect(c.newLine).toBe(3);
        });

        it('handles null/undefined inputs as empty strings', () => {
            const result = HistogramDiff.diff(null, undefined);
            // Both become '' which splits to [''], yielding one unchanged empty line
            expect(result).toEqual([
                { type: 'unchanged', content: '', oldLine: 1, newLine: 1 },
            ]);
        });
    });

    describe('diffLines', () => {
        it('works with pre-split arrays', () => {
            const result = HistogramDiff.diffLines(['a', 'b'], ['a', 'c']);
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]).toEqual({ type: 'unchanged', content: 'a', oldLine: 1, newLine: 1 });
        });
    });

    describe('stats', () => {
        it('counts added and removed lines', () => {
            const result = HistogramDiff.stats('a\nb\nc', 'a\nx\ny\nc');
            expect(result.removed).toBe(1); // b
            expect(result.added).toBe(2); // x, y
        });

        it('returns zeros for identical text', () => {
            const result = HistogramDiff.stats('same', 'same');
            expect(result).toEqual({ added: 0, removed: 0 });
        });

        it('counts added and removed correctly for empty old text', () => {
            const result = HistogramDiff.stats('', 'a\nb');
            // '' splits to [''], so the empty line is "removed" and 'a','b' are added
            expect(result.added).toBe(2);
            expect(result.removed).toBe(1);
        });
    });
});
