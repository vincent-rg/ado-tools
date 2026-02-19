import { describe, it, expect } from 'vitest';
import PRThreadsUtils from '../pr-threads-utils.js';

describe('PRThreadsUtils', () => {
    describe('calculateFileChangeStats', () => {
        it('returns zeros for empty array', () => {
            expect(PRThreadsUtils.calculateFileChangeStats([])).toEqual({
                totalFiles: 0, added: 0, modified: 0, deleted: 0, renamed: 0
            });
        });

        it('counts added files', () => {
            const entries = [{ changeType: 'add' }, { changeType: 'add' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.added).toBe(2);
            expect(stats.totalFiles).toBe(2);
        });

        it('counts edited files as modified', () => {
            const entries = [{ changeType: 'edit' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.modified).toBe(1);
        });

        it('counts deleted files', () => {
            const entries = [{ changeType: 'delete' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.deleted).toBe(1);
        });

        it('counts rename-only files', () => {
            const entries = [{ changeType: 'rename' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.renamed).toBe(1);
        });

        it('counts "edit, rename" as modified (not renamed)', () => {
            const entries = [{ changeType: 'edit, rename' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.modified).toBe(1);
            expect(stats.renamed).toBe(0);
        });

        it('prioritizes add over other types', () => {
            const entries = [{ changeType: 'add, edit' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.added).toBe(1);
            expect(stats.modified).toBe(0);
        });

        it('prioritizes delete over edit', () => {
            // unlikely in practice but tests the precedence
            const entries = [{ changeType: 'delete, edit' }];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.deleted).toBe(1);
            expect(stats.modified).toBe(0);
        });

        it('handles mixed change types', () => {
            const entries = [
                { changeType: 'add' },
                { changeType: 'edit' },
                { changeType: 'edit' },
                { changeType: 'delete' },
                { changeType: 'rename' },
                { changeType: 'edit, rename' }
            ];
            const stats = PRThreadsUtils.calculateFileChangeStats(entries);
            expect(stats.totalFiles).toBe(6);
            expect(stats.added).toBe(1);
            expect(stats.modified).toBe(3); // 2 edits + 1 edit,rename
            expect(stats.deleted).toBe(1);
            expect(stats.renamed).toBe(1);
        });
    });

    describe('getActiveThreadCounts', () => {
        const makeThread = (status, authorId, commentType = 'text', isDeleted = false) => ({
            status,
            isDeleted,
            comments: [{ author: { id: authorId }, commentType }]
        });

        it('returns empty object for no threads', () => {
            expect(PRThreadsUtils.getActiveThreadCounts([])).toEqual({});
        });

        it('counts active threads by author', () => {
            const threads = [
                makeThread('active', 'user1'),
                makeThread('active', 'user1'),
                makeThread('active', 'user2')
            ];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({
                user1: 2,
                user2: 1
            });
        });

        it('accepts numeric status 1 as active', () => {
            const threads = [makeThread(1, 'user1')];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({ user1: 1 });
        });

        it('accepts "Active" (capitalized) as active', () => {
            const threads = [makeThread('Active', 'user1')];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({ user1: 1 });
        });

        it('ignores non-active threads', () => {
            const threads = [
                makeThread('fixed', 'user1'),
                makeThread('closed', 'user1'),
                makeThread('byDesign', 'user1')
            ];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({});
        });

        it('ignores deleted threads', () => {
            const threads = [makeThread('active', 'user1', 'text', true)];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({});
        });

        it('only counts text comment types (string)', () => {
            const threads = [
                makeThread('active', 'user1', 'text'),
                makeThread('active', 'user2', 'system')
            ];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({ user1: 1 });
        });

        it('only counts text comment types (numeric 1)', () => {
            const threads = [
                makeThread('active', 'user1', 1),
                makeThread('active', 'user2', 2)
            ];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({ user1: 1 });
        });

        it('ignores threads with no comments', () => {
            const threads = [{ status: 'active', isDeleted: false, comments: [] }];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({});
        });

        it('ignores threads with no author id', () => {
            const threads = [{
                status: 'active',
                isDeleted: false,
                comments: [{ author: {}, commentType: 'text' }]
            }];
            expect(PRThreadsUtils.getActiveThreadCounts(threads)).toEqual({});
        });
    });

    describe('getCompletionBlockers', () => {
        const formatPolicy = (p) => {
            const type = p.configuration?.type?.displayName || 'Policy';
            const name = p.configuration?.settings?.displayName || '';
            return { label: name ? `${type}: ${name}` : type, extra: '' };
        };
        const deps = { formatPolicy };

        it('returns empty array when no blockers', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                { policies: [] },
                { mergeStatus: 'succeeded' },
                deps
            );
            expect(result).toEqual([]);
        });

        it('detects merge conflicts', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                { policies: [] },
                { mergeStatus: 'conflicts' },
                deps
            );
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('conflict');
            expect(result[0].message).toContain('merge conflicts');
        });

        it('detects blocking rejected policy', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                {
                    policies: [{
                        configuration: { isBlocking: true, type: { displayName: 'Build' }, settings: { displayName: 'CI' } },
                        status: 'rejected'
                    }]
                },
                { mergeStatus: 'succeeded' },
                deps
            );
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('policy');
            expect(result[0].status).toBe('rejected');
            expect(result[0].message).toContain('Build: CI');
        });

        it('detects blocking running policy', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                {
                    policies: [{
                        configuration: { isBlocking: true, type: { displayName: 'Build' }, settings: { displayName: 'CI' } },
                        status: 'running'
                    }]
                },
                { mergeStatus: 'succeeded' },
                deps
            );
            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('running');
        });

        it('ignores non-blocking policies', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                {
                    policies: [{
                        configuration: { isBlocking: false, type: { displayName: 'Build' }, settings: {} },
                        status: 'rejected'
                    }]
                },
                { mergeStatus: 'succeeded' },
                deps
            );
            expect(result).toEqual([]);
        });

        it('ignores approved blocking policies', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                {
                    policies: [{
                        configuration: { isBlocking: true, type: { displayName: 'Build' }, settings: {} },
                        status: 'approved'
                    }]
                },
                { mergeStatus: 'succeeded' },
                deps
            );
            expect(result).toEqual([]);
        });

        it('combines conflict and policy blockers', () => {
            const result = PRThreadsUtils.getCompletionBlockers(
                {
                    policies: [{
                        configuration: { isBlocking: true, type: { displayName: 'Build' }, settings: {} },
                        status: 'rejected'
                    }]
                },
                { mergeStatus: 'conflicts' },
                deps
            );
            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('conflict');
            expect(result[1].type).toBe('policy');
        });

        it('handles null checksData gracefully', () => {
            const result = PRThreadsUtils.getCompletionBlockers(null, { mergeStatus: 'succeeded' }, deps);
            expect(result).toEqual([]);
        });

        it('handles missing policies array', () => {
            const result = PRThreadsUtils.getCompletionBlockers({}, { mergeStatus: 'succeeded' }, deps);
            expect(result).toEqual([]);
        });
    });

    describe('stripMarkdown', () => {
        it('returns empty string for null/undefined', () => {
            expect(PRThreadsUtils.stripMarkdown(null)).toBe('');
            expect(PRThreadsUtils.stripMarkdown(undefined)).toBe('');
            expect(PRThreadsUtils.stripMarkdown('')).toBe('');
        });

        it('replaces fenced code blocks with [code]', () => {
            expect(PRThreadsUtils.stripMarkdown('before ```const x = 1;``` after')).toBe('before [code] after');
        });

        it('replaces multiline fenced code blocks', () => {
            const text = 'before\n```\nline1\nline2\n```\nafter';
            expect(PRThreadsUtils.stripMarkdown(text)).toBe('before\n[code]\nafter');
        });

        it('replaces inline code with [code]', () => {
            expect(PRThreadsUtils.stripMarkdown('use `foo()` here')).toBe('use [code] here');
        });

        it('extracts link text from markdown links', () => {
            expect(PRThreadsUtils.stripMarkdown('see [docs](https://example.com)')).toBe('see docs');
        });

        it('strips bold markers', () => {
            expect(PRThreadsUtils.stripMarkdown('this is **bold** text')).toBe('this is bold text');
        });

        it('strips italic markers', () => {
            expect(PRThreadsUtils.stripMarkdown('this is *italic* text')).toBe('this is italic text');
        });

        it('strips heading markers', () => {
            expect(PRThreadsUtils.stripMarkdown('## Heading')).toBe('Heading');
        });

        it('strips blockquote markers', () => {
            expect(PRThreadsUtils.stripMarkdown('> quoted text')).toBe('quoted text');
        });

        it('strips strikethrough markers', () => {
            expect(PRThreadsUtils.stripMarkdown('~~deleted~~')).toBe('deleted');
        });

        it('handles combined markdown', () => {
            const text = '**Bold** and `code` and [link](url)';
            expect(PRThreadsUtils.stripMarkdown(text)).toBe('Bold and [code] and link');
        });

        it('trims whitespace', () => {
            expect(PRThreadsUtils.stripMarkdown('  hello  ')).toBe('hello');
        });
    });

    describe('buildFileCommentContext', () => {
        it('returns threadContext with only filePath', () => {
            const { threadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', null, null, 3, []
            );
            expect(threadContext).toEqual({ filePath: '/src/main.cpp' });
        });

        it('sets both iterations to latest in all-iterations mode', () => {
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', null, null, 3, []
            );
            expect(pullRequestThreadContext.iterationContext).toEqual({
                firstComparingIteration: 3,
                secondComparingIteration: 3
            });
        });

        it('uses (start - 1) as firstComparingIteration for specific iteration', () => {
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', 2, 2, 3, []
            );
            expect(pullRequestThreadContext.iterationContext).toEqual({
                firstComparingIteration: 1,
                secondComparingIteration: 2
            });
        });

        it('clamps firstComparingIteration to 1 for iteration 1', () => {
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', 1, 1, 3, []
            );
            expect(pullRequestThreadContext.iterationContext).toEqual({
                firstComparingIteration: 1,
                secondComparingIteration: 1
            });
        });

        it('handles iteration range selection', () => {
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', 2, 4, 5, []
            );
            expect(pullRequestThreadContext.iterationContext).toEqual({
                firstComparingIteration: 1,
                secondComparingIteration: 4
            });
        });

        it('includes changeTrackingId when file has a matching change entry', () => {
            const entries = [
                { item: { path: '/src/other.cpp' }, changeTrackingId: 5 },
                { item: { path: '/src/main.cpp' }, changeTrackingId: 7 }
            ];
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', null, null, 3, entries
            );
            expect(pullRequestThreadContext.changeTrackingId).toBe(7);
        });

        it('omits changeTrackingId when no matching change entry', () => {
            const entries = [{ item: { path: '/src/other.cpp' }, changeTrackingId: 5 }];
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', null, null, 3, entries
            );
            expect(pullRequestThreadContext.changeTrackingId).toBeUndefined();
        });

        it('omits changeTrackingId when entry has no item', () => {
            const entries = [{ changeTrackingId: 5 }];
            const { pullRequestThreadContext } = PRThreadsUtils.buildFileCommentContext(
                '/src/main.cpp', null, null, 3, entries
            );
            expect(pullRequestThreadContext.changeTrackingId).toBeUndefined();
        });
    });

    describe('getLineStatsCacheKey', () => {
        it('generates correct cache key', () => {
            const config = { organization: 'org', project: 'proj', repository: 'repo' };
            expect(PRThreadsUtils.getLineStatsCacheKey(config, 42, 5)).toBe(
                'line-stats-org-proj-repo-42-5'
            );
        });

        it('handles different values', () => {
            const config = { organization: 'myOrg', project: 'myProj', repository: 'myRepo' };
            expect(PRThreadsUtils.getLineStatsCacheKey(config, 1, 1)).toBe(
                'line-stats-myOrg-myProj-myRepo-1-1'
            );
        });
    });

    describe('buildRenameMaps', () => {
        it('returns empty maps for empty entries', () => {
            const { oldToNew, newToOld } = PRThreadsUtils.buildRenameMaps([]);
            expect(oldToNew.size).toBe(0);
            expect(newToOld.size).toBe(0);
        });

        it('maps a rename with sourceServerItem', () => {
            const entries = [{
                item: { path: '/new/file.js' },
                changeType: 'rename',
                sourceServerItem: '/old/file.js'
            }];
            const { oldToNew, newToOld } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.get('/old/file.js')).toBe('/new/file.js');
            expect(newToOld.get('/new/file.js')).toBe('/old/file.js');
        });

        it('falls back to originalPath when sourceServerItem is missing', () => {
            const entries = [{
                item: { path: '/new/file.js' },
                changeType: 'rename',
                originalPath: '/old/file.js'
            }];
            const { oldToNew, newToOld } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.get('/old/file.js')).toBe('/new/file.js');
            expect(newToOld.get('/new/file.js')).toBe('/old/file.js');
        });

        it('handles multiple renames', () => {
            const entries = [
                { item: { path: '/b.js' }, changeType: 'rename', sourceServerItem: '/a.js' },
                { item: { path: '/d.js' }, changeType: 'edit, rename', sourceServerItem: '/c.js' }
            ];
            const { oldToNew, newToOld } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.size).toBe(2);
            expect(oldToNew.get('/a.js')).toBe('/b.js');
            expect(oldToNew.get('/c.js')).toBe('/d.js');
        });

        it('ignores non-rename entries', () => {
            const entries = [
                { item: { path: '/file.js' }, changeType: 'edit' },
                { item: { path: '/new.js' }, changeType: 'add' },
                { item: { path: '/gone.js' }, changeType: 'delete' }
            ];
            const { oldToNew, newToOld } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.size).toBe(0);
            expect(newToOld.size).toBe(0);
        });

        it('ignores rename entries without old path', () => {
            const entries = [{ item: { path: '/file.js' }, changeType: 'rename' }];
            const { oldToNew } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.size).toBe(0);
        });

        it('ignores entries without item.path', () => {
            const entries = [{ changeType: 'rename', sourceServerItem: '/old.js' }];
            const { oldToNew } = PRThreadsUtils.buildRenameMaps(entries);
            expect(oldToNew.size).toBe(0);
        });
    });

    describe('buildThreadsByFilePath', () => {
        const emptyMaps = { oldToNew: new Map(), newToOld: new Map() };

        const makeThread = (filePath, opts = {}) => ({
            isDeleted: opts.isDeleted || false,
            threadContext: filePath ? { filePath } : null,
            comments: opts.comments || [{ commentType: 'text', author: { id: 'u1' } }]
        });

        const makeChangeEntry = (path, changeType = 'edit') => ({
            item: { path, gitObjectType: 'blob' },
            changeType
        });

        it('returns empty collections when no threads or entries', () => {
            const result = PRThreadsUtils.buildThreadsByFilePath([], [], emptyMaps);
            expect(result.threadsByFilePath.size).toBe(0);
            expect(result.changedFilePaths.size).toBe(0);
            expect(result.commentedFilePaths.size).toBe(0);
        });

        it('indexes thread by its file path', () => {
            const thread = makeThread('/src/a.js');
            const entries = [makeChangeEntry('/src/a.js')];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, emptyMaps);
            expect(result.threadsByFilePath.get('/src/a.js')).toEqual([thread]);
            expect(result.commentedFilePaths.has('/src/a.js')).toBe(false);
        });

        it('puts thread on unchanged file into commentedFilePaths', () => {
            const thread = makeThread('/src/readme.md');
            const entries = [makeChangeEntry('/src/a.js')];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, emptyMaps);
            expect(result.threadsByFilePath.has('/src/readme.md')).toBe(true);
            expect(result.commentedFilePaths.has('/src/readme.md')).toBe(true);
        });

        it('includes deleted threads in threadsByFilePath (filter handled by filteredThreadIds)', () => {
            const thread = makeThread('/src/a.js', { isDeleted: true });
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], [], emptyMaps);
            expect(result.threadsByFilePath.size).toBe(1);
            expect(result.threadsByFilePath.get('/src/a.js')).toHaveLength(1);
        });

        it('excludes deleted-only files from commentedFilePaths', () => {
            const thread = makeThread('/src/a.js', { isDeleted: true });
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], [], emptyMaps);
            expect(result.commentedFilePaths.has('/src/a.js')).toBe(false);
        });

        it('skips threads without filePath', () => {
            const thread = makeThread(null);
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], [], emptyMaps);
            expect(result.threadsByFilePath.size).toBe(0);
        });

        it('skips system-only threads', () => {
            const thread = makeThread('/src/a.js', {
                comments: [{ commentType: 'system' }]
            });
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], [], emptyMaps);
            expect(result.threadsByFilePath.size).toBe(0);
        });

        it('excludes tree entries and folder paths from changedFilePaths', () => {
            const entries = [
                { item: { path: '/src', gitObjectType: 'tree' }, changeType: 'edit' },
                { item: { path: '/src/' }, changeType: 'edit' }
            ];
            const result = PRThreadsUtils.buildThreadsByFilePath([], entries, emptyMaps);
            expect(result.changedFilePaths.size).toBe(0);
        });

        // Rename consolidation tests
        it('consolidates thread on old path under new path via rename maps', () => {
            const renameMaps = {
                oldToNew: new Map([['/old/file.js', '/new/file.js']]),
                newToOld: new Map([['/new/file.js', '/old/file.js']])
            };
            const thread = makeThread('/old/file.js');
            const entries = [
                makeChangeEntry('/new/file.js', 'edit, rename')
            ];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, renameMaps);
            // Thread accessible via both old and new path
            expect(result.threadsByFilePath.get('/new/file.js')).toContain(thread);
            expect(result.threadsByFilePath.get('/old/file.js')).toContain(thread);
            // Old path excluded from commentedFilePaths (its rename target is in changedFilePaths)
            expect(result.commentedFilePaths.has('/old/file.js')).toBe(false);
        });

        it('consolidates thread on new path under old path via rename maps', () => {
            const renameMaps = {
                oldToNew: new Map([['/old/file.js', '/new/file.js']]),
                newToOld: new Map([['/new/file.js', '/old/file.js']])
            };
            const thread = makeThread('/new/file.js');
            const entries = [
                makeChangeEntry('/new/file.js', 'edit, rename')
            ];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, renameMaps);
            expect(result.threadsByFilePath.get('/old/file.js')).toContain(thread);
            expect(result.threadsByFilePath.get('/new/file.js')).toContain(thread);
            expect(result.commentedFilePaths.has('/old/file.js')).toBe(false);
        });

        it('pre-rename iteration: old path in entries, thread on new path excluded from commented', () => {
            const renameMaps = {
                oldToNew: new Map([['/old/file.js', '/new/file.js']]),
                newToOld: new Map([['/new/file.js', '/old/file.js']])
            };
            const thread = makeThread('/new/file.js');
            // In a pre-rename iteration, only the old path appears in change entries
            const entries = [makeChangeEntry('/old/file.js', 'edit')];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, renameMaps);
            // Thread cross-mapped to old path
            expect(result.threadsByFilePath.get('/old/file.js')).toContain(thread);
            // New path not in commentedFilePaths because its rename source is in changedFilePaths
            expect(result.commentedFilePaths.has('/new/file.js')).toBe(false);
        });

        it('post-rename iteration: new path in entries, thread on old path excluded from commented', () => {
            const renameMaps = {
                oldToNew: new Map([['/old/file.js', '/new/file.js']]),
                newToOld: new Map([['/new/file.js', '/old/file.js']])
            };
            const thread = makeThread('/old/file.js');
            // In a post-rename iteration, only the new path appears in change entries
            const entries = [makeChangeEntry('/new/file.js', 'edit')];
            const result = PRThreadsUtils.buildThreadsByFilePath([thread], entries, renameMaps);
            expect(result.threadsByFilePath.get('/new/file.js')).toContain(thread);
            expect(result.commentedFilePaths.has('/old/file.js')).toBe(false);
        });

        it('threads on both old and new paths are accessible from either path', () => {
            const renameMaps = {
                oldToNew: new Map([['/old/file.js', '/new/file.js']]),
                newToOld: new Map([['/new/file.js', '/old/file.js']])
            };
            const threadOld = makeThread('/old/file.js');
            const threadNew = makeThread('/new/file.js');
            const entries = [makeChangeEntry('/new/file.js', 'edit, rename')];
            const result = PRThreadsUtils.buildThreadsByFilePath([threadOld, threadNew], entries, renameMaps);
            const threadsAtNew = result.threadsByFilePath.get('/new/file.js');
            expect(threadsAtNew).toContain(threadOld);
            expect(threadsAtNew).toContain(threadNew);
            const threadsAtOld = result.threadsByFilePath.get('/old/file.js');
            expect(threadsAtOld).toContain(threadOld);
            expect(threadsAtOld).toContain(threadNew);
        });
    });

    describe('threadMatchesFilters', () => {
        // Identity normalize: no accent folding needed for these tests
        const deps = { normalize: s => s.toLowerCase() };

        const emptyFilters = {
            showDeleted: true,
            selectedStatuses: [],
            selectedAuthor: '',
            selectedCommentAuthor: '',
            searchText: ''
        };

        const makeThread = (opts = {}) => ({
            id: opts.id || 1,
            isDeleted: opts.isDeleted || false,
            status: opts.status,
            comments: opts.comments || [
                { author: { displayName: opts.author || 'Alice' }, content: opts.content || 'hello world', commentType: 'text' }
            ]
        });

        it('passes a normal thread with empty filters', () => {
            expect(PRThreadsUtils.threadMatchesFilters(makeThread(), emptyFilters, deps)).toBe(true);
        });

        describe('showDeleted filter', () => {
            it('hides deleted threads when showDeleted is false', () => {
                const filters = { ...emptyFilters, showDeleted: false };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ isDeleted: true }), filters, deps)).toBe(false);
            });

            it('shows deleted threads when showDeleted is true', () => {
                const filters = { ...emptyFilters, showDeleted: true };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ isDeleted: true }), filters, deps)).toBe(true);
            });

            it('shows non-deleted threads regardless of showDeleted', () => {
                expect(PRThreadsUtils.threadMatchesFilters(makeThread(), { ...emptyFilters, showDeleted: false }, deps)).toBe(true);
                expect(PRThreadsUtils.threadMatchesFilters(makeThread(), { ...emptyFilters, showDeleted: true }, deps)).toBe(true);
            });
        });

        describe('selectedStatuses filter', () => {
            it('passes when selectedStatuses is empty (all allowed)', () => {
                const filters = { ...emptyFilters, selectedStatuses: [] };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'active' }), filters, deps)).toBe(true);
            });

            it('passes when thread status is in the selected list', () => {
                const filters = { ...emptyFilters, selectedStatuses: ['active', 'fixed'] };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'active' }), filters, deps)).toBe(true);
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'fixed' }), filters, deps)).toBe(true);
            });

            it('blocks when thread status is not in the selected list', () => {
                const filters = { ...emptyFilters, selectedStatuses: ['active'] };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'closed' }), filters, deps)).toBe(false);
            });

            it('is case-insensitive for status matching', () => {
                const filters = { ...emptyFilters, selectedStatuses: ['wontFix'] };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'wontfix' }), filters, deps)).toBe(true);
            });

            it('handles noStatus for threads with undefined status', () => {
                const filters = { ...emptyFilters, selectedStatuses: ['noStatus'] };
                const thread = makeThread();
                delete thread.status;
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, deps)).toBe(true);
            });

            it('blocks threads with undefined status when noStatus is not selected', () => {
                const filters = { ...emptyFilters, selectedStatuses: ['active'] };
                const thread = makeThread();
                delete thread.status;
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, deps)).toBe(false);
            });
        });

        describe('selectedAuthor filter', () => {
            it('passes when selectedAuthor is empty', () => {
                const filters = { ...emptyFilters, selectedAuthor: '' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ author: 'Bob' }), filters, deps)).toBe(true);
            });

            it('passes when first comment author matches', () => {
                const filters = { ...emptyFilters, selectedAuthor: 'Alice' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ author: 'Alice' }), filters, deps)).toBe(true);
            });

            it('blocks when first comment author does not match', () => {
                const filters = { ...emptyFilters, selectedAuthor: 'Alice' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ author: 'Bob' }), filters, deps)).toBe(false);
            });

            it('blocks threads with no comments', () => {
                const filters = { ...emptyFilters, selectedAuthor: 'Alice' };
                const thread = { ...makeThread(), comments: [] };
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, deps)).toBe(false);
            });
        });

        describe('selectedCommentAuthor filter', () => {
            it('passes when selectedCommentAuthor is empty', () => {
                const filters = { ...emptyFilters, selectedCommentAuthor: '' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread(), filters, deps)).toBe(true);
            });

            it('passes when any comment is from the selected user', () => {
                const filters = { ...emptyFilters, selectedCommentAuthor: 'Carol' };
                const thread = makeThread();
                thread.comments = [
                    { author: { displayName: 'Alice' }, content: 'first' },
                    { author: { displayName: 'Carol' }, content: 'second' }
                ];
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, deps)).toBe(true);
            });

            it('blocks when no comment is from the selected user', () => {
                const filters = { ...emptyFilters, selectedCommentAuthor: 'Carol' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ author: 'Alice' }), filters, deps)).toBe(false);
            });
        });

        describe('searchText filter', () => {
            it('passes when searchText is empty', () => {
                const filters = { ...emptyFilters, searchText: '' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread(), filters, deps)).toBe(true);
            });

            it('passes when a comment contains the search text', () => {
                const filters = { ...emptyFilters, searchText: 'world' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ content: 'hello world' }), filters, deps)).toBe(true);
            });

            it('blocks when no comment matches the search text', () => {
                const filters = { ...emptyFilters, searchText: 'xyz' };
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ content: 'hello world' }), filters, deps)).toBe(false);
            });

            it('uses normalize for accent-insensitive search', () => {
                const accentDeps = { normalize: s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() };
                const filters = { ...emptyFilters, searchText: 'cafe' };
                const thread = makeThread({ content: 'café is good' });
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, accentDeps)).toBe(true);
            });

            it('blocks threads with no comments', () => {
                const filters = { ...emptyFilters, searchText: 'hello' };
                const thread = { ...makeThread(), comments: [] };
                expect(PRThreadsUtils.threadMatchesFilters(thread, filters, deps)).toBe(false);
            });
        });

        describe('combined filters', () => {
            it('all filters must pass simultaneously', () => {
                const filters = {
                    showDeleted: false,
                    selectedStatuses: ['active'],
                    selectedAuthor: 'Alice',
                    selectedCommentAuthor: 'Alice',
                    searchText: 'hello'
                };
                // passes all
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'active', author: 'Alice', content: 'hello world' }), filters, deps)).toBe(true);
                // fails status
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'closed', author: 'Alice', content: 'hello world' }), filters, deps)).toBe(false);
                // fails author
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'active', author: 'Bob', content: 'hello world' }), filters, deps)).toBe(false);
                // fails search
                expect(PRThreadsUtils.threadMatchesFilters(makeThread({ status: 'active', author: 'Alice', content: 'goodbye' }), filters, deps)).toBe(false);
            });
        });
    });
});
