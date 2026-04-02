import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing
globalThis.columnWidths = {};
globalThis.columnVisibility = {};
globalThis.displayPRs = vi.fn();
globalThis.document = {
    getElementById: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
};

const {
    DEFAULT_COLUMN_WIDTHS,
    COLUMN_LABELS,
    HIDEABLE_COLUMNS,
    saveColumnWidths,
    loadColumnWidths,
    saveColumnVisibility,
    loadColumnVisibility,
    toggleColumnVisibility,
    updateTableWidth,
} = await import('../js/pr-list-columns.js');

describe('pr-list-columns', () => {
    describe('constants', () => {
        it('DEFAULT_COLUMN_WIDTHS has expected columns', () => {
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('id', 80);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('title', null);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('author', 60);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('repository', 200);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('reviewers', 120);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('otherAuthors', 120);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('status', 100);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('updates', 70);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('comments', 90);
            expect(DEFAULT_COLUMN_WIDTHS).toHaveProperty('created', 150);
        });

        it('COLUMN_LABELS covers all columns in DEFAULT_COLUMN_WIDTHS', () => {
            const widthKeys = Object.keys(DEFAULT_COLUMN_WIDTHS);
            const labelKeys = Object.keys(COLUMN_LABELS);
            expect(labelKeys.sort()).toEqual(widthKeys.sort());
        });

        it('HIDEABLE_COLUMNS does not include id', () => {
            expect(HIDEABLE_COLUMNS).not.toContain('id');
        });

        it('HIDEABLE_COLUMNS includes all columns except id', () => {
            const expected = Object.keys(COLUMN_LABELS).filter(k => k !== 'id').sort();
            expect([...HIDEABLE_COLUMNS].sort()).toEqual(expected);
        });
    });

    describe('saveColumnWidths / loadColumnWidths', () => {
        let storage;

        beforeEach(() => {
            storage = {};
            globalThis.localStorage = {
                getItem: vi.fn((key) => storage[key] ?? null),
                setItem: vi.fn((key, value) => { storage[key] = value; }),
            };
            globalThis.columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
        });

        it('saves column widths to localStorage', () => {
            globalThis.columnWidths = { ...DEFAULT_COLUMN_WIDTHS, id: 120 };
            saveColumnWidths();
            expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
                'prListColumnWidths',
                expect.any(String)
            );
            const saved = JSON.parse(storage['prListColumnWidths']);
            expect(saved.id).toBe(120);
        });

        it('loads column widths from localStorage', () => {
            storage['prListColumnWidths'] = JSON.stringify({ id: 120, title: 300 });
            loadColumnWidths();
            expect(globalThis.columnWidths.id).toBe(120);
            expect(globalThis.columnWidths.title).toBe(300);
            // Defaults preserved for unspecified columns
            expect(globalThis.columnWidths.author).toBe(DEFAULT_COLUMN_WIDTHS.author);
        });

        it('falls back to defaults when localStorage is empty', () => {
            loadColumnWidths();
            expect(globalThis.columnWidths).toEqual(DEFAULT_COLUMN_WIDTHS);
        });

        it('falls back to defaults when localStorage has invalid JSON', () => {
            storage['prListColumnWidths'] = 'not-json';
            loadColumnWidths();
            expect(globalThis.columnWidths).toEqual(DEFAULT_COLUMN_WIDTHS);
        });
    });

    describe('saveColumnVisibility / loadColumnVisibility', () => {
        let storage;

        beforeEach(() => {
            storage = {};
            globalThis.localStorage = {
                getItem: vi.fn((key) => storage[key] ?? null),
                setItem: vi.fn((key, value) => { storage[key] = value; }),
            };
            globalThis.columnVisibility = Object.fromEntries(
                Object.keys(COLUMN_LABELS).map(k => [k, true])
            );
        });

        it('saves column visibility to localStorage', () => {
            globalThis.columnVisibility.author = false;
            saveColumnVisibility();
            const saved = JSON.parse(storage['prListColumnVisibility']);
            expect(saved.author).toBe(false);
            expect(saved.title).toBe(true);
        });

        it('loads column visibility from localStorage', () => {
            storage['prListColumnVisibility'] = JSON.stringify({ author: false, status: false });
            loadColumnVisibility();
            expect(globalThis.columnVisibility.author).toBe(false);
            expect(globalThis.columnVisibility.status).toBe(false);
            expect(globalThis.columnVisibility.title).toBe(true);
        });

        it('always keeps id visible', () => {
            storage['prListColumnVisibility'] = JSON.stringify({ id: false });
            loadColumnVisibility();
            expect(globalThis.columnVisibility.id).toBe(true);
        });
    });

    describe('toggleColumnVisibility', () => {
        let storage;

        beforeEach(() => {
            storage = {};
            globalThis.localStorage = {
                getItem: vi.fn((key) => storage[key] ?? null),
                setItem: vi.fn((key, value) => { storage[key] = value; }),
            };
            globalThis.columnVisibility = Object.fromEntries(
                Object.keys(COLUMN_LABELS).map(k => [k, true])
            );
            globalThis.displayPRs = vi.fn();
            globalThis.document.getElementById = vi.fn(() => null);
        });

        it('toggles column off', () => {
            toggleColumnVisibility('author');
            expect(globalThis.columnVisibility.author).toBe(false);
        });

        it('toggles column back on', () => {
            globalThis.columnVisibility.author = false;
            toggleColumnVisibility('author');
            expect(globalThis.columnVisibility.author).toBe(true);
        });

        it('refuses to hide id column', () => {
            toggleColumnVisibility('id');
            expect(globalThis.columnVisibility.id).toBe(true);
        });

        it('calls displayPRs after toggle', () => {
            toggleColumnVisibility('status');
            expect(globalThis.displayPRs).toHaveBeenCalled();
        });

        it('saves to localStorage after toggle', () => {
            toggleColumnVisibility('comments');
            expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
                'prListColumnVisibility',
                expect.any(String)
            );
        });
    });

    describe('updateTableWidth', () => {
        it('sets fixed width when all columns have widths', () => {
            globalThis.columnWidths = { id: 80, title: 300, author: 60 };
            const table = { style: {} };
            updateTableWidth(table);
            expect(table.style.width).toBe('440px');
            expect(table.style.minWidth).toBe('');
        });

        it('sets min-width + 100% when a column has null width (flex)', () => {
            globalThis.columnWidths = { id: 80, title: null, author: 60 };
            const table = { style: {} };
            updateTableWidth(table);
            // null column gets 300 default
            expect(table.style.minWidth).toBe('440px');
            expect(table.style.width).toBe('100%');
        });
    });
});
