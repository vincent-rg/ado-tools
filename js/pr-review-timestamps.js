/**
 * pr-review-timestamps.js
 *
 * Tracks per-thread review progress for the current user.
 * A "review timestamp" marks the point up to which the user has read
 * comments from other users in a thread. Timestamps are persisted in the
 * local ado-server.db SQLite database via the /review-timestamps endpoints.
 *
 * Exposes window.PRReviewTimestamps (browser) and module.exports (Node/tests).
 */
const PRReviewTimestamps = (() => {
    // Map<threadId (number), timestamp (number, ms since epoch)>
    let _cache = new Map();

    /**
     * Returns true if the comment counts as "another user's reviewable comment":
     * - not deleted
     * - not a system or code-change comment
     * - has an author id
     * - author is not the current user
     */
    function _isOtherUserComment(comment, currentUserId) {
        if (comment.isDeleted) return false;
        const ct = comment.commentType;
        if (ct === 'system' || ct === 3 || ct === 'codeChange' || ct === 2) return false;
        if (!comment.author?.id) return false;
        if (currentUserId && comment.author.id === currentUserId) return false;
        return true;
    }

    return {
        /**
         * Batch-load all review timestamps for a PR from the server.
         * Populates the internal cache and returns it.
         * @returns {Promise<Map<number, number>>}
         */
        async load(serverUrl, org, prId) {
            const qs = new URLSearchParams({ serverUrl, org, prId: String(prId) });
            const res = await fetch(`/review-timestamps?${qs}`);
            if (!res.ok) throw new Error(`review-timestamps load failed: ${res.status}`);
            const rows = await res.json();
            _cache = new Map(rows.map(r => [Number(r.threadId), Number(r.timestamp)]));
            return _cache;
        },

        /**
         * Persist a review timestamp for one thread and update the cache.
         * @param {number} timestamp - ms since epoch
         */
        async set(serverUrl, org, prId, threadId, timestamp) {
            const res = await fetch('/review-timestamps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverUrl, org, prId: String(prId), threadId: Number(threadId), timestamp: Number(timestamp) })
            });
            if (!res.ok) throw new Error(`review-timestamps set failed: ${res.status}`);
            _cache.set(Number(threadId), Number(timestamp));
        },

        /**
         * Remove the review timestamp for one thread and update the cache.
         */
        async unset(serverUrl, org, prId, threadId) {
            const qs = new URLSearchParams({ serverUrl, org, prId: String(prId), threadId: Number(threadId) });
            const res = await fetch(`/review-timestamps?${qs}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`review-timestamps unset failed: ${res.status}`);
            _cache.delete(Number(threadId));
        },

        /** Return the current in-memory cache without hitting the server. */
        getAll() {
            return _cache;
        },

        // ----------------------------------------------------------------
        // Pure query helpers — accept reviewTimestamps as an argument so
        // they are fully testable without touching the internal cache.
        // ----------------------------------------------------------------

        /**
         * True if the comment's publishedDate is at or before the review
         * timestamp recorded for its thread.
         */
        isCommentReviewed(comment, threadId, reviewTimestamps) {
            const ts = reviewTimestamps.get(Number(threadId));
            if (ts === undefined) return false;
            return new Date(comment.publishedDate).getTime() <= ts;
        },

        /**
         * Return the qualifying "other user" comments from a thread:
         * non-deleted, non-system/codeChange, not authored by currentUserId.
         */
        getOtherUserComments(thread, currentUserId) {
            if (!thread.comments) return [];
            return thread.comments.filter(c => _isOtherUserComment(c, currentUserId));
        },

        /**
         * True if the thread has at least one unread comment from another user.
         * A thread with no other-user comments is never "unread".
         */
        threadHasUnread(thread, reviewTimestamps, currentUserId) {
            const others = PRReviewTimestamps.getOtherUserComments(thread, currentUserId);
            if (others.length === 0) return false;
            const ts = reviewTimestamps.get(Number(thread.id));
            if (ts === undefined) return true;
            return others.some(c => new Date(c.publishedDate).getTime() > ts);
        }
    };
})();

if (typeof window !== 'undefined') window.PRReviewTimestamps = PRReviewTimestamps;
if (typeof module !== 'undefined' && module.exports) module.exports = PRReviewTimestamps;
