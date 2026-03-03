import { describe, it, expect, beforeAll } from 'vitest';
import DiffVirtualScroller from '../js/diff-virtual-scroller.js';
import DiffUtils from '../js/diff-utils.js';
import HistogramDiff from '../js/diff.js';
import { ADOContent } from '../js/common.js';

beforeAll(() => {
    DiffUtils.init(ADOContent.escapeHtml.bind(ADOContent));
});

function makeDiff(oldText, newText) {
    return HistogramDiff.diff(oldText, newText);
}

function makeThread(id, startLine, endLine, opts = {}) {
    const useRight = opts.side !== 'left';
    const iterationId = opts.iteration ?? 2;
    const status = opts.status;
    const ctx = useRight
        ? { rightFileStart: { line: startLine, offset: 0 }, rightFileEnd: { line: endLine, offset: 0 } }
        : { leftFileStart: { line: startLine, offset: 0 }, leftFileEnd: { line: endLine, offset: 0 } };
    return {
        id,
        status,
        threadContext: { filePath: '/test.js', ...ctx },
        pullRequestThreadContext: { iterationContext: { secondComparingIteration: iterationId } },
        comments: [{ id: 1, content: 'Comment', commentType: 'text' }],
    };
}

function buildThreadRange(thread) {
    return DiffUtils.buildThreadRange(thread, 1, 3);
}

describe('buildVirtualRows — inline mode', () => {
    it('creates one code row per diff entry for unchanged lines', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        expect(rows.length).toBe(3);
        expect(rows.every(r => r.type === 'code')).toBe(true);
        expect(rows[0].newLineNum).toBe(1);
        expect(rows[0].oldLineNum).toBe(1);
        expect(rows[2].newLineNum).toBe(3);
    });

    it('assigns correct cssClass and minimapColor for added/removed/unchanged', () => {
        const diff = makeDiff('a\nb\nc', 'a\nX\nc');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        const classes = rows.map(r => r.cssClass);
        expect(classes).toContain('diff-unchanged');
        expect(classes).toContain('diff-removed');
        expect(classes).toContain('diff-added');

        const removed = rows.find(r => r.cssClass === 'diff-removed');
        expect(removed.minimapColor).toBe('#f85149');
        const added = rows.find(r => r.cssClass === 'diff-added');
        expect(added.minimapColor).toBe('#3fb950');
        const unchanged = rows.find(r => r.cssClass === 'diff-unchanged');
        expect(unchanged.minimapColor).toBe(null);
    });

    it('assigns hunkIndex to first row of each contiguous change block', () => {
        // Two separate hunks: one at line 2, one at line 4
        const diff = makeDiff('a\nb\nc\nd\ne', 'a\nX\nc\nY\ne');
        const { rows, hunkStarts } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        expect(hunkStarts.length).toBe(2);
        // First hunk row
        const hunk0Row = rows[hunkStarts[0]];
        expect(hunk0Row.hunkIndex).not.toBeNull();
        // Second hunk row
        const hunk1Row = rows[hunkStarts[1]];
        expect(hunk1Row.hunkIndex).not.toBeNull();
    });

    it('inserts thread rows after the correct line', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const thread = makeThread(42, 2, 2);
        const tr = buildThreadRange(thread);
        const renderFn = (t, applies) => `<div class="inline-thread" data-thread-id="${t.id}"></div>`;

        const { rows, threadIdMap } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        // Thread should be after line 2
        const threadIdx = threadIdMap.get(42);
        expect(threadIdx).toBeDefined();
        expect(rows[threadIdx].type).toBe('thread');
        expect(rows[threadIdx].threadId).toBe(42);

        // The row before the thread should be the code row for line 2
        const codeRowBefore = rows[threadIdx - 1];
        expect(codeRowBefore.type).toBe('code');
        expect(codeRowBefore.newLineNum).toBe(2);
    });

    it('places file-level threads (startLine=0) at the top', () => {
        const diff = makeDiff('a\nb', 'a\nb');
        const thread = makeThread(99, 0, 0);
        // Override threadContext to have line 0
        thread.threadContext.rightFileStart.line = 0;
        thread.threadContext.rightFileEnd.line = 0;
        const tr = buildThreadRange(thread);
        const renderFn = (t) => `<div class="inline-thread" data-thread-id="${t.id}"></div>`;

        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        expect(rows[0].type).toBe('thread');
        expect(rows[0].threadId).toBe(99);
    });
});

describe('buildVirtualRows — side-by-side mode', () => {
    it('creates SBS code rows with sbsLeft and sbsRight', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'side-by-side' });
        expect(rows.length).toBe(3);
        expect(rows[0].sbsMode).toBe(true);
        expect(rows[0].sbsLeft.lineNum).toBe(1);
        expect(rows[0].sbsRight.lineNum).toBe(1);
    });

    it('pairs removed and added lines in SBS mode', () => {
        const diff = makeDiff('a\nb\nc', 'a\nX\nc');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'side-by-side' });
        // Should have 3 rows: unchanged a, paired b->X, unchanged c
        expect(rows.length).toBe(3);
        const modRow = rows[1];
        expect(modRow.sbsLeft.cssClass).toBe('diff-removed');
        expect(modRow.sbsRight.cssClass).toBe('diff-added');
        // Amber minimap color for modified
        expect(modRow.minimapColor).toBe('#e3b341');
    });

    it('handles unbalanced hunks with empty placeholder', () => {
        // Remove 2 lines, add 1 → one row has sbs-empty on right
        const diff = makeDiff('a\nb\nc\nd', 'a\nX\nd');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'side-by-side' });
        const emptyRight = rows.find(r => r.sbsMode && r.sbsRight?.cssClass === 'sbs-empty');
        expect(emptyRight).toBeDefined();
    });

    it('creates sbs-thread rows for threads', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const thread = makeThread(55, 2, 2);
        const tr = buildThreadRange(thread);
        const renderFn = (t) => `<div class="inline-thread" data-thread-id="${t.id}"></div>`;

        const { rows, threadIdMap } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'side-by-side',
            renderInlineThread: renderFn,
        });

        const threadIdx = threadIdMap.get(55);
        expect(threadIdx).toBeDefined();
        expect(rows[threadIdx].type).toBe('sbs-thread');
        expect(rows[threadIdx].rightHtml).toContain('data-thread-id="55"');
    });
});

