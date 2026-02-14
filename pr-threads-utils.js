/**
 * PR Threads Utilities
 * Pure functions extracted from ado-pr-threads.html for testability.
 */

const PRThreadsUtils = {
    /**
     * Calculate file change statistics from iteration change entries
     * @param {Array} changeEntries - Array of { changeType } objects
     * @returns {object} { totalFiles, added, modified, deleted, renamed }
     */
    calculateFileChangeStats(changeEntries) {
        const stats = {
            totalFiles: 0,
            added: 0,
            modified: 0,
            deleted: 0,
            renamed: 0
        };

        changeEntries.forEach(entry => {
            stats.totalFiles++;
            const changeType = entry.changeType;
            // changeType can be: add, edit, delete, rename, etc.
            // It can also be a combination like "edit, rename"
            if (changeType.includes('add')) {
                stats.added++;
            } else if (changeType.includes('delete')) {
                stats.deleted++;
            } else if (changeType.includes('rename') && !changeType.includes('edit')) {
                stats.renamed++;
            } else if (changeType.includes('edit')) {
                stats.modified++;
            }
        });

        return stats;
    },

    /**
     * Count active threads grouped by first comment author ID
     * @param {Array} threads - Thread objects from ADO API
     * @returns {object} Map of authorId -> count
     */
    getActiveThreadCounts(threads) {
        const counts = {};
        threads.forEach(thread => {
            if (thread.isDeleted) return;
            const status = thread.status;
            if (status === 'active' || status === 'Active' || status === 1) {
                const firstComment = thread.comments && thread.comments[0];
                const commentType = firstComment?.commentType;
                // Only count threads with real comments (text type)
                const isRealComment = commentType === 1 || commentType === 'text';
                const authorId = firstComment?.author?.id;
                if (authorId && isRealComment) {
                    counts[authorId] = (counts[authorId] || 0) + 1;
                }
            }
        });
        return counts;
    },

    /**
     * Identify blockers preventing PR completion
     * @param {object} checksData - { policies: [...] }
     * @param {object} prData - { mergeStatus }
     * @param {object} deps - Dependencies
     * @param {function} deps.formatPolicy - ChecksFormatter.formatPolicy function
     * @returns {Array} Array of { type, message, status? } blockers
     */
    getCompletionBlockers(checksData, prData, deps) {
        const { formatPolicy } = deps;
        const blockers = [];

        // Check merge status
        if (prData.mergeStatus === 'conflicts') {
            blockers.push({
                type: 'conflict',
                message: 'This PR has merge conflicts that must be resolved'
            });
        }

        // Check required policies
        if (checksData && checksData.policies) {
            checksData.policies.forEach(p => {
                const isBlocking = p.configuration?.isBlocking;
                const status = p.status;

                if (isBlocking && status !== 'approved') {
                    const { label } = formatPolicy(p);
                    blockers.push({
                        type: 'policy',
                        status: status,
                        message: `Required policy not met: ${label}`
                    });
                }
            });
        }

        return blockers;
    },

    /**
     * Strip markdown formatting for plain text display
     * @param {string} text - Markdown text
     * @returns {string} Plain text
     */
    stripMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/```[\s\S]*?```/g, '[code]')
            .replace(/`[^`]+`/g, '[code]')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[*_~#>]/g, '')
            .trim();
    },

    /**
     * Generate cache key for line stats
     * @param {object} config - { organization, project, repository }
     * @param {number} prId - Pull request ID
     * @param {number} iterationCount - Number of iterations
     * @returns {string} Cache key
     */
    getLineStatsCacheKey(config, prId, iterationCount) {
        return `line-stats-${config.organization}-${config.project}-${config.repository}-${prId}-${iterationCount}`;
    }
};

// Browser
if (typeof window !== 'undefined') {
    window.PRThreadsUtils = PRThreadsUtils;
}

// Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PRThreadsUtils;
}
