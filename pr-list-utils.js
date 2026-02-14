/**
 * PR List Utilities
 * Pure functions extracted from ado-pr-list.html for testability.
 */

const PRListUtils = {
    /**
     * Get relative time string from a timestamp
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {number} [now] - Current time (for testing), defaults to Date.now()
     * @returns {string} Human-readable relative time
     */
    getTimeAgo(timestamp, now) {
        const seconds = Math.floor(((now || Date.now()) - timestamp) / 1000);

        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    },

    /**
     * Generate unique key for a PR
     * @param {object} pr - PR object with _project, _repo.id, pullRequestId
     * @returns {string} Unique key
     */
    getPRKey(pr) {
        return `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
    },

    /**
     * Check if important PR fields have changed
     * @param {object} oldPR - Previous PR data
     * @param {object} freshPR - Fresh PR data
     * @returns {boolean} True if PR has changed
     */
    hasPRChanged(oldPR, freshPR) {
        return (
            oldPR.status !== freshPR.status ||
            oldPR.title !== freshPR.title ||
            oldPR.isDraft !== freshPR.isDraft ||
            JSON.stringify(oldPR.reviewers) !== JSON.stringify(freshPR.reviewers) ||
            oldPR.description !== freshPR.description
        );
    },

    /**
     * Check if a PR matches the given filters
     * @param {object} pr - PR object
     * @param {object} filters - Filter criteria
     * @param {object} deps - Dependencies
     * @param {function} deps.normalize - ADOSearch.normalize function
     * @param {object} [deps.commentCounts] - prCommentCounts cache (keyed by prKey)
     * @returns {boolean} True if PR matches all filters
     */
    prMatchesFilters(pr, filters, deps) {
        const { normalize, commentCounts } = deps;

        // PR ID filter
        if (filters.prId && pr.pullRequestId.toString() !== filters.prId) {
            return false;
        }

        // Title filter - subsequence matching
        if (filters.title) {
            const titleNorm = normalize(pr.title);
            const pieces = normalize(filters.title).split(/\s+/).filter(p => p.length > 0);

            let lastIndex = -1;
            for (const piece of pieces) {
                const index = titleNorm.indexOf(piece, lastIndex + 1);
                if (index === -1) {
                    return false;
                }
                lastIndex = index;
            }
        }

        // Status filter (if no statuses selected, show all)
        if (filters.statuses.length > 0) {
            if (!filters.statuses.includes(pr.status.toLowerCase())) {
                return false;
            }
        }

        // Created by filter (semicolon-separated, match ANY)
        if (filters.createdBy) {
            const authors = filters.createdBy.split(';').map(a => a.trim()).filter(a => a.length > 0);
            if (authors.length > 0) {
                const authorName = normalize(pr.createdBy.displayName);
                const matchesAny = authors.some(a => authorName.includes(a));
                if (!matchesAny) {
                    return false;
                }
            }
        }

        // Assigned to filter (semicolon-separated, match ANY)
        if (filters.assignedTo) {
            const reviewerFilters = filters.assignedTo.split(';').map(r => r.trim()).filter(r => r.length > 0);
            if (reviewerFilters.length > 0) {
                const matchesAny = reviewerFilters.some(rf =>
                    pr.reviewers.some(reviewer =>
                        normalize(reviewer.displayName).includes(rf)
                    )
                );
                if (!matchesAny) {
                    return false;
                }
            }
        }

        // Comment author filter
        if (filters.commentAuthor) {
            const prKey = `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
            const cached = commentCounts && commentCounts[prKey];
            if (cached && cached.authorObjects) {
                const hasCommentAuthor = Object.values(cached.authorObjects).some(author =>
                    normalize(author.displayName).includes(filters.commentAuthor)
                );
                if (!hasCommentAuthor) {
                    return false;
                }
            } else {
                // Comment data not loaded yet - hide until data arrives
                return false;
            }
        }

        return true;
    }
};

// Browser
if (typeof window !== 'undefined') {
    window.PRListUtils = PRListUtils;
}

// Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PRListUtils;
}
