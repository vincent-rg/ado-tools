import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals
globalThis.HistogramDiff = {
    stats: vi.fn((oldText, newText) => {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        let added = 0, removed = 0;
        const oldSet = new Set(oldLines);
        const newSet = new Set(newLines);
        for (const l of newLines) if (!oldSet.has(l)) added++;
        for (const l of oldLines) if (!newSet.has(l)) removed++;
        return { added, removed };
    }),
};
globalThis.PRThreadsUtils = {
    getLineStatsCacheKey: vi.fn(() => 'test-key'),
};
globalThis.window = globalThis.window || {};
globalThis.window._adoDebug = false;

// Mock localStorage
const store = {};
globalThis.localStorage = {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
};

// Mock fetch for fetchFileContent
globalThis.fetch = vi.fn();
globalThis.btoa = vi.fn((s) => Buffer.from(s).toString('base64'));

const { fetchLineStatsViaLocalDiff, fetchFileContent } =
    await import('../js/pr-line-stats.js');

describe('fetchFileContent', () => {
    beforeEach(() => {
        fetch.mockReset();
    });

    const config = {
        serverUrl: 'https://dev.azure.com',
        organization: 'myorg',
        project: 'myproj',
        repository: 'myrepo',
        pat: 'testpat',
    };

    it('returns text content on successful response', async () => {
        fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('file content') });
        const result = await fetchFileContent(config, '/src/foo.js', 'abc123');
        expect(result).toBe('file content');
        expect(fetch).toHaveBeenCalledTimes(1);
        const url = fetch.mock.calls[0][0];
        expect(url).toContain('path=%2Fsrc%2Ffoo.js');
        expect(url).toContain('versionDescriptor.version=abc123');
    });

    it('returns null on non-ok response', async () => {
        fetch.mockResolvedValue({ ok: false });
        const result = await fetchFileContent(config, '/src/foo.js', 'abc123');
        expect(result).toBeNull();
    });

    it('returns null on fetch error', async () => {
        fetch.mockRejectedValue(new Error('Network error'));
        const result = await fetchFileContent(config, '/src/foo.js', 'abc123');
        expect(result).toBeNull();
    });
});

describe('fetchLineStatsViaLocalDiff', () => {
    const config = {
        serverUrl: 'https://dev.azure.com',
        organization: 'myorg',
        project: 'myproj',
        repository: 'myrepo',
        pat: 'testpat',
    };
    const prData = {
        lastMergeSourceCommit: { commitId: 'target123' },
    };
    const mergeBase = 'base123';

    beforeEach(() => {
        fetch.mockReset();
        HistogramDiff.stats.mockClear();
    });

    it('returns zero stats for empty changes array', async () => {
        const result = await fetchLineStatsViaLocalDiff(config, prData, [], mergeBase);
        expect(result).toEqual({ added: 0, removed: 0 });
    });

    it('skips entries without item.path', async () => {
        const changes = [{ changeType: 'add', item: {} }, { changeType: 'add' }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result).toEqual({ added: 0, removed: 0 });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('counts lines for added files', async () => {
        fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('line1\nline2\nline3') });
        const changes = [{ changeType: 'add', item: { path: '/new-file.js' } }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result.added).toBe(3);
        expect(result.removed).toBe(0);
    });

    it('counts lines for deleted files', async () => {
        fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('a\nb\nc\nd') });
        const changes = [{ changeType: 'delete', item: { path: '/old-file.js' } }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result.added).toBe(0);
        expect(result.removed).toBe(4);
    });

    it('uses computeLineDiff for edited files', async () => {
        fetch.mockImplementation((url) => {
            if (url.includes('version=base123')) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve('old\ncontent') });
            }
            return Promise.resolve({ ok: true, text: () => Promise.resolve('new\ncontent\nadded') });
        });

        const changes = [{ changeType: 'edit', item: { path: '/file.js' } }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        // HistogramDiff.stats should have been called
        expect(HistogramDiff.stats).toHaveBeenCalled();
        expect(result.added).toBeGreaterThanOrEqual(0);
    });

    it('uses sourceServerItem as old path for renames', async () => {
        const fetchCalls = [];
        fetch.mockImplementation((url) => {
            fetchCalls.push(url);
            return Promise.resolve({ ok: true, text: () => Promise.resolve('content') });
        });

        const changes = [{
            changeType: 'rename, edit',
            item: { path: '/new-name.js' },
            sourceServerItem: '/old-name.js',
        }];
        await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);

        // Old path fetch should use sourceServerItem
        const oldPathCall = fetchCalls.find(u => u.includes('version=base123'));
        expect(oldPathCall).toContain('old-name.js');
    });

    it('handles null content for added files gracefully', async () => {
        fetch.mockResolvedValue({ ok: false });
        const changes = [{ changeType: 'add', item: { path: '/file.js' } }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result).toEqual({ added: 0, removed: 0 });
    });

    it('accumulates stats across multiple changes', async () => {
        let callCount = 0;
        fetch.mockImplementation(() => {
            callCount++;
            // First call: added file with 2 lines, second: deleted file with 3 lines
            if (callCount === 1) return Promise.resolve({ ok: true, text: () => Promise.resolve('a\nb') });
            if (callCount === 2) return Promise.resolve({ ok: true, text: () => Promise.resolve('x\ny\nz') });
            return Promise.resolve({ ok: false });
        });

        const changes = [
            { changeType: 'add', item: { path: '/new.js' } },
            { changeType: 'delete', item: { path: '/old.js' } },
        ];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result.added).toBe(2);
        expect(result.removed).toBe(3);
    });

    it('uses originalPath as fallback for old path', async () => {
        const fetchCalls = [];
        fetch.mockImplementation((url) => {
            fetchCalls.push(url);
            return Promise.resolve({ ok: true, text: () => Promise.resolve('content') });
        });

        const changes = [{
            changeType: 'rename',
            item: { path: '/new.js' },
            originalPath: '/original.js',
        }];
        await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);

        const oldPathCall = fetchCalls.find(u => u.includes('version=base123'));
        expect(oldPathCall).toContain('original.js');
    });

    it('handles changeType with mixed case', async () => {
        fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('line') });
        const changes = [{ changeType: 'Add', item: { path: '/file.js' } }];
        const result = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBase);
        expect(result.added).toBe(1);
    });
});
