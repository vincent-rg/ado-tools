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
     * Returns true if a thread should be treated as deleted.
     * A thread is deleted if thread.isDeleted is true, or if its first comment is deleted.
     * @param {object} thread - Thread object from ADO API
     * @returns {boolean}
     */
    isThreadDeleted(thread) {
        return thread.isDeleted === true || (thread.comments && thread.comments[0]?.isDeleted === true);
    },

    /**
     * Count active threads grouped by first comment author ID
     * @param {Array} threads - Thread objects from ADO API
     * @returns {object} Map of authorId -> count
     */
    getActiveThreadCounts(threads) {
        const counts = {};
        threads.forEach(thread => {
            if (PRThreadsUtils.isThreadDeleted(thread)) return;
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

                // Skip "Require a merge strategy" — our completion flow always sets one
                const typeName = (p.configuration?.type?.displayName || '').toLowerCase();
                if (typeName.includes('merge strategy')) return;

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
    },

    /**
     * Build rename maps (old↔new path) from change entries that include renames.
     * @param {Array} changeEntries - Array of iteration change entries
     * @returns {{ oldToNew: Map<string,string>, newToOld: Map<string,string> }}
     */
    buildRenameMaps(changeEntries) {
        const oldToNew = new Map();
        const newToOld = new Map();
        for (const entry of changeEntries) {
            if (!entry.item?.path) continue;
            const ct = (entry.changeType || '').toLowerCase();
            if (ct.includes('rename')) {
                const oldPath = entry.sourceServerItem || entry.originalPath;
                if (oldPath) {
                    oldToNew.set(oldPath, entry.item.path);
                    newToOld.set(entry.item.path, oldPath);
                }
            }
        }
        return { oldToNew, newToOld };
    },

    /**
     * Build thread-by-file-path index, changed file set, and commented (unchanged) file set.
     * Threads are cross-mapped across renames so lookups by either old or new path work.
     * @param {Array} allThreads - Thread objects from ADO API
     * @param {Array} allChangeEntries - Iteration change entries (current view)
     * @param {{ oldToNew: Map, newToOld: Map }} renameMaps - Cumulative rename maps from full PR
     * @returns {{ threadsByFilePath: Map, changedFilePaths: Set, commentedFilePaths: Set }}
     */
    buildThreadsByFilePath(allThreads, allChangeEntries, renameMaps) {
        const threadsByFilePath = new Map();
        const commentedFilePaths = new Set();
        const changedFilePaths = new Set();
        const { oldToNew, newToOld } = renameMaps;

        for (const thread of allThreads) {
            const fp = thread.threadContext?.filePath;
            if (!fp) continue;
            const hasRealComment = thread.comments?.some(c => c.commentType !== 'system');
            if (!hasRealComment) continue;

            if (!threadsByFilePath.has(fp)) threadsByFilePath.set(fp, []);
            threadsByFilePath.get(fp).push(thread);

            const newPath = oldToNew.get(fp);
            if (newPath && newPath !== fp) {
                if (!threadsByFilePath.has(newPath)) threadsByFilePath.set(newPath, []);
                threadsByFilePath.get(newPath).push(thread);
            }

            const oldPath = newToOld.get(fp);
            if (oldPath && oldPath !== fp) {
                if (!threadsByFilePath.has(oldPath)) threadsByFilePath.set(oldPath, []);
                threadsByFilePath.get(oldPath).push(thread);
            }
        }

        for (const entry of allChangeEntries) {
            if (entry.item?.path && entry.item.gitObjectType !== 'tree' && !entry.item.path.endsWith('/')) {
                changedFilePaths.add(entry.item.path);
            }
        }

        for (const fp of threadsByFilePath.keys()) {
            if (changedFilePaths.has(fp)) continue;
            // Only mark as commented if there's at least one non-deleted thread
            if (!threadsByFilePath.get(fp).some(t => !t.isDeleted)) continue;
            const renamedTo = oldToNew.get(fp);
            const renamedFrom = newToOld.get(fp);
            if ((renamedTo && changedFilePaths.has(renamedTo)) || (renamedFrom && changedFilePaths.has(renamedFrom))) continue;
            commentedFilePaths.add(fp);
        }

        return { threadsByFilePath, changedFilePaths, commentedFilePaths };
    },

    /**
     * Return qualifying "other user" comments from a thread:
     * non-deleted, non-system/codeChange, not authored by currentUserId.
     * @param {object} thread
     * @param {string|null} currentUserId
     * @returns {object[]}
     */
    getOtherUserComments(thread, currentUserId) {
        if (!thread.comments) return [];
        return thread.comments.filter(c => {
            if (c.isDeleted) return false;
            const ct = c.commentType;
            if (ct === 'system' || ct === 3 || ct === 'codeChange' || ct === 2) return false;
            if (!c.author?.id) return false;
            if (currentUserId && c.author.id === currentUserId) return false;
            return true;
        });
    },

    /**
     * True if the thread has at least one unread comment from another user.
     * @param {object} thread
     * @param {Map<number,number>} reviewTimestamps - Map of threadId → ms timestamp
     * @param {string|null} currentUserId
     * @returns {boolean}
     */
    threadHasUnread(thread, reviewTimestamps, currentUserId) {
        const others = PRThreadsUtils.getOtherUserComments(thread, currentUserId);
        if (others.length === 0) return false;
        const ts = (reviewTimestamps instanceof Map) ? reviewTimestamps.get(Number(thread.id)) : undefined;
        if (ts === undefined) return true;
        return others.some(c => new Date(c.publishedDate).getTime() > ts);
    },

    /**
     * Test whether a thread matches the given filter settings.
     * @param {object} thread - Thread object from ADO API
     * @param {object} filters - Filter state
     * @param {boolean} filters.showDeleted - Include deleted threads
     * @param {string[]} filters.selectedStatuses - Allowed status values; empty = all allowed
     * @param {string} filters.selectedAuthor - Required first-comment author displayName; empty = any
     * @param {string} filters.selectedCommentAuthor - Required any-comment author displayName; empty = any
     * @param {string} filters.searchText - Text that must appear in at least one comment; empty = any
     * @param {boolean} [filters.unreadOnly] - Only include threads with unread comments
     * @param {object} deps - Dependencies
     * @param {function} deps.normalize - Accent-insensitive normalizer (e.g. ADOSearch.normalize)
     * @param {Map<number,number>} [deps.reviewTimestamps] - Map of threadId → ms timestamp
     * @param {string|null} [deps.currentUserId] - Current user's ID
     * @returns {boolean}
     */
    threadMatchesFilters(thread, filters, deps) {
        const { showDeleted, selectedStatuses, selectedAuthor, selectedCommentAuthor, searchText, unreadOnly } = filters;
        const { normalize, reviewTimestamps, currentUserId } = deps;

        if (!showDeleted && PRThreadsUtils.isThreadDeleted(thread)) {
            return false;
        }

        if (selectedStatuses && selectedStatuses.length > 0) {
            if (thread.status === undefined) {
                if (!selectedStatuses.includes('noStatus')) return false;
            } else {
                const status = thread.status.toLowerCase();
                const selectedLower = selectedStatuses.map(s => s.toLowerCase());
                if (!selectedLower.includes(status)) return false;
            }
        }

        if (selectedAuthor) {
            const first = thread.comments?.[0];
            if (!first || first.author?.displayName !== selectedAuthor) return false;
        }

        if (selectedCommentAuthor) {
            const has = thread.comments?.some(c => c.author?.displayName === selectedCommentAuthor);
            if (!has) return false;
        }

        if (searchText) {
            const searchNorm = normalize(searchText);
            const has = thread.comments?.some(c => c.content && normalize(c.content).includes(searchNorm));
            if (!has) return false;
        }

        if (unreadOnly) {
            const ts = (reviewTimestamps instanceof Map) ? reviewTimestamps : new Map();
            if (!PRThreadsUtils.threadHasUnread(thread, ts, currentUserId ?? null)) return false;
        }

        return true;
    },

    /**
     * Build threadContext and pullRequestThreadContext for a file-level comment.
     * @param {string} filePath - The file path to comment on
     * @param {number|null} selectedIterationStart - Selected iteration start (null = all)
     * @param {number|null} selectedIterationEnd - Selected iteration end (null = all)
     * @param {number} allIterationsLength - Total number of iterations
     * @param {Array} allChangeEntries - Iteration change entries with item.path and changeTrackingId
     * @returns {{ threadContext: object, pullRequestThreadContext: object }}
     */
    buildFileCommentContext(filePath, selectedIterationStart, selectedIterationEnd, allIterationsLength, allChangeEntries) {
        const threadContext = { filePath };

        const iterationEnd = selectedIterationEnd || allIterationsLength;
        const iterationStart = selectedIterationStart != null
            ? Math.max(1, selectedIterationStart - 1)
            : iterationEnd;

        const pullRequestThreadContext = {
            iterationContext: {
                firstComparingIteration: iterationStart,
                secondComparingIteration: iterationEnd
            }
        };

        const changeEntry = allChangeEntries.find(e => e.item?.path === filePath);
        if (changeEntry && changeEntry.changeTrackingId != null) {
            pullRequestThreadContext.changeTrackingId = changeEntry.changeTrackingId;
        }

        return { threadContext, pullRequestThreadContext };
    },

    /**
     * Find the last iteration whose createdDate is strictly before the given time.
     * Scans backwards so the first match is the closest-before iteration.
     */
    getLastIterationBeforeTime(sortedIterations, time) {
        for (let i = sortedIterations.length - 1; i >= 0; i--) {
            if (new Date(sortedIterations[i].createdDate) < time) {
                return sortedIterations[i];
            }
        }
        return null;
    },

    /**
     * Build iteration range links for a comment (before/after/complete).
     * Returns link flags, human-readable ranges ("1..3"), and numeric start/end values.
     */
    getIterationLinksForComment(comment, thread, iterations, isFirstComment = false) {
        if (!iterations || iterations.length === 0) {
            return { beforeLink: null, afterLink: null, completeLink: null };
        }

        const sortedIterations = [...iterations].sort((a, b) =>
            new Date(a.createdDate) - new Date(b.createdDate)
        );

        const commentTime = new Date(comment.publishedDate);
        const latestIteration = sortedIterations[sortedIterations.length - 1];

        // For the first comment, use the thread's secondComparingIteration (what ADO recorded)
        // For subsequent comments, calculate based on timestamp
        let targetIterationId;
        if (isFirstComment) {
            targetIterationId = thread.pullRequestThreadContext?.iterationContext?.secondComparingIteration;
        }
        // Fallback to timestamp-based if not first comment or not available
        if (targetIterationId === null || targetIterationId === undefined) {
            const lastBefore = this.getLastIterationBeforeTime(sortedIterations, commentTime);
            targetIterationId = lastBefore ? lastBefore.id : sortedIterations[0].id;
        }

        // Check if there are iterations after this comment
        const hasIterationsAfter = targetIterationId < latestIteration.id;

        let beforeLink = null;
        let afterLink = null;
        let completeLink = null;
        let beforeRange = null;
        let afterRange = null;
        let completeRange = null;
        let beforeIterStart = null, beforeIterEnd = null;
        let afterIterStart = null, afterIterEnd = null;

        const formatRange = (start, end) => start === end ? `${start}` : `${start}..${end}`;

        // Only show before/after links if there are iterations after (otherwise it's same as complete)
        if (hasIterationsAfter) {
            beforeLink = true;
            beforeRange = formatRange(1, targetIterationId);
            beforeIterStart = 1;
            beforeIterEnd = targetIterationId;

            afterLink = true;
            afterRange = formatRange(targetIterationId + 1, latestIteration.id);
            afterIterStart = targetIterationId + 1;
            afterIterEnd = latestIteration.id;
        }

        completeLink = true;
        completeRange = formatRange(1, latestIteration.id);
        // complete = all iterations (null/null = "All" mode in Files view)
        const completeIterStart = null;
        const completeIterEnd = null;

        return { beforeLink, afterLink, completeLink, beforeRange, afterRange, completeRange,
            beforeIterStart, beforeIterEnd, afterIterStart, afterIterEnd, completeIterStart, completeIterEnd };
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
