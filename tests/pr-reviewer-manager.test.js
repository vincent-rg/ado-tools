// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing the module
globalThis.PRThreadsUtils = {
    isThreadDeleted: vi.fn((t) => !!t.isDeleted),
};
globalThis.ADOContent = {
    escapeHtml: vi.fn((s) => s),
};
globalThis.AvatarLoader = {
    getCached: vi.fn(() => null),
};
globalThis.currentUserId = null;

const { renderAvatarWithBadges, renderReviewersSection, renderOtherAuthorsSection, renderVoteDropdown } =
    await import('../js/pr-reviewer-manager.js');

describe('renderAvatarWithBadges', () => {
    const user = { id: 'u1', displayName: 'Jane Doe' };

    it('renders avatar-wrapper with user id', () => {
        const html = renderAvatarWithBadges(user, 0, 0);
        expect(html).toContain('data-user-id="u1"');
    });

    it('renders initials fallback when no cached avatar and no user id', () => {
        const html = renderAvatarWithBadges({ displayName: 'Jane Doe' }, 0, 0);
        expect(html).toContain('JD');
        expect(html).toContain('avatar-fallback');
    });

    it('renders approved vote badge', () => {
        const html = renderAvatarWithBadges(user, 10, 0);
        expect(html).toContain('vote-approved');
        expect(html).toContain('vote-badge');
    });

    it('renders approved-with-suggestions vote badge', () => {
        const html = renderAvatarWithBadges(user, 5, 0);
        expect(html).toContain('vote-approved-suggestions');
    });

    it('renders waiting vote badge', () => {
        const html = renderAvatarWithBadges(user, -5, 0);
        expect(html).toContain('vote-wait');
    });

    it('renders rejected vote badge', () => {
        const html = renderAvatarWithBadges(user, -10, 0);
        expect(html).toContain('vote-rejected');
    });

    it('does not render vote badge for vote 0 (no icon)', () => {
        const html = renderAvatarWithBadges(user, 0, 0);
        // vote 0 has no voteIcon, so no badge is rendered
        expect(html).not.toContain('vote-badge');
    });

    it('does not render vote badge when vote is undefined', () => {
        const html = renderAvatarWithBadges(user, undefined, 0);
        expect(html).not.toContain('vote-badge');
    });

    it('renders thread count badge when count > 0', () => {
        const html = renderAvatarWithBadges(user, 0, 3);
        expect(html).toContain('thread-badge');
        expect(html).toContain('>3<');
    });

    it('does not render thread badge when count is 0', () => {
        const html = renderAvatarWithBadges(user, 0, 0);
        expect(html).not.toContain('thread-badge');
    });

    it('renders PR author badge', () => {
        const html = renderAvatarWithBadges(user, 0, 0, true);
        expect(html).toContain('author-badge');
        expect(html).toContain('PR Author');
    });

    it('does not render author badge by default', () => {
        const html = renderAvatarWithBadges(user, 0, 0, false);
        expect(html).not.toContain('author-badge');
    });

    it('renders cached avatar image when available', () => {
        AvatarLoader.getCached.mockReturnValueOnce('blob:avatar-url');
        const html = renderAvatarWithBadges(user, 0, 0);
        expect(html).toContain('src="blob:avatar-url"');
    });

    it('renders pending avatar when no cache hit', () => {
        AvatarLoader.getCached.mockReturnValueOnce(null);
        const html = renderAvatarWithBadges(user, 0, 0);
        expect(html).toContain('avatar-pending');
        expect(html).toContain('avatar-placeholder');
    });

    it('includes vote text in title', () => {
        const html = renderAvatarWithBadges(user, 10, 0);
        expect(html).toContain('Jane Doe - Approved');
    });
});

describe('renderReviewersSection', () => {
    it('renders required and optional sections', () => {
        const reviewers = [
            { id: 'r1', displayName: 'Alice', vote: 10, isRequired: true },
            { id: 'r2', displayName: 'Bob', vote: 0, isRequired: false },
        ];
        const html = renderReviewersSection(reviewers, {}, 'author1');
        expect(html).toContain('Required Reviewers');
        expect(html).toContain('Optional Reviewers');
    });

    it('shows "None" when no required reviewers', () => {
        const reviewers = [{ id: 'r1', displayName: 'Bob', vote: 0, isRequired: false }];
        const html = renderReviewersSection(reviewers, {}, 'author1');
        expect(html).toContain('no-reviewers');
    });

    it('handles null reviewers', () => {
        const html = renderReviewersSection(null, {}, 'author1');
        expect(html).toContain('Required Reviewers');
        expect(html).toContain('Optional Reviewers');
    });

    it('renders add reviewer buttons', () => {
        const html = renderReviewersSection([], {}, 'author1');
        expect(html).toContain('Add required reviewer');
        expect(html).toContain('Add optional reviewer');
    });
});

