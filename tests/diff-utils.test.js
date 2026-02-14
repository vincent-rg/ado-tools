import { describe, it, expect, beforeAll } from 'vitest';
import DiffUtils from '../diff-utils.js';
import HistogramDiff from '../diff.js';
import { ADOContent } from '../common.js';
import { makeRightThread, makeLeftThread } from './helpers/mock-data.js';

beforeAll(() => {
    DiffUtils.init(ADOContent.escapeHtml.bind(ADOContent));
});

describe('cropDiffToRegion', () => {
    const diff = HistogramDiff.diff('a\nb\nc\nd\ne\nf\ng\nh\ni\nj', 'a\nb\nX\nd\ne\nf\ng\nh\ni\nj');
    // c is removed (oldLine=3), X is added (newLine=3), rest unchanged

    it('crops to region around a line with context', () => {
        const cropped = DiffUtils.cropDiffToRegion(diff, 3, 3, true, 2);
        // Should include lines 1-5 on right side (3-2=1, 3+2=5)
        expect(cropped.length).toBeGreaterThan(0);
        const newLines = cropped.filter(e => e.newLine !== undefined).map(e => e.newLine);
        expect(Math.min(...newLines)).toBeLessThanOrEqual(3);
    });

    it('returns empty array when region not found', () => {
        const cropped = DiffUtils.cropDiffToRegion(diff, 100, 100, true, 2);
        expect(cropped).toEqual([]);
    });

    it('uses left side line numbers when useRight is false', () => {
        const cropped = DiffUtils.cropDiffToRegion(diff, 3, 3, false, 1);
        expect(cropped.length).toBeGreaterThan(0);
    });

    it('defaults to 5 context lines', () => {
        const cropped = DiffUtils.cropDiffToRegion(diff, 5, 5, true);
        // Should include a wide region (lines 1-10 roughly)
        expect(cropped.length).toBeGreaterThan(3);
    });
});

describe('buildThreadRange', () => {
    it('extracts range from right-side thread', () => {
        const thread = makeRightThread(10, 15, 5, 20);
        const range = DiffUtils.buildThreadRange(thread, 1, 3);
        expect(range.startLine).toBe(10);
        expect(range.endLine).toBe(15);
        expect(range.startOffset).toBe(5);
        expect(range.endOffset).toBe(20);
        expect(range.useRight).toBe(true);
        expect(range.appliesToView).toBe(true);
    });

    it('extracts range from left-side thread', () => {
        const thread = makeLeftThread(5, 8);
        const range = DiffUtils.buildThreadRange(thread, 1, 3);
        expect(range.startLine).toBe(5);
        expect(range.endLine).toBe(8);
        expect(range.useRight).toBe(false);
    });

    it('marks thread as not applicable when outside iteration range', () => {
        const thread = makeRightThread(1, 1, 0, 0, 5); // iteration 5
        const range = DiffUtils.buildThreadRange(thread, 1, 3); // viewing 1-3
        expect(range.appliesToView).toBe(false);
    });

    it('marks thread as applicable when no iteration context', () => {
        const thread = makeRightThread(1, 1);
        delete thread.pullRequestThreadContext;
        const range = DiffUtils.buildThreadRange(thread, 1, 3);
        expect(range.appliesToView).toBe(true);
    });

    it('uses startLine as endLine fallback', () => {
        const thread = {
            id: 1,
            threadContext: {
                filePath: '/test.js',
                rightFileStart: { line: 7 },
                // no rightFileEnd
            },
        };
        const range = DiffUtils.buildThreadRange(thread, 1, 5);
        expect(range.startLine).toBe(7);
        expect(range.endLine).toBe(7);
    });
});

describe('applyThreadHighlight', () => {
    it('highlights entire line when no offsets', () => {
        const tr = { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0, useRight: true, appliesToView: true };
        const html = DiffUtils.applyThreadHighlight('hello world', 1, tr);
        expect(html).toContain('<mark');
        expect(html).toContain('hello world');
    });

    it('highlights substring when offsets are set', () => {
        const tr = { startLine: 1, endLine: 1, startOffset: 2, endOffset: 6, useRight: true, appliesToView: true };
        const html = DiffUtils.applyThreadHighlight('hello world', 1, tr);
        // Offsets are 1-based, adjusted: start=1, end=5 => "ello"
        expect(html).toContain('<mark');
        expect(html).toContain('ello');
    });

    it('returns escaped content when not applicable', () => {
        const tr = { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0, useRight: true, appliesToView: false };
        const html = DiffUtils.applyThreadHighlight('<b>test</b>', 1, tr);
        expect(html).not.toContain('<mark');
        expect(html).toContain('&lt;b&gt;');
    });

    it('returns escaped content when line out of range', () => {
        const tr = { startLine: 5, endLine: 5, startOffset: 0, endOffset: 0, useRight: true, appliesToView: true };
        const html = DiffUtils.applyThreadHighlight('hello', 1, tr);
        expect(html).not.toContain('<mark');
    });
});

