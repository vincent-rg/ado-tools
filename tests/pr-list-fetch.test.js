import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing
globalThis.allPRs = [];
globalThis.prChecks = {};
globalThis.prCommentCounts = {};
globalThis.prIterationCounts = {};
globalThis.allCommentAuthors = new Set();
globalThis.isFetchingComments = false;
globalThis.isFetchingPriorityQueue = false;
globalThis._bulkCommentFetchInProgress = false;
globalThis.currentPage = 1;
globalThis.itemsPerPage = 50;

globalThis.ADOConfig = { get: vi.fn(() => ({})) };
globalThis.ADOAPI = {
    getThreads: vi.fn(() => Promise.resolve({ value: [] })),
    getIterations: vi.fn(() => Promise.resolve({ value: [] })),
};
globalThis.ADOContent = {
    escapeHtml: vi.fn((s) => s),
};
globalThis.AvatarLoader = {
    getCached: vi.fn(() => null),
    loadPending: vi.fn(),
};
globalThis.ChecksFormatter = {
    fetchPRChecks: vi.fn(() => Promise.resolve({})),
    buildTooltip: vi.fn(() => ''),
    countStatuses: vi.fn(() => ({ total: 0, failed: 0, pending: 0 })),
    countBuildPolicies: vi.fn(() => ({ total: 0 })),
    countPolicies: vi.fn(() => ({ total: 0 })),
    getBuildStatusSvg: vi.fn(() => '<svg></svg>'),
};
globalThis.ADOSearch = { normalize: vi.fn((s) => s?.toLowerCase() || '') };
globalThis.PRListUtils = { getPRKey: (pr) => `${pr._project}/${pr._repo.id}/${pr.pullRequestId}` };

const { default: PRReviewTimestamps } = await import('../js/pr-review-timestamps.js');
globalThis.PRReviewTimestamps = PRReviewTimestamps;
globalThis.currentUserId = null;
globalThis.allReviewTimestamps = new Map();

globalThis.getSortedPRs = vi.fn(() => globalThis.allPRs);
globalThis.getPRKey = (pr) => PRListUtils.getPRKey(pr);
globalThis.isUserActivelyInteracting = vi.fn(() => false);
globalThis.applyFilters = vi.fn();

globalThis.document = {
    getElementById: vi.fn(() => ({ style: {}, textContent: '' })),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
};

const {
    generateStatusIndicatorsHtml,
    buildCommentFetchQueue,
    computeUnreadAuthorIds,
} = await import('../js/pr-list-fetch.js');

const makePR = (id, project = 'Proj', repoId = 'r1') => ({
    pullRequestId: id,
    _project: project,
    _repo: { id: repoId },
    status: 'active',
    mergeStatus: 'succeeded',
    createdBy: { displayName: 'Alice' },
    reviewers: [],
});

