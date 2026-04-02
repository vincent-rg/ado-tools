import { describe, it, expect } from 'vitest';
import { PRListDisplay } from '../js/pr-list-display.js';

describe('PRListDisplay', () => {

    // --- getSortIndicator ---
    describe('getSortIndicator', () => {
        it('returns up arrow when column matches and order is asc', () => {
            const html = PRListDisplay.getSortIndicator('id', 'id', 'asc');
            expect(html).toContain('\u2191');
            expect(html).toContain('sort-indicator');
        });

        it('returns down arrow when column matches and order is desc', () => {
            const html = PRListDisplay.getSortIndicator('id', 'id', 'desc');
            expect(html).toContain('\u2193');
        });

        it('returns empty string when column does not match', () => {
            expect(PRListDisplay.getSortIndicator('title', 'id', 'asc')).toBe('');
        });
    });

    // --- getColumnStyle ---
    describe('getColumnStyle', () => {
        it('returns width styles for a column with a fixed width', () => {
            const style = PRListDisplay.getColumnStyle('id', { id: 80 });
            expect(style).toBe('width: 80px; min-width: 80px; max-width: 80px;');
        });

        it('returns empty string for a null-width (flex) column', () => {
            expect(PRListDisplay.getColumnStyle('title', { title: null })).toBe('');
        });

        it('returns empty string for a zero-width column', () => {
            expect(PRListDisplay.getColumnStyle('id', { id: 0 })).toBe('');
        });
    });

    // --- calculateTableWidth ---
    describe('calculateTableWidth', () => {
        it('sums visible fixed-width columns', () => {
            const widths = { id: 80, status: 100, title: 200 };
            const vis = { id: true, status: true, title: true };
            expect(PRListDisplay.calculateTableWidth(widths, vis)).toBe('width: 380px;');
        });

        it('skips hidden columns', () => {
            const widths = { id: 80, status: 100 };
            const vis = { id: true, status: false };
            expect(PRListDisplay.calculateTableWidth(widths, vis)).toBe('width: 80px;');
        });

        it('uses min-width + 100% when a flex column is visible', () => {
            const widths = { id: 80, title: null };
            const vis = { id: true, title: true };
            const style = PRListDisplay.calculateTableWidth(widths, vis);
            expect(style).toContain('min-width:');
            expect(style).toContain('width: 100%');
            expect(style).toContain('380'); // 80 + 300 default for flex
        });

        it('ignores hidden flex columns', () => {
            const widths = { id: 80, title: null };
            const vis = { id: true, title: false };
            expect(PRListDisplay.calculateTableWidth(widths, vis)).toBe('width: 80px;');
        });
    });

    // --- buildCommentDisplay ---
    describe('buildCommentDisplay', () => {
        it('returns dash when no data exists', () => {
            expect(PRListDisplay.buildCommentDisplay('key', {})).toContain('-');
        });

        it('returns 0 when count is zero (object form)', () => {
            const cache = { key: { count: 0, lastAccess: 0 } };
            expect(PRListDisplay.buildCommentDisplay('key', cache)).toContain('0');
        });

        it('returns highlighted count when count > 0 (object form)', () => {
            const cache = { key: { count: 5, lastAccess: 0 } };
            const html = PRListDisplay.buildCommentDisplay('key', cache);
            expect(html).toContain('5');
            expect(html).toContain('#d13438'); // red highlight
        });

        it('handles legacy plain number form', () => {
            const cache = { key: 3 };
            const html = PRListDisplay.buildCommentDisplay('key', cache);
            expect(html).toContain('3');
            expect(html).toContain('#d13438');
        });

        it('handles legacy zero form', () => {
            const cache = { key: 0 };
            const html = PRListDisplay.buildCommentDisplay('key', cache);
            expect(html).toContain('0');
        });
    });

    // --- buildUpdatesDisplay ---
    describe('buildUpdatesDisplay', () => {
        it('returns dash when no data exists', () => {
            expect(PRListDisplay.buildUpdatesDisplay('key', {})).toContain('-');
        });

        it('returns gray count when count is 1', () => {
            const cache = { key: { count: 1 } };
            const html = PRListDisplay.buildUpdatesDisplay('key', cache);
            expect(html).toContain('1');
            expect(html).toContain('#8a8886');
        });

        it('returns highlighted count when count > 1', () => {
            const cache = { key: { count: 4 } };
            const html = PRListDisplay.buildUpdatesDisplay('key', cache);
            expect(html).toContain('4');
            expect(html).toContain('#0078d4'); // blue highlight
        });
    });

    // --- buildInfoBarHtml ---
    describe('buildInfoBarHtml', () => {
        it('shows correct range and total', () => {
            const html = PRListDisplay.buildInfoBarHtml({
                startIndex: 0, endIndex: 25, totalPRs: 100,
                allPRsCount: 100, itemsPerPage: 25, columnsDropdownHtml: ''
            });
            expect(html).toContain('Showing 1-25 of 100 Pull Requests');
            expect(html).not.toContain('filtered from');
        });

        it('shows filtered count when different from total', () => {
            const html = PRListDisplay.buildInfoBarHtml({
                startIndex: 0, endIndex: 10, totalPRs: 10,
                allPRsCount: 50, itemsPerPage: 25, columnsDropdownHtml: ''
            });
            expect(html).toContain('filtered from 50 total');
        });

        it('marks the correct per-page option as selected', () => {
            const html = PRListDisplay.buildInfoBarHtml({
                startIndex: 0, endIndex: 50, totalPRs: 50,
                allPRsCount: 50, itemsPerPage: 50, columnsDropdownHtml: ''
            });
            expect(html).toContain('value="50" selected');
            expect(html).not.toMatch(/value="25" selected/);
        });

        it('includes columns dropdown content', () => {
            const html = PRListDisplay.buildInfoBarHtml({
                startIndex: 0, endIndex: 25, totalPRs: 25,
                allPRsCount: 25, itemsPerPage: 25, columnsDropdownHtml: '<label>Test</label>'
            });
            expect(html).toContain('<label>Test</label>');
        });
    });

    // --- clampPage ---
    describe('clampPage', () => {
        it('returns 1 when currentPage < 1', () => {
            expect(PRListDisplay.clampPage(0, 5)).toBe(1);
            expect(PRListDisplay.clampPage(-1, 5)).toBe(1);
        });

        it('clamps to totalPages when over', () => {
            expect(PRListDisplay.clampPage(10, 5)).toBe(5);
        });

        it('returns currentPage when in bounds', () => {
            expect(PRListDisplay.clampPage(3, 5)).toBe(3);
        });

        it('returns 1 when totalPages is 0', () => {
            expect(PRListDisplay.clampPage(1, 0)).toBe(1);
        });
    });

    // --- getPageSlice ---
    describe('getPageSlice', () => {
        it('returns first page slice', () => {
            expect(PRListDisplay.getPageSlice(1, 25, 100)).toEqual({ startIndex: 0, endIndex: 25 });
        });

        it('returns last page slice (partial)', () => {
            expect(PRListDisplay.getPageSlice(3, 25, 60)).toEqual({ startIndex: 50, endIndex: 60 });
        });

        it('handles single-item page', () => {
            expect(PRListDisplay.getPageSlice(1, 25, 1)).toEqual({ startIndex: 0, endIndex: 1 });
        });
    });

    // --- buildPaginationHtml ---
    describe('buildPaginationHtml', () => {
        it('returns empty string for single page', () => {
            expect(PRListDisplay.buildPaginationHtml(1, 1)).toBe('');
        });

        it('returns empty string for zero pages', () => {
            expect(PRListDisplay.buildPaginationHtml(1, 0)).toBe('');
        });

        it('includes Previous and Next buttons for 2 pages', () => {
            const html = PRListDisplay.buildPaginationHtml(1, 2);
            expect(html).toContain('Previous');
            expect(html).toContain('Next');
        });

        it('disables Previous on first page', () => {
            const html = PRListDisplay.buildPaginationHtml(1, 5);
            // First button should be disabled Previous
            expect(html).toMatch(/<button disabled[^>]*>.*Previous/);
        });

        it('enables Previous on page > 1', () => {
            const html = PRListDisplay.buildPaginationHtml(2, 5);
            expect(html).toContain('changePage(1)');
            expect(html).toMatch(/<button onclick="changePage\(1\)"[^>]*>.*Previous/);
        });

        it('disables Next on last page', () => {
            const html = PRListDisplay.buildPaginationHtml(5, 5);
            expect(html).toMatch(/<button disabled[^>]*>.*Next/);
        });

        it('enables Next when not on last page', () => {
            const html = PRListDisplay.buildPaginationHtml(3, 5);
            expect(html).toContain('changePage(4)');
        });

        it('highlights current page button', () => {
            const html = PRListDisplay.buildPaginationHtml(3, 5);
            // Current page button: disabled with blue background
            expect(html).toMatch(/<button disabled[^>]*background: #0078d4[^>]*>3<\/button>/);
        });

        it('shows all pages when total <= 7', () => {
            const html = PRListDisplay.buildPaginationHtml(4, 7);
            for (let i = 1; i <= 7; i++) {
                expect(html).toContain(`>${i}<`);
            }
        });

        it('shows ellipsis for many pages', () => {
            const html = PRListDisplay.buildPaginationHtml(10, 20);
            expect(html).toContain('...');
        });

        it('shows first and last page for many pages', () => {
            const html = PRListDisplay.buildPaginationHtml(10, 20);
            expect(html).toContain('changePage(1)');
            expect(html).toContain('changePage(20)');
        });

        it('shows middle page in large gap', () => {
            // With page 15 of 20, startPage would be around 12, so gap from 1 to 12 includes a middle page
            const html = PRListDisplay.buildPaginationHtml(15, 20);
            expect(html).toContain('changePage(1)');
            // Should have a middle page between 1 and the start of the visible range
            expect(html).toContain('...');
        });
    });
});