describe('renderOtherAuthorsSection', () => {
    it('returns empty string when no other authors', () => {
        const threads = [];
        const reviewers = [];
        expect(renderOtherAuthorsSection(threads, reviewers, {}, 'author1')).toBe('');
    });

    it('excludes reviewers from other authors', () => {
        const threads = [
            { comments: [{ author: { id: 'r1', displayName: 'Alice' }, commentType: 1 }] },
        ];
        const reviewers = [{ id: 'r1' }];
        expect(renderOtherAuthorsSection(threads, reviewers, {}, 'author1')).toBe('');
    });

    it('includes non-reviewer authors with real comments', () => {
        const threads = [
            { comments: [{ author: { id: 'u1', displayName: 'Charlie' }, commentType: 1 }] },
        ];
        const reviewers = [{ id: 'r1' }];
        const html = renderOtherAuthorsSection(threads, reviewers, {}, 'author1');
        expect(html).toContain('Other Thread Authors');
        expect(html).toContain('data-user-id="u1"');
    });

    it('excludes system comments', () => {
        const threads = [
            { comments: [{ author: { id: 'u1', displayName: 'Bot' }, commentType: 'system' }] },
        ];
        const html = renderOtherAuthorsSection(threads, [], {}, 'author1');
        expect(html).toBe('');
    });

    it('excludes deleted threads', () => {
        const threads = [
            { isDeleted: true, comments: [{ author: { id: 'u1', displayName: 'Charlie' }, commentType: 1 }] },
        ];
        const html = renderOtherAuthorsSection(threads, [], {}, 'author1');
        expect(html).toBe('');
    });

    it('deduplicates authors across multiple threads', () => {
        const threads = [
            { comments: [{ author: { id: 'u1', displayName: 'Charlie' }, commentType: 1 }] },
            { comments: [{ author: { id: 'u1', displayName: 'Charlie' }, commentType: 'text' }] },
        ];
        const html = renderOtherAuthorsSection(threads, [], {}, 'author1');
        // Should contain exactly one avatar wrapper for u1
        const matches = html.match(/data-user-id="u1"/g);
        // renderAvatarWithBadges emits data-user-id twice (wrapper + img), so count wrapper occurrences
        const wrapperMatches = html.match(/avatar-wrapper/g);
        expect(wrapperMatches).toHaveLength(1);
    });
});

describe('renderVoteDropdown', () => {
    beforeEach(() => {
        globalThis.currentUserId = 'me';
        globalThis.currentPRData = { reviewers: [{ id: 'me', vote: 0 }] };
    });

    it('returns empty string when no currentUserId', () => {
        globalThis.currentUserId = null;
        expect(renderVoteDropdown(0)).toBe('');
    });

    it('renders select with all 5 vote options', () => {
        const html = renderVoteDropdown(0);
        expect(html).toContain('No vote');
        expect(html).toContain('Approve');
        expect(html).toContain('Approve with suggestions');
        expect(html).toContain('Wait for author');
        expect(html).toContain('Reject');
    });

    it('marks current vote as selected', () => {
        const html = renderVoteDropdown(10);
        expect(html).toContain('value="10" selected');
    });

    it('applies vote-active class for approved', () => {
        const html = renderVoteDropdown(10);
        expect(html).toContain('vote-active-approved');
    });

    it('applies vote-active class for rejected', () => {
        const html = renderVoteDropdown(-10);
        expect(html).toContain('vote-active-rejected');
    });

    it('adds not-reviewer class when user is not a reviewer', () => {
        globalThis.currentPRData = { reviewers: [] };
        const html = renderVoteDropdown(0);
        expect(html).toContain('vote-not-reviewer');
        expect(html).toContain('Voting will add you as an optional reviewer');
    });
});