describe('getHighlightedContent', () => {
    it('highlights when thread matches right side', () => {
        const threadRanges = [
            { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0, useRight: true, appliesToView: true },
        ];
        const result = DiffUtils.getHighlightedContent('code', 1, true, threadRanges);
        expect(result.commented).toBe(true);
        expect(result.html).toContain('<mark');
    });

    it('does not highlight when side does not match', () => {
        const threadRanges = [
            { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0, useRight: true, appliesToView: true },
        ];
        const result = DiffUtils.getHighlightedContent('code', 1, false, threadRanges);
        expect(result.commented).toBe(false);
    });

    it('returns escaped HTML when no thread matches', () => {
        const result = DiffUtils.getHighlightedContent('<div>', 1, true, []);
        expect(result.commented).toBe(false);
        expect(result.html).toBe('&lt;div&gt;');
    });
});

describe('renderDiffLines', () => {
    const simpleDiff = [
        { type: 'unchanged', content: 'line1', oldLine: 1, newLine: 1 },
        { type: 'removed', content: 'old', oldLine: 2 },
        { type: 'added', content: 'new', newLine: 2 },
        { type: 'unchanged', content: 'line3', oldLine: 3, newLine: 3 },
    ];

    it('renders unified diff HTML', () => {
        const html = DiffUtils.renderDiffLines(simpleDiff, []);
        expect(html).toContain('diff-unchanged');
        expect(html).toContain('diff-removed');
        expect(html).toContain('diff-added');
        expect(html).toContain('line1');
        expect(html).toContain('old');
        expect(html).toContain('new');
    });

    it('includes line numbers', () => {
        const html = DiffUtils.renderDiffLines(simpleDiff, []);
        expect(html).toContain('>1</span>');
        expect(html).toContain('>2</span>');
    });

    it('escapes content', () => {
        const diff = [{ type: 'unchanged', content: '<script>', oldLine: 1, newLine: 1 }];
        const html = DiffUtils.renderDiffLines(diff, []);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });

    it('calls getLinePrefix and getLineSuffix callbacks', () => {
        const prefixes = [];
        const suffixes = [];
        DiffUtils.renderDiffLines(simpleDiff, [], {
            getLinePrefix: (n, o) => { prefixes.push([n, o]); return ''; },
            getLineSuffix: (n, o) => { suffixes.push([n, o]); return ''; },
        });
        expect(prefixes.length).toBe(4);
        expect(suffixes.length).toBe(4);
    });

    it('applies thread highlighting', () => {
        const threadRanges = [
            { startLine: 2, endLine: 2, startOffset: 0, endOffset: 0, useRight: true, appliesToView: true },
        ];
        const html = DiffUtils.renderDiffLines(simpleDiff, threadRanges);
        expect(html).toContain('diff-line-commented');
    });
});

describe('renderDiffLinesSideBySide', () => {
    const simpleDiff = [
        { type: 'unchanged', content: 'same', oldLine: 1, newLine: 1 },
        { type: 'removed', content: 'old', oldLine: 2 },
        { type: 'added', content: 'new', newLine: 2 },
    ];

    it('renders side-by-side HTML', () => {
        const html = DiffUtils.renderDiffLinesSideBySide(simpleDiff, []);
        expect(html).toContain('sbs-row');
        expect(html).toContain('sbs-left');
        expect(html).toContain('sbs-right');
    });

    it('pairs removed and added lines in hunks', () => {
        const html = DiffUtils.renderDiffLinesSideBySide(simpleDiff, []);
        // 'old' should be on left, 'new' on right, in the same sbs-row
        expect(html).toContain('diff-removed');
        expect(html).toContain('diff-added');
    });

    it('fills empty cells when hunk sides are unequal', () => {
        const diff = [
            { type: 'removed', content: 'a', oldLine: 1 },
            { type: 'removed', content: 'b', oldLine: 2 },
            { type: 'added', content: 'x', newLine: 1 },
        ];
        const html = DiffUtils.renderDiffLinesSideBySide(diff, []);
        expect(html).toContain('sbs-empty');
    });
});
