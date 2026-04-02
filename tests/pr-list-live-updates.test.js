import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing
globalThis.allPRs = [];
globalThis.filteredPRs = [];
globalThis.allAuthors = new Set();
globalThis.allReviewers = new Set();
globalThis.allCommentAuthors = new Set();
globalThis.prCommentCounts = {};
globalThis.grayedOutPRKeys = new Set();
globalThis.newPRsDetected = [];
globalThis.newFilterMatchesDetected = [];
globalThis.liveUpdatesEnabled = true;
globalThis.backgroundPollInterval = null;
globalThis.lastUserInteraction = Date.now();
globalThis.lastBackgroundPoll = 0;
globalThis.isBackgroundPolling = false;
globalThis.loadedRepoKeys = new Map();

globalThis.ADOConfig = { get: vi.fn(() => ({})) };
globalThis.ADOAPI = { getPRs: vi.fn(() => Promise.resolve({ value: [] })) };
globalThis.ADOUI = { renderStatusBadge: vi.fn(() => '<span>badge</span>') };
globalThis.ADOContent = { escapeHtml: vi.fn((s) => s) };
globalThis.AvatarLoader = { loadPending: vi.fn() };
globalThis.PRListUtils = {
    getPRKey: (pr) => `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`,
    hasPRChanged: vi.fn(() => false),
};

globalThis.getSelectedRepos = vi.fn(() => []);
globalThis.getPRKey = (pr) => PRListUtils.getPRKey(pr);
globalThis.prMatchesFilters = vi.fn(() => true);
globalThis.getCurrentFilters = vi.fn(() => ({ statuses: [] }));
globalThis.hasPRChanged = vi.fn((a, b) => PRListUtils.hasPRChanged(a, b));
globalThis.displayPRs = vi.fn();
globalThis.updateSelectedFilters = vi.fn();
globalThis.updateURL = vi.fn();
globalThis.updatePRSourceDisplay = vi.fn();
globalThis.processPriorityQueue = vi.fn(() => Promise.resolve());
globalThis.getReviewerAvatarsHtml = vi.fn(() => '');
globalThis.updateReviewerThreadBadges = vi.fn();
globalThis.applyFilters = vi.fn();

globalThis.document = {
    hidden: false,
    getElementById: vi.fn(() => ({
        style: {},
        classList: { contains: vi.fn(() => false), add: vi.fn(), remove: vi.fn() },
        querySelector: vi.fn(() => ({ classList: { add: vi.fn(), remove: vi.fn() } })),
        textContent: '',
    })),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
};
globalThis.localStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
};
globalThis.console = { ...console, log: vi.fn() };
globalThis.setInterval = vi.fn(() => 123);
globalThis.clearInterval = vi.fn();

const {
    detectChanges,
    isUserActivelyInteracting,
    POLL_INTERVAL,
    USER_INTERACTION_PAUSE,
    VISIBILITY_POLL_COOLDOWN,
} = await import('../js/pr-list-live-updates.js');

const makePR = (id, project = 'Proj', repoId = 'r1') => ({
    pullRequestId: id,
    _project: project,
    _repo: { id: repoId },
    status: 'active',
    title: `PR ${id}`,
    isDraft: false,
    description: '',
    createdBy: { displayName: 'Alice' },
    reviewers: [{ displayName: 'Bob' }],
});