describe('lookup maps', () => {
    it('lineNumMapRight maps new line numbers to row indices', () => {
        const diff = makeDiff('a\nb\nc\nd', 'a\nb\nc\nd');
        const { lineNumMapRight } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        expect(lineNumMapRight.get(1)).toBe(0);
        expect(lineNumMapRight.get(4)).toBe(3);
        expect(lineNumMapRight.has(5)).toBe(false);
    });

    it('lineNumMapLeft maps old line numbers to row indices', () => {
        const diff = makeDiff('a\nb\nc', 'a\nX\nY\nc');
        const { lineNumMapLeft, rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        // Old line 2 = b (removed)
        const idx = lineNumMapLeft.get(2);
        expect(idx).toBeDefined();
        expect(rows[idx].diffEntry.content).toBe('b');
    });

    it('hunkStarts lists the index of the first row per hunk', () => {
        const diff = makeDiff('a\nb\nc\nd\ne', 'a\nX\nc\nY\ne');
        const { hunkStarts, rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        expect(hunkStarts.length).toBe(2);
        for (const idx of hunkStarts) {
            expect(rows[idx].hunkIndex).not.toBeNull();
        }
    });

    it('threadIdMap maps thread IDs to row indices', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const thread = makeThread(77, 1, 1);
        const tr = buildThreadRange(thread);
        const renderFn = (t) => `<div class="inline-thread"></div>`;

        const { threadIdMap, rows } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        const idx = threadIdMap.get(77);
        expect(idx).toBeDefined();
        expect(rows[idx].type).toBe('thread');
    });
});

describe('thread collapsed state', () => {
    it('marks resolved threads as collapsed by default', () => {
        const diff = makeDiff('a\nb', 'a\nb');
        const thread = makeThread(10, 1, 1, { status: 'fixed' });
        const tr = buildThreadRange(thread);
        const renderFn = (t) => '<div class="inline-thread"></div>';

        const { rows, threadIdMap } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        const threadRow = rows[threadIdMap.get(10)];
        expect(threadRow.collapsed).toBe(true);
    });

    it('marks active threads as not collapsed by default', () => {
        const diff = makeDiff('a\nb', 'a\nb');
        const thread = makeThread(11, 1, 1, { status: 'active' });
        const tr = buildThreadRange(thread);
        const renderFn = (t) => '<div class="inline-thread"></div>';

        const { rows, threadIdMap } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        const threadRow = rows[threadIdMap.get(11)];
        expect(threadRow.collapsed).toBe(false);
    });
});

describe('row index assignment', () => {
    it('assigns sequential indices to all rows', () => {
        const diff = makeDiff('a\nb\nc', 'a\nX\nc');
        const thread = makeThread(20, 2, 2);
        const tr = buildThreadRange(thread);
        const renderFn = (t) => '<div class="inline-thread"></div>';

        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [tr], {
            mode: 'inline',
            renderInlineThread: renderFn,
        });

        for (let i = 0; i < rows.length; i++) {
            expect(rows[i].index).toBe(i);
        }
    });
});

describe('getLinePrefix callback', () => {
    it('includes prefix HTML in code row data', () => {
        const diff = makeDiff('a\nb\nc', 'a\nb\nc');
        const getLinePrefix = (newLineNum) => {
            return newLineNum === 2 ? '<span class="avatar">A</span>' : '';
        };

        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], {
            mode: 'inline',
            getLinePrefix,
        });

        expect(rows[1].prefixHtml).toBe('<span class="avatar">A</span>');
        expect(rows[0].prefixHtml).toBe('');
    });
});

describe('empty and edge cases', () => {
    it('handles empty diff', () => {
        const { rows, lineNumMapRight, hunkStarts, threadIdMap } = DiffVirtualScroller.buildVirtualRows(
            [], [], { mode: 'inline' }
        );
        expect(rows.length).toBe(0);
        expect(lineNumMapRight.size).toBe(0);
        expect(hunkStarts.length).toBe(0);
        expect(threadIdMap.size).toBe(0);
    });

    it('handles single line diff', () => {
        const diff = makeDiff('a', 'a');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        expect(rows.length).toBe(1);
        expect(rows[0].newLineNum).toBe(1);
    });

    it('handles all-added diff', () => {
        const diff = makeDiff('', 'a\nb\nc');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        // All rows should be code rows, and at least some should be diff-added
        const addedRows = rows.filter(r => r.cssClass === 'diff-added');
        expect(addedRows.length).toBeGreaterThan(0);
        expect(rows.every(r => r.type === 'code')).toBe(true);
    });

    it('handles all-removed diff', () => {
        const diff = makeDiff('a\nb\nc', '');
        const { rows } = DiffVirtualScroller.buildVirtualRows(diff, [], { mode: 'inline' });
        const removedRows = rows.filter(r => r.cssClass === 'diff-removed');
        expect(removedRows.length).toBeGreaterThan(0);
        expect(rows.every(r => r.type === 'code')).toBe(true);
    });
});
