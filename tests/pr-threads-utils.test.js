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
});
