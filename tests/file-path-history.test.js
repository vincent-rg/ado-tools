import { describe, it, expect, beforeAll } from 'vitest';
import DiffUtils from '../diff-utils.js';
import { ADOContent } from '../common.js';
import { iterations, changesByIteration } from './helpers/mock-data.js';

beforeAll(() => {
    DiffUtils.init(ADOContent.escapeHtml.bind(ADOContent));
});

function makeDeps(cache) {
    return {
        iterations,
        cache: cache || new Map(),
        getChanges: async (iterationId) => changesByIteration[iterationId] || [],
    };
}

describe('buildFilePathHistory', () => {
    it('tracks rename from old.js to new.js across iterations', async () => {
        const deps = makeDeps();
        const history = await DiffUtils.buildFilePathHistory('/src/new.js', 2, deps);

        // Backward walk: at iteration 2 (the known one), the rename TO /src/new.js
        // FROM /src/old.js is found, so iteration 2 maps to /src/old.js (pre-rename path)
        expect(history.get(1)).toBe('/src/old.js');
        expect(history.get(2)).toBe('/src/old.js');
        // Forward walk: iteration 3 has no rename, keeps /src/new.js
        expect(history.get(3)).toBe('/src/new.js');
    });

    it('returns same path for all iterations when no renames', async () => {
        const noRenameChanges = {
            1: [{ item: { path: '/src/file.js' }, changeType: 'edit' }],
            2: [{ item: { path: '/src/file.js' }, changeType: 'edit' }],
            3: [{ item: { path: '/src/file.js' }, changeType: 'edit' }],
        };
        const deps = {
            iterations,
            cache: new Map(),
            getChanges: async (id) => noRenameChanges[id] || [],
        };

        const history = await DiffUtils.buildFilePathHistory('/src/file.js', 1, deps);
        for (const it of iterations) {
            expect(history.get(it.id)).toBe('/src/file.js');
        }
    });

    it('caches results and returns from cache on second call', async () => {
        const cache = new Map();
        const deps = makeDeps(cache);

        const result1 = await DiffUtils.buildFilePathHistory('/src/new.js', 2, deps);
        const result2 = await DiffUtils.buildFilePathHistory('/src/new.js', 2, deps);
        // Results should be deeply equal (cached under alt-key, may be different object)
        expect(result2).toStrictEqual(result1);
    });

    it('populates alt cache keys for lookup from any path', async () => {
        const cache = new Map();
        const deps = { iterations, cache, getChanges: async (id) => changesByIteration[id] || [] };

        await DiffUtils.buildFilePathHistory('/src/new.js', 2, deps);

        // Should also be cached under /src/old.js@1
        expect(cache.has('/src/old.js@1')).toBe(true);
    });

    it('falls back to same path when knownIterationId not found', async () => {
        const deps = makeDeps();
        const history = await DiffUtils.buildFilePathHistory('/src/file.js', 999, deps);
        for (const it of iterations) {
            expect(history.get(it.id)).toBe('/src/file.js');
        }
    });

    it('handles double rename across iterations', async () => {
        const doubleRenameIterations = [
            { id: 1, createdDate: '2024-01-01', sourceRefCommit: { commitId: 'a1' } },
            { id: 2, createdDate: '2024-01-02', sourceRefCommit: { commitId: 'a2' } },
            { id: 3, createdDate: '2024-01-03', sourceRefCommit: { commitId: 'a3' } },
        ];
        const doubleRenameChanges = {
            1: [{ item: { path: '/a.js' }, changeType: 'add' }],
            2: [{ item: { path: '/b.js' }, changeType: 'rename', sourceServerItem: '/a.js' }],
            3: [{ item: { path: '/c.js' }, changeType: 'rename', sourceServerItem: '/b.js' }],
        };
        const deps = {
            iterations: doubleRenameIterations,
            cache: new Map(),
            getChanges: async (id) => doubleRenameChanges[id] || [],
        };

        const history = await DiffUtils.buildFilePathHistory('/b.js', 2, deps);
        // Backward walk from iter 2: finds rename TO /b.js FROM /a.js, so iter 2 = /a.js
        // iter 1: no rename to /a.js, so iter 1 = /a.js
        expect(history.get(1)).toBe('/a.js');
        expect(history.get(2)).toBe('/a.js');
        // Forward walk from iter 3: finds rename FROM /b.js TO /c.js
        expect(history.get(3)).toBe('/c.js');
    });
});

