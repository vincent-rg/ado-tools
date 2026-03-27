import { describe, it, expect } from 'vitest';
import PRReviewTimestamps from '../js/pr-review-timestamps.js';

// ---- helpers ----

function makeComment({ publishedDate, authorId = 'other-user', commentType = 'text', isDeleted = false } = {}) {
    return { publishedDate, author: { id: authorId }, commentType, isDeleted };
}

function makeThread(id, comments) {
    return { id, comments };
}

const ME = 'current-user-id';
const T1 = 1710000000000; // arbitrary ms timestamp
const T2 = T1 + 60_000;
const T3 = T2 + 60_000;

// ISO strings matching the ms timestamps above
const ISO1 = new Date(T1).toISOString();
const ISO2 = new Date(T2).toISOString();
const ISO3 = new Date(T3).toISOString();

// ---- isCommentReviewed ----

describe('PRReviewTimestamps.isCommentReviewed', () => {
    it('returns false when threadId is not in the map', () => {
        const comment = makeComment({ publishedDate: ISO1 });
        expect(PRReviewTimestamps.isCommentReviewed(comment, 99, new Map())).toBe(false);
    });

    it('returns true when publishedDate equals the timestamp (boundary ≤)', () => {
        const comment = makeComment({ publishedDate: ISO1 });
        const map = new Map([[1, T1]]);
        expect(PRReviewTimestamps.isCommentReviewed(comment, 1, map)).toBe(true);
    });

    it('returns true when publishedDate is before the timestamp', () => {
        const comment = makeComment({ publishedDate: ISO1 });
        const map = new Map([[1, T2]]);
        expect(PRReviewTimestamps.isCommentReviewed(comment, 1, map)).toBe(true);
    });

    it('returns false when publishedDate is after the timestamp', () => {
        const comment = makeComment({ publishedDate: ISO3 });
        const map = new Map([[1, T2]]);
        expect(PRReviewTimestamps.isCommentReviewed(comment, 1, map)).toBe(false);
    });
});

// ---- getOtherUserComments ----

describe('PRReviewTimestamps.getOtherUserComments', () => {
    it('returns [] when thread.comments is undefined', () => {
        expect(PRReviewTimestamps.getOtherUserComments({ id: 1 }, ME)).toEqual([]);
    });

    it('excludes system comments (commentType "system")', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, commentType: 'system' })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes system comments (commentType 3)', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, commentType: 3 })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes codeChange comments (commentType "codeChange")', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, commentType: 'codeChange' })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes codeChange comments (commentType 2)', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, commentType: 2 })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes deleted comments', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, isDeleted: true })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes comments from the current user', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, authorId: ME })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(0);
    });

    it('excludes comments with no author.id', () => {
        const c = { publishedDate: ISO1, author: {}, commentType: 'text', isDeleted: false };
        expect(PRReviewTimestamps.getOtherUserComments(makeThread(1, [c]), ME)).toHaveLength(0);
    });

    it('includes valid other-user text comments', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1 })]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(1);
    });

    it('returns only other-user comments from a mixed list', () => {
        const t = makeThread(1, [
            makeComment({ publishedDate: ISO1, authorId: ME }),           // self — excluded
            makeComment({ publishedDate: ISO2, commentType: 'system' }),  // system — excluded
            makeComment({ publishedDate: ISO3 }),                          // other — included
        ]);
        expect(PRReviewTimestamps.getOtherUserComments(t, ME)).toHaveLength(1);
    });
});

// ---- threadHasUnread ----

describe('PRReviewTimestamps.threadHasUnread', () => {
    it('returns false when there are no other-user comments', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1, authorId: ME })]);
        expect(PRReviewTimestamps.threadHasUnread(t, new Map(), ME)).toBe(false);
    });

    it('returns false when thread has no comments at all', () => {
        expect(PRReviewTimestamps.threadHasUnread(makeThread(1, []), new Map(), ME)).toBe(false);
    });

    it('returns true when there are other-user comments and no timestamp entry', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1 })]);
        expect(PRReviewTimestamps.threadHasUnread(t, new Map(), ME)).toBe(true);
    });

    it('returns false when all other-user comments are at or before the timestamp', () => {
        const t = makeThread(1, [
            makeComment({ publishedDate: ISO1 }),
            makeComment({ publishedDate: ISO2 }),
        ]);
        const map = new Map([[1, T2]]); // reviewed up to T2
        expect(PRReviewTimestamps.threadHasUnread(t, map, ME)).toBe(false);
    });

    it('returns true when at least one comment is after the timestamp', () => {
        const t = makeThread(1, [
            makeComment({ publishedDate: ISO1 }),
            makeComment({ publishedDate: ISO3 }), // after T2
        ]);
        const map = new Map([[1, T2]]);
        expect(PRReviewTimestamps.threadHasUnread(t, map, ME)).toBe(true);
    });

    it('boundary: comment at timestamp-1 is reviewed, comment at timestamp is also reviewed', () => {
        const t = makeThread(1, [makeComment({ publishedDate: new Date(T1).toISOString() })]);
        // Reviewed up to exactly T1 — comment at T1 should be considered reviewed
        expect(PRReviewTimestamps.threadHasUnread(t, new Map([[1, T1]]), ME)).toBe(false);
    });

    it('boundary: markCommentUnread uses timestamp-1, making that comment unread again', () => {
        const t = makeThread(1, [makeComment({ publishedDate: ISO1 })]);
        // Set timestamp to T1-1 (just before the comment)
        expect(PRReviewTimestamps.threadHasUnread(t, new Map([[1, T1 - 1]]), ME)).toBe(true);
    });

    it('ignores self comments when computing unread state', () => {
        const t = makeThread(1, [
            makeComment({ publishedDate: ISO3, authorId: ME }), // self, after any review ts
        ]);
        expect(PRReviewTimestamps.threadHasUnread(t, new Map(), ME)).toBe(false);
    });
});