describe('pr-list-live-updates', () => {
    describe('constants', () => {
        it('POLL_INTERVAL is 2 minutes', () => {
            expect(POLL_INTERVAL).toBe(2 * 60 * 1000);
        });

        it('USER_INTERACTION_PAUSE is 10 seconds', () => {
            expect(USER_INTERACTION_PAUSE).toBe(10 * 1000);
        });

        it('VISIBILITY_POLL_COOLDOWN is 20 seconds', () => {
            expect(VISIBILITY_POLL_COOLDOWN).toBe(20 * 1000);
        });
    });

    describe('isUserActivelyInteracting', () => {
        it('returns true when interaction was recent', () => {
            globalThis.lastUserInteraction = Date.now() - 1000; // 1 second ago
            expect(isUserActivelyInteracting()).toBe(true);
        });

        it('returns false when interaction was long ago', () => {
            globalThis.lastUserInteraction = Date.now() - 30000; // 30 seconds ago
            expect(isUserActivelyInteracting()).toBe(false);
        });

        it('returns false at exactly the threshold', () => {
            globalThis.lastUserInteraction = Date.now() - USER_INTERACTION_PAUSE;
            expect(isUserActivelyInteracting()).toBe(false);
        });

        it('returns true just before the threshold', () => {
            globalThis.lastUserInteraction = Date.now() - USER_INTERACTION_PAUSE + 1;
            expect(isUserActivelyInteracting()).toBe(true);
        });
    });

    describe('detectChanges', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            globalThis.prMatchesFilters = vi.fn(() => true);
            globalThis.getCurrentFilters = vi.fn(() => ({ statuses: [] }));
            PRListUtils.hasPRChanged = vi.fn(() => false);
            globalThis.hasPRChanged = vi.fn((a, b) => PRListUtils.hasPRChanged(a, b));
        });

        it('returns no changes for identical arrays', () => {
            const prs = [makePR(1), makePR(2)];
            const changes = detectChanges(prs, [...prs]);
            expect(changes.hasChanges).toBe(false);
            expect(changes.newPRs).toHaveLength(0);
            expect(changes.updatedPRs).toHaveLength(0);
            expect(changes.removedPRKeys).toHaveLength(0);
        });

        it('detects new PRs', () => {
            const old = [makePR(1)];
            const fresh = [makePR(1), makePR(2)];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.newPRs).toHaveLength(1);
            expect(changes.newPRs[0].pullRequestId).toBe(2);
        });

        it('detects removed PRs', () => {
            const old = [makePR(1), makePR(2)];
            const fresh = [makePR(1)];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.removedPRKeys).toHaveLength(1);
            expect(changes.removedPRKeys[0]).toBe('Proj/r1/2');
        });

        it('detects updated PRs when hasPRChanged returns true', () => {
            PRListUtils.hasPRChanged = vi.fn(() => true);
            globalThis.hasPRChanged = vi.fn(() => true);
            const old = [makePR(1)];
            const fresh = [{ ...makePR(1), title: 'Updated' }];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.updatedPRs).toHaveLength(1);
            expect(changes.updatedPRs[0].prKey).toBe('Proj/r1/1');
        });

        it('does not flag unchanged PRs as updated', () => {
            PRListUtils.hasPRChanged = vi.fn(() => false);
            globalThis.hasPRChanged = vi.fn(() => false);
            const old = [makePR(1)];
            const fresh = [makePR(1)];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(false);
            expect(changes.updatedPRs).toHaveLength(0);
        });

        it('populates newFilterMatches for new PRs matching filters', () => {
            globalThis.prMatchesFilters = vi.fn(() => true);
            const old = [];
            const fresh = [makePR(1)];
            const changes = detectChanges(old, fresh);
            expect(changes.newFilterMatches).toHaveLength(1);
        });

        it('does not add to newFilterMatches when filter rejects', () => {
            globalThis.prMatchesFilters = vi.fn(() => false);
            const old = [];
            const fresh = [makePR(1)];
            const changes = detectChanges(old, fresh);
            expect(changes.newFilterMatches).toHaveLength(0);
        });

        it('handles empty old and fresh arrays', () => {
            const changes = detectChanges([], []);
            expect(changes.hasChanges).toBe(false);
        });

        it('handles complete replacement of PRs', () => {
            const old = [makePR(1), makePR(2)];
            const fresh = [makePR(3), makePR(4)];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.newPRs).toHaveLength(2);
            expect(changes.removedPRKeys).toHaveLength(2);
        });

        it('detects changes across different repos', () => {
            const old = [makePR(1, 'ProjA', 'r1')];
            const fresh = [makePR(1, 'ProjA', 'r1'), makePR(1, 'ProjB', 'r2')];
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.newPRs).toHaveLength(1);
            expect(changes.newPRs[0]._project).toBe('ProjB');
        });

        it('correctly uses prKey for matching (same ID, different repo)', () => {
            const old = [makePR(1, 'Proj', 'r1')];
            const fresh = [makePR(1, 'Proj', 'r2')]; // same PR ID but different repo
            const changes = detectChanges(old, fresh);
            expect(changes.hasChanges).toBe(true);
            expect(changes.newPRs).toHaveLength(1);
            expect(changes.removedPRKeys).toHaveLength(1);
        });
    });
});
