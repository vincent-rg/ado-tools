import { describe, it, expect } from 'vitest';
import PRListUtils from '../pr-list-utils.js';

// Simple normalize stub matching ADOSearch.normalize behavior
const normalize = (text) => {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

const makePR = (overrides = {}) => ({
    pullRequestId: 42,
    title: 'Fix login bug',
    status: 'active',
    isDraft: false,
    description: 'Fixes the login issue',
    createdBy: { displayName: 'Alice Martin' },
    reviewers: [{ displayName: 'Bob Smith' }],
    _project: 'MyProject',
    _repo: { id: 'repo-1' },
    ...overrides
});

describe('PRListUtils', () => {
    describe('getTimeAgo', () => {
        const now = 1700000000000;

        it('returns just now for < 60 seconds', () => {
            expect(PRListUtils.getTimeAgo(now - 30000, now)).toBe('just now');
        });

        it('returns 1 minute ago (singular)', () => {
            expect(PRListUtils.getTimeAgo(now - 60000, now)).toBe('1 minute ago');
        });

        it('returns minutes ago (plural)', () => {
            expect(PRListUtils.getTimeAgo(now - 5 * 60000, now)).toBe('5 minutes ago');
        });

        it('returns 1 hour ago (singular)', () => {
            expect(PRListUtils.getTimeAgo(now - 3600000, now)).toBe('1 hour ago');
        });

        it('returns hours ago (plural)', () => {
            expect(PRListUtils.getTimeAgo(now - 3 * 3600000, now)).toBe('3 hours ago');
        });

        it('returns 1 day ago (singular)', () => {
            expect(PRListUtils.getTimeAgo(now - 24 * 3600000, now)).toBe('1 day ago');
        });

        it('returns days ago (plural)', () => {
            expect(PRListUtils.getTimeAgo(now - 7 * 24 * 3600000, now)).toBe('7 days ago');
        });

        it('handles boundary at 59 seconds', () => {
            expect(PRListUtils.getTimeAgo(now - 59000, now)).toBe('just now');
        });

        it('handles boundary at 59 minutes', () => {
            expect(PRListUtils.getTimeAgo(now - 59 * 60000, now)).toBe('59 minutes ago');
        });

        it('handles boundary at 23 hours', () => {
            expect(PRListUtils.getTimeAgo(now - 23 * 3600000, now)).toBe('23 hours ago');
        });
    });

    describe('getPRKey', () => {
        it('returns project/repoId/prId format', () => {
            expect(PRListUtils.getPRKey(makePR())).toBe('MyProject/repo-1/42');
        });

        it('handles different values', () => {
            const pr = makePR({ _project: 'Other', _repo: { id: 'r2' }, pullRequestId: 99 });
            expect(PRListUtils.getPRKey(pr)).toBe('Other/r2/99');
        });
    });

    describe('hasPRChanged', () => {
        it('returns false when nothing changed', () => {
            const pr = makePR();
            expect(PRListUtils.hasPRChanged(pr, { ...pr })).toBe(false);
        });

        it('detects status change', () => {
            const old = makePR();
            const fresh = makePR({ status: 'completed' });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(true);
        });

        it('detects title change', () => {
            const old = makePR();
            const fresh = makePR({ title: 'New title' });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(true);
        });

        it('detects draft toggle', () => {
            const old = makePR();
            const fresh = makePR({ isDraft: true });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(true);
        });

        it('detects reviewer change', () => {
            const old = makePR();
            const fresh = makePR({ reviewers: [{ displayName: 'Charlie' }] });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(true);
        });

        it('detects description change', () => {
            const old = makePR();
            const fresh = makePR({ description: 'Updated desc' });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(true);
        });

        it('ignores non-tracked field changes', () => {
            const old = makePR();
            const fresh = makePR({ creationDate: '2024-01-02' });
            expect(PRListUtils.hasPRChanged(old, fresh)).toBe(false);
        });
    });

    describe('prMatchesFilters', () => {
        const deps = { normalize, commentCounts: {} };
        const emptyFilters = { statuses: [] };

        it('matches with empty filters', () => {
            expect(PRListUtils.prMatchesFilters(makePR(), emptyFilters, deps)).toBe(true);
        });

        // PR ID filter
        it('matches exact PR ID', () => {
            const filters = { prId: '42', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects wrong PR ID', () => {
            const filters = { prId: '99', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        // Title filter - subsequence matching
        it('matches title substring', () => {
            const filters = { title: 'login', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('matches title with multiple words as subsequence', () => {
            const filters = { title: 'fix bug', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects title when subsequence order is wrong', () => {
            const filters = { title: 'bug fix', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        it('matches title case-insensitively', () => {
            const filters = { title: 'FIX LOGIN', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('matches title with accented characters', () => {
            const pr = makePR({ title: 'Résoudre le problème' });
            const filters = { title: 'resoudre', statuses: [] };
            expect(PRListUtils.prMatchesFilters(pr, filters, deps)).toBe(true);
        });

        // Status filter
        it('matches when status is in filter list', () => {
            const filters = { statuses: ['active'] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects when status is not in filter list', () => {
            const filters = { statuses: ['completed'] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        it('matches when statuses list is empty (show all)', () => {
            const filters = { statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        // Created by filter
        it('matches created by author name', () => {
            const filters = { createdBy: 'alice', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects wrong author', () => {
            const filters = { createdBy: 'charlie', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        it('matches any of semicolon-separated authors', () => {
            const filters = { createdBy: 'charlie; alice', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        // Assigned to filter
        it('matches reviewer name', () => {
            const filters = { assignedTo: 'bob', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects when no reviewer matches', () => {
            const filters = { assignedTo: 'charlie', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        it('matches any of semicolon-separated reviewers', () => {
            const filters = { assignedTo: 'charlie; bob', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        // Comment author filter
        it('matches comment author when data is loaded', () => {
            const pr = makePR();
            const prKey = 'MyProject/repo-1/42';
            const depsWithComments = {
                normalize,
                commentCounts: {
                    [prKey]: {
                        authorObjects: { '1': { displayName: 'Dave Wilson' } }
                    }
                }
            };
            const filters = { commentAuthor: 'dave', statuses: [] };
            expect(PRListUtils.prMatchesFilters(pr, filters, depsWithComments)).toBe(true);
        });

        it('rejects when comment author not found', () => {
            const pr = makePR();
            const prKey = 'MyProject/repo-1/42';
            const depsWithComments = {
                normalize,
                commentCounts: {
                    [prKey]: {
                        authorObjects: { '1': { displayName: 'Dave Wilson' } }
                    }
                }
            };
            const filters = { commentAuthor: 'eve', statuses: [] };
            expect(PRListUtils.prMatchesFilters(pr, filters, depsWithComments)).toBe(false);
        });

        it('hides PR when comment data not yet loaded', () => {
            const filters = { commentAuthor: 'dave', statuses: [] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });

        // Combined filters
        it('requires all filters to match', () => {
            const filters = { title: 'login', createdBy: 'alice', statuses: ['active'] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(true);
        });

        it('rejects when one of multiple filters fails', () => {
            const filters = { title: 'login', createdBy: 'charlie', statuses: ['active'] };
            expect(PRListUtils.prMatchesFilters(makePR(), filters, deps)).toBe(false);
        });
    });
});