describe('pr-list-fetch', () => {
    beforeEach(() => {
        globalThis.allPRs = [];
        globalThis.prChecks = {};
        globalThis.prCommentCounts = {};
        globalThis.currentPage = 1;
        globalThis.itemsPerPage = 50;
        vi.clearAllMocks();
    });

    describe('generateStatusIndicatorsHtml', () => {
        it('returns empty string when no checks data', () => {
            globalThis.allPRs = [makePR(1)];
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toBe('');
        });

        it('shows merge conflict indicator', () => {
            const pr = makePR(1);
            pr.mergeStatus = 'conflicts';
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: {} };
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('status-indicator');
            expect(result).toContain('⚠️');
        });

        it('shows rejected by policy indicator', () => {
            const pr = makePR(1);
            pr.mergeStatus = 'rejectedByPolicy';
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: {} };
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('🚫');
        });

        it('shows status checks when present', () => {
            const pr = makePR(1);
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: { statuses: [{ state: 'succeeded' }] } };
            ChecksFormatter.countStatuses.mockReturnValueOnce({ total: 1, failed: 0, pending: 0 });
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('📊');
            expect(result).toContain('status-indicator-success');
        });

        it('shows failed status checks with error class', () => {
            const pr = makePR(1);
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: { statuses: [{ state: 'failed' }] } };
            ChecksFormatter.countStatuses.mockReturnValueOnce({ total: 2, failed: 1, pending: 0 });
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('status-indicator-error');
            expect(result).toContain('1/2');
        });

        it('shows pending status checks', () => {
            const pr = makePR(1);
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: { statuses: [{}] } };
            ChecksFormatter.countStatuses.mockReturnValueOnce({ total: 3, failed: 0, pending: 2 });
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('status-indicator-pending');
            expect(result).toContain('2/3');
        });

        it('shows build policies with SVG icons', () => {
            const pr = makePR(1);
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: { policies: [{}] } };
            ChecksFormatter.countBuildPolicies.mockReturnValueOnce({
                total: 3, succeeded: 2, failed: 1, running: 0, queued: 0, notTriggered: 0, expired: 0
            });
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('🔧');
            expect(result).toContain('build-status-count');
        });

        it('shows non-build policy indicators', () => {
            const pr = makePR(1);
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: { policies: [{}] } };
            ChecksFormatter.countPolicies.mockReturnValueOnce({ total: 2, rejected: 1, running: 0 });
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).toContain('📋');
            expect(result).toContain('status-indicator-error');
        });

        it('does not show merge indicator for succeeded merge status', () => {
            const pr = makePR(1);
            pr.mergeStatus = 'succeeded';
            globalThis.allPRs = [pr];
            globalThis.prChecks['Proj/r1/1'] = { data: {} };
            const result = generateStatusIndicatorsHtml('Proj/r1/1');
            expect(result).not.toContain('⚠️');
            expect(result).not.toContain('🚫');
        });

        it('returns empty for unknown prKey', () => {
            globalThis.allPRs = [];
            const result = generateStatusIndicatorsHtml('NoProject/no-repo/999');
            expect(result).toBe('');
        });
    });

    describe('buildCommentFetchQueue', () => {
        beforeEach(() => {
            globalThis.document.getElementById = vi.fn(() => ({ value: '' }));
        });

        it('returns empty queue when no PRs', () => {
            globalThis.allPRs = [];
            globalThis.getSortedPRs = vi.fn(() => []);
            const queue = buildCommentFetchQueue();
            expect(queue).toEqual([]);
        });

        it('adds visible PRs as priority 1', () => {
            const prs = Array.from({ length: 5 }, (_, i) => makePR(i + 1));
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.currentPage = 1;
            globalThis.itemsPerPage = 50;

            const queue = buildCommentFetchQueue();
            const visible = queue.filter(q => q.priority === 1);
            expect(visible).toHaveLength(5);
            expect(visible[0].reason).toBe('visible');
        });

        it('adds adjacent page PRs as priority 2', () => {
            const prs = Array.from({ length: 10 }, (_, i) => makePR(i + 1));
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.currentPage = 2;
            globalThis.itemsPerPage = 3;

            const queue = buildCommentFetchQueue();
            const adjacent = queue.filter(q => q.priority === 2);
            // prev page (3 items) + next page (3 items)
            expect(adjacent.length).toBeGreaterThan(0);
            expect(adjacent[0].reason).toBe('adjacent');
        });

        it('adds stale PRs as priority 3', () => {
            const prs = [makePR(1)];
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.prCommentCounts = {
                'Proj/r1/1': { count: 5, lastFetch: Date.now() - 10 * 60 * 1000 } // 10 min old
            };

            const queue = buildCommentFetchQueue();
            const stale = queue.filter(q => q.priority === 3);
            expect(stale).toHaveLength(1);
            expect(stale[0].reason).toBe('stale');
        });

        it('does not add recently fetched PRs as stale', () => {
            const prs = [makePR(1)];
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.prCommentCounts = {
                'Proj/r1/1': { count: 5, lastFetch: Date.now() - 60 * 1000 } // 1 min old
            };

            const queue = buildCommentFetchQueue();
            const stale = queue.filter(q => q.priority === 3);
            expect(stale).toHaveLength(0);
        });

        it('prioritizes unfetched PRs when comment author filter active', () => {
            const prs = [makePR(1), makePR(2)];
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.prCommentCounts = {}; // none fetched
            globalThis.document.getElementById = vi.fn(() => ({ value: 'Alice' }));

            const queue = buildCommentFetchQueue();
            const visible = queue.filter(q => q.reason === 'visible');
            const commentFilter = queue.filter(q => q.reason === 'comment-filter');
            expect(visible).toHaveLength(2);
            expect(commentFilter).toHaveLength(0); // all PRs are already in visible
        });

        it('adds unfetched non-visible PRs for comment filter', () => {
            const prs = Array.from({ length: 10 }, (_, i) => makePR(i + 1));
            globalThis.allPRs = prs;
            globalThis.getSortedPRs = vi.fn(() => prs);
            globalThis.currentPage = 1;
            globalThis.itemsPerPage = 3;
            globalThis.prCommentCounts = {}; // none fetched
            globalThis.document.getElementById = vi.fn(() => ({ value: 'Alice' }));

            const queue = buildCommentFetchQueue();
            const commentFilter = queue.filter(q => q.reason === 'comment-filter');
            expect(commentFilter).toHaveLength(7); // 10 - 3 visible
        });
    });

    describe('computeUnreadAuthorIds', () => {
        const ME = 'me';
        const T_OLD = 1_000_000;
        const T_NEW = 2_000_000;
        const ISO_OLD = new Date(T_OLD).toISOString();
        const ISO_NEW = new Date(T_NEW).toISOString();

        const makeThread = (id, authorId, publishedDate, { commentType = 'text' } = {}) => ({
            id,
            status: 'active',
            comments: [
                { author: { id: authorId }, commentType, publishedDate, isDeleted: false },
            ],
        });

        beforeEach(() => {
            globalThis.currentUserId = ME;
            globalThis.allReviewTimestamps = new Map();
        });

        it('returns an empty set when there are no active threads', () => {
            const result = computeUnreadAuthorIds(makePR(1), []);
            expect(result.size).toBe(0);
        });

        it('marks author as unread when no review timestamp exists for the thread', () => {
            const thread = makeThread(10, 'alice', ISO_OLD);
            const result = computeUnreadAuthorIds(makePR(1), [thread]);
            expect(result.has('alice')).toBe(true);
        });

        it('does not mark author as unread when all their comments are at or before the timestamp', () => {
            const thread = makeThread(10, 'alice', ISO_OLD);
            globalThis.allReviewTimestamps.set('1', new Map([[10, T_NEW]]));
            const result = computeUnreadAuthorIds(makePR(1), [thread]);
            expect(result.has('alice')).toBe(false);
        });

        it('marks author as unread when a comment is newer than the timestamp', () => {
            const thread = makeThread(10, 'alice', ISO_NEW);
            globalThis.allReviewTimestamps.set('1', new Map([[10, T_OLD]]));
            const result = computeUnreadAuthorIds(makePR(1), [thread]);
            expect(result.has('alice')).toBe(true);
        });

        it('skips threads started by the current user', () => {
            const thread = makeThread(10, ME, ISO_NEW);
            const result = computeUnreadAuthorIds(makePR(1), [thread]);
            expect(result.has(ME)).toBe(false);
            expect(result.size).toBe(0);
        });

        it('skips system/codeChange threads', () => {
            const t1 = makeThread(10, 'alice', ISO_NEW, { commentType: 'system' });
            const t2 = makeThread(11, 'bob', ISO_NEW, { commentType: 'codeChange' });
            const result = computeUnreadAuthorIds(makePR(1), [t1, t2]);
            expect(result.size).toBe(0);
        });

        it('uses PR-specific timestamps (no cross-PR bleed)', () => {
            const thread = makeThread(10, 'alice', ISO_NEW);
            // Timestamp set for a different PR should not apply
            globalThis.allReviewTimestamps.set('2', new Map([[10, T_NEW]]));
            const result = computeUnreadAuthorIds(makePR(1), [thread]);
            expect(result.has('alice')).toBe(true);
        });

        it('aggregates multiple authors across multiple threads', () => {
            const threads = [
                makeThread(10, 'alice', ISO_NEW),
                makeThread(11, 'bob', ISO_NEW),
                makeThread(12, 'carol', ISO_OLD),
            ];
            globalThis.allReviewTimestamps.set('1', new Map([
                [10, T_OLD], // alice: unread (comment newer than ts)
                [11, T_NEW], // bob: reviewed
                // carol: no ts → unread
            ]));
            const result = computeUnreadAuthorIds(makePR(1), threads);
            expect(result.has('alice')).toBe(true);
            expect(result.has('bob')).toBe(false);
            expect(result.has('carol')).toBe(true);
        });
    });
});