describe('getFilePathAtIteration', () => {
    it('returns old path at an earlier iteration', async () => {
        const deps = makeDeps();
        const path = await DiffUtils.getFilePathAtIteration('/src/new.js', 2, 1, deps);
        expect(path).toBe('/src/old.js');
    });

    it('returns pre-rename path for known iteration (backward walk processes it)', async () => {
        const deps = makeDeps();
        const path = await DiffUtils.getFilePathAtIteration('/src/new.js', 2, 2, deps);
        // The backward walk finds the rename at iter 2 and maps it to old path
        expect(path).toBe('/src/old.js');
    });

    it('returns new path at a later iteration', async () => {
        const deps = makeDeps();
        const path = await DiffUtils.getFilePathAtIteration('/src/new.js', 2, 3, deps);
        expect(path).toBe('/src/new.js');
    });

    it('falls back to filePath when target iteration not in history', async () => {
        const deps = makeDeps();
        const path = await DiffUtils.getFilePathAtIteration('/src/new.js', 2, 999, deps);
        expect(path).toBe('/src/new.js');
    });
});

describe('getOrComputeFileDiff', () => {
    it('computes diff and caches result', async () => {
        const cache = new Map();
        let fetchCount = 0;
        const deps = {
            config: {},
            cache,
            getFileContent: async () => { fetchCount++; return 'line1\nline2'; },
            diff: { diff: (a, b) => [{ type: 'unchanged', content: 'line1' }, { type: 'unchanged', content: 'line2' }] },
        };

        const result = await DiffUtils.getOrComputeFileDiff('/file.js', 'abc', 'def', null, deps);
        expect(result.diff.length).toBe(2);
        expect(result.addedCount).toBe(0);
        expect(result.removedCount).toBe(0);
        expect(result.oldFetchFailed).toBe(false);
        expect(result.newFetchFailed).toBe(false);

        expect(cache.size).toBe(1);

        // Second call should use cache (same object returned)
        const result2 = await DiffUtils.getOrComputeFileDiff('/file.js', 'abc', 'def', null, deps);
        expect(result2).toBe(result);
        expect(fetchCount).toBe(2); // Only fetched twice (old + new) during first call
    });

    it('uses oldFilePath for old side when provided', async () => {
        const fetched = [];
        const deps = {
            config: { project: 'proj' },
            cache: new Map(),
            getFileContent: async (config, path, opts) => { fetched.push(path); return ''; },
            diff: { diff: () => [] },
        };

        await DiffUtils.getOrComputeFileDiff('/new.js', 'abc', 'def', '/old.js', deps);
        expect(fetched[0]).toBe('/old.js'); // old side uses oldFilePath
        expect(fetched[1]).toBe('/new.js'); // new side uses filePath
    });

    it('handles old fetch failure', async () => {
        const deps = {
            config: {},
            cache: new Map(),
            getFileContent: async (config, path) => {
                if (path === '/old.js') throw new Error('not found');
                return 'new content';
            },
            diff: { diff: (a, b) => [{ type: 'added', content: 'new content' }] },
        };

        const result = await DiffUtils.getOrComputeFileDiff('/new.js', 'abc', 'def', '/old.js', deps);
        expect(result.oldFetchFailed).toBe(true);
        // Should NOT be cached when fetch fails
        expect(deps.cache.size).toBe(0);
    });

    it('skips fetch when commitId is null', async () => {
        let fetchCount = 0;
        const deps = {
            config: {},
            cache: new Map(),
            getFileContent: async () => { fetchCount++; return 'content'; },
            diff: { diff: (a, b) => [] },
        };

        await DiffUtils.getOrComputeFileDiff('/file.js', null, 'def', null, deps);
        expect(fetchCount).toBe(1); // Only new side fetched
    });

    it('counts added and removed lines', async () => {
        const deps = {
            config: {},
            cache: new Map(),
            getFileContent: async () => '',
            diff: {
                diff: () => [
                    { type: 'removed', content: 'a' },
                    { type: 'removed', content: 'b' },
                    { type: 'added', content: 'x' },
                    { type: 'unchanged', content: 'y' },
                ],
            },
        };

        const result = await DiffUtils.getOrComputeFileDiff('/f.js', 'a', 'b', null, deps);
        expect(result.addedCount).toBe(1);
        expect(result.removedCount).toBe(2);
    });
});
