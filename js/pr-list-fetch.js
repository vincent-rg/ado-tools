/**
 * pr-list-fetch.js — Comment count, iteration count, and check fetching for PR list.
 * Priority queue with rate limiting, badge/indicator updates.
 *
 * Globals read: prCommentCounts, prChecks, prIterationCounts, allPRs, allCommentAuthors,
 *   getSortedPRs, currentPage, itemsPerPage, getPRKey, isUserActivelyInteracting, applyFilters
 * Globals written: prCommentCounts, prChecks, prIterationCounts, isFetchingComments,
 *   isFetchingPriorityQueue, _bulkCommentFetchInProgress, allCommentAuthors
 */

// Comment fetch priority queue settings
const MAX_CONCURRENT_COMMENT_FETCHES = 5;
const BATCH_DELAY_MS = 200;
const MAX_CALLS_PER_CYCLE = 120;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function showFilterProgress(fetched, total) {
    const el = document.getElementById('filterProgress');
    el.style.display = '';
    updateFilterProgress(fetched, total);
}

function updateFilterProgress(fetched, total) {
    const pct = total > 0 ? Math.round((fetched / total) * 100) : 0;
    document.getElementById('filterProgressText').textContent = `Loading comment data: ${fetched} / ${total} PRs`;
    document.getElementById('filterProgressPct').textContent = `${pct}%`;
    document.getElementById('filterProgressBar').style.width = `${pct}%`;
}

function hideFilterProgress() {
    document.getElementById('filterProgress').style.display = 'none';
}

/**
 * Build priority queue for comment count fetching
 * Priority levels:
 * 1. Visible PRs (current page)
 * 2. Adjacent PRs (previous/next page)
 * 3. Stale PRs (not fetched in > 5 minutes)
 */
function buildCommentFetchQueue() {
    const queue = [];
    const now = Date.now();
    const sortedPRs = getSortedPRs();
    const commentAuthorFilterActive = document.getElementById('commentAuthorFilter')?.value.trim().length > 0;

    // When comment author filter is active, prioritize fetching unfetched PRs
    // so the filter can progressively reveal matches
    if (commentAuthorFilterActive) {
        const queuedKeys = new Set();
        // Still add visible PRs as priority 1
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, sortedPRs.length);
        sortedPRs.slice(startIndex, endIndex).forEach(pr => {
            const prKey = getPRKey(pr);
            queue.push({ pr, priority: 1, reason: 'visible' });
            queuedKeys.add(prKey);
        });

        // Add all unfetched PRs as priority 2 so the filter can resolve
        allPRs.forEach(pr => {
            const prKey = getPRKey(pr);
            if (!queuedKeys.has(prKey) && prCommentCounts[prKey] === undefined) {
                queue.push({ pr, priority: 2, reason: 'comment-filter' });
                queuedKeys.add(prKey);
            }
        });

        return queue;
    }

    if (sortedPRs.length === 0) return queue;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, sortedPRs.length);

    // Priority 1: Visible PRs (current page)
    const visiblePRs = sortedPRs.slice(startIndex, endIndex);
    visiblePRs.forEach(pr => {
        queue.push({ pr, priority: 1, reason: 'visible' });
    });

    // Priority 2: Adjacent pages (prev + next page)
    const prevPageStart = Math.max(0, startIndex - itemsPerPage);
    const prevPageEnd = startIndex;
    const nextPageStart = endIndex;
    const nextPageEnd = Math.min(endIndex + itemsPerPage, sortedPRs.length);

    if (prevPageStart < prevPageEnd) {
        const prevPagePRs = sortedPRs.slice(prevPageStart, prevPageEnd);
        prevPagePRs.forEach(pr => {
            queue.push({ pr, priority: 2, reason: 'adjacent' });
        });
    }

    if (nextPageStart < nextPageEnd) {
        const nextPagePRs = sortedPRs.slice(nextPageStart, nextPageEnd);
        nextPagePRs.forEach(pr => {
            queue.push({ pr, priority: 2, reason: 'adjacent' });
        });
    }

    // Priority 3: Stale PRs (not refreshed in > 5 minutes)
    const stalePRs = allPRs
        .map(pr => {
            const prKey = getPRKey(pr);
            const cached = prCommentCounts[prKey];
            if (!cached) return null;

            const age = now - (cached.lastFetch || 0);
            if (age > STALE_THRESHOLD_MS) {
                return { pr, age, priority: 3, reason: 'stale' };
            }
            return null;
        })
        .filter(item => item !== null)
        .sort((a, b) => b.age - a.age) // Oldest first
        .slice(0, 20); // Limit to 20 stale items

    queue.push(...stalePRs);

    return queue;
}

/**
 * Process comment fetch queue with rate limiting and budget control
 */
async function processPriorityQueue(forceRefresh = false) {
    if (isFetchingPriorityQueue) return;
    isFetchingPriorityQueue = true;

    try {
        const config = ADOConfig.get();
        const commentAuthorActive = document.getElementById('commentAuthorFilter')?.value.trim().length > 0;
        const queue = buildCommentFetchQueue();

        if (queue.length === 0) {
            isFetchingPriorityQueue = false;
            return;
        }

        // Fast path: when comment author filter is active, process visible PRs
        // normally (with checks) then fetch only comments for the rest
        if (commentAuthorActive) {
            const visibleItems = queue.filter(q => q.reason === 'visible');
            const commentFilterItems = queue.filter(q => q.reason === 'comment-filter');

            // Visible PRs: fetch comments + checks as normal
            if (visibleItems.length > 0) {
                const promises = visibleItems.flatMap(item => [
                    fetchPRCommentCount(config, item.pr, forceRefresh),
                    fetchPRChecks(config, item.pr, forceRefresh)
                ]);
                await Promise.all(promises);
            }

            // Comment-filter PRs: only fetch comments with higher throughput
            if (commentFilterItems.length > 0) {
                const COMMENT_FILTER_BATCH_SIZE = 15;
                const COMMENT_FILTER_BATCH_DELAY = 50;
                const REFRESH_INTERVAL = 5; // Re-apply filters every N batches
                const total = commentFilterItems.length;

                console.log(`Comment author filter: fetching comment data for ${total} PRs`);
                showFilterProgress(0, total);

                _bulkCommentFetchInProgress = true;
                let batchCount = 0;
                let fetched = 0;
                let currentBatch = [];
                for (let i = 0; i < commentFilterItems.length; i++) {
                    currentBatch.push(commentFilterItems[i].pr);

                    if (currentBatch.length >= COMMENT_FILTER_BATCH_SIZE || i === commentFilterItems.length - 1) {
                        const promises = currentBatch.map(pr =>
                            fetchPRCommentCount(config, pr, forceRefresh)
                        );
                        await Promise.all(promises);
                        batchCount++;
                        fetched += currentBatch.length;
                        updateFilterProgress(fetched, total);

                        // Periodically refresh the displayed results
                        if (batchCount % REFRESH_INTERVAL === 0) {
                            applyFilters();
                        }

                        if (i < commentFilterItems.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, COMMENT_FILTER_BATCH_DELAY));
                        }
                        currentBatch = [];
                    }
                }
                _bulkCommentFetchInProgress = false;
                hideFilterProgress();

                // Final refresh to show all results
                applyFilters();
                console.log(`Comment author filter: done fetching comment data`);
            }
            return;
        }

        console.log(`Processing comment fetch queue: ${queue.length} items (${queue.filter(q => q.priority === 1).length} visible, ${queue.filter(q => q.priority === 2).length} adjacent, ${queue.filter(q => q.priority === 3).length} stale)`);

        let fetchedCount = 0;
        let currentBatch = [];

        for (let i = 0; i < queue.length && fetchedCount < MAX_CALLS_PER_CYCLE; i++) {
            const item = queue[i];

            // Check if user is actively interacting - pause if so
            if (isUserActivelyInteracting() && item.priority > 1) {
                console.log('User is interacting, pausing non-visible fetches');
                break;
            }

            currentBatch.push(item.pr);
            fetchedCount++;

            // Process batch when it reaches max concurrent size or end of priority level
            const isEndOfPriority = i === queue.length - 1 || queue[i + 1].priority !== item.priority;
            const isBatchFull = currentBatch.length >= MAX_CONCURRENT_COMMENT_FETCHES;

            if (isBatchFull || isEndOfPriority) {
                // Fetch batch concurrently (comments, statuses, and policy evaluations)
                const promises = currentBatch.flatMap(pr => [
                    fetchPRCommentCount(config, pr, forceRefresh),
                    fetchPRChecks(config, pr, forceRefresh)
                ]);
                await Promise.all(promises);

                // Delay between batches (except for last batch)
                if (i < queue.length - 1 && fetchedCount < MAX_CALLS_PER_CYCLE) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }

                currentBatch = [];
            }
        }

        console.log(`Fetched comment counts for ${fetchedCount} PRs`);

    } catch (error) {
        console.error('Error processing priority queue:', error);
    } finally {
        isFetchingPriorityQueue = false;
    }
}

async function fetchCommentCountsBatch(config, prs, batchSize) {
    for (let i = 0; i < prs.length; i += batchSize) {
        const batch = prs.slice(i, i + batchSize);
        const promises = batch.map(pr => fetchPRCommentCount(config, pr));
        await Promise.all(promises);
    }
}

async function fetchPRCommentCount(config, pr, forceRefresh = false) {
    const prKey = `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
    const now = Date.now();

    // Skip if already fetched recently (unless force refresh)
    if (!forceRefresh && prCommentCounts[prKey] !== undefined) {
        // Update access time for LRU
        if (prCommentCounts[prKey].lastAccess !== undefined) {
            prCommentCounts[prKey].lastAccess = now;
        }
        return;
    }

    try {
        // Fetch threads and iterations in parallel
        const [threads, iterations] = await Promise.all([
            ADOAPI.getThreads(config, pr._project, pr._repo.id, pr.pullRequestId),
            ADOAPI.getIterations(config, pr._project, pr._repo.id, pr.pullRequestId).catch(() => ({ value: [] }))
        ]);

        // Align with PRThreadsUtils.isThreadDeleted: exclude threads where the first comment is deleted
        const allThreads = (threads.value || []).filter(thread =>
            !thread.isDeleted && !thread.comments?.[0]?.isDeleted
        );
        const activeThreads = allThreads.filter(thread =>
            thread.status === 'active' || thread.status === 'Active' || thread.status === 1
        );
        const activeCount = activeThreads.length;

        // Collect thread creators from ALL threads (for display in "other authors" column)
        // Skip system (3/'system') and codeChange (2/'codeChange') threads
        const authorObjects = {};
        allThreads.forEach(thread => {
            const firstComment = thread.comments && thread.comments[0];
            const commentType = firstComment?.commentType;
            const isRealComment = commentType === 1 || commentType === 'text';
            const author = firstComment?.author;
            if (author?.id && isRealComment && !authorObjects[author.id]) {
                authorObjects[author.id] = author;
            }
        });

        // Count active threads CREATED by each user (threads where they wrote the first comment)
        // Skip system and codeChange threads
        const authorCounts = {};
        activeThreads.forEach(thread => {
            const firstComment = thread.comments && thread.comments[0];
            const commentType = firstComment?.commentType;
            const isRealComment = commentType === 1 || commentType === 'text';
            const author = firstComment?.author;
            if (author?.id && isRealComment) {
                authorCounts[author.id] = (authorCounts[author.id] || 0) + 1;
            }
        });

        // Compute set of thread authors with at least one unread comment in a thread they started.
        // Uses global currentUserId + allReviewTimestamps (populated in ado-pr-list.html).
        const unreadAuthors = computeUnreadAuthorIds(pr, activeThreads);

        prCommentCounts[prKey] = {
            count: activeCount,
            authorCounts: authorCounts,
            authorObjects: authorObjects,
            unreadAuthors: unreadAuthors,
            lastFetch: now,
            lastAccess: now
        };

        // Collect comment author names for autocomplete
        Object.values(authorObjects).forEach(author => {
            if (author.displayName) {
                allCommentAuthors.add(author.displayName);
            }
        });

        // Re-apply comment author filter if active (unless bulk fetch handles it)
        if (!_bulkCommentFetchInProgress) {
            const commentAuthorFilterValue = document.getElementById('commentAuthorFilter')?.value.trim();
            if (commentAuthorFilterValue) {
                applyFilters();
            }
        }

        // Store iteration count
        const iterationCount = (iterations.value || []).length;
        prIterationCounts[prKey] = {
            count: iterationCount,
            lastFetch: now
        };

        updatePRCommentDisplay(prKey, activeCount);
        updatePRUpdatesDisplay(prKey, iterationCount);
        updateReviewerThreadBadges(prKey, authorCounts, unreadAuthors);
        updateOtherAuthorsDisplay(prKey, pr.reviewers, authorObjects, authorCounts, unreadAuthors);
    } catch (error) {
        // On error, mark as fetched with 0 to avoid retrying
        prCommentCounts[prKey] = {
            count: 0,
            authorCounts: {},
            authorObjects: {},
            lastFetch: now,
            lastAccess: now
        };
        updatePRCommentDisplay(prKey, 0);
    }
}

// Envelope icon used for the "unreviewed comments" badge
const MAIL_BADGE_HTML = '<span class="reviewer-mail-badge" title="Unreviewed comments in threads this user started"><svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 1v1.2l6 3.8 6-3.8V4H2zm0 2.4V12h12V6.4l-6 3.8-6-3.8z"/></svg></span>';

/**
 * Given a PR and its active threads, returns a Set of author IDs for whom the
 * current user has not yet reviewed all comments in the thread(s) they started.
 * Relies on globals currentUserId and allReviewTimestamps.
 */
function computeUnreadAuthorIds(pr, activeThreads) {
    const unread = new Set();
    if (typeof PRReviewTimestamps === 'undefined') return unread;
    const prId = String(pr.pullRequestId);
    const tsMap = (typeof allReviewTimestamps !== 'undefined' && allReviewTimestamps.get(prId)) || new Map();
    const userId = typeof currentUserId !== 'undefined' ? currentUserId : null;

    activeThreads.forEach(thread => {
        const firstComment = thread.comments && thread.comments[0];
        const ct = firstComment?.commentType;
        const isRealComment = ct === 1 || ct === 'text';
        const authorId = firstComment?.author?.id;
        if (!isRealComment || !authorId) return;
        if (userId && authorId === userId) return; // skip threads started by me
        if (PRReviewTimestamps.threadHasUnread(thread, tsMap, userId)) {
            unread.add(authorId);
        }
    });
    return unread;
}

/**
 * Refresh mail badges on all currently visible rows using cached thread data.
 * Called after review timestamps or currentUserId are (re)loaded.
 */
function refreshUnreadMailBadges() {
    // Rebuild unreadAuthors per cached PR so badges update without a full re-fetch.
    // We only need thread data; since we don't keep the full thread list in cache,
    // we just re-render badges from existing authorCounts + cached threads via the
    // live path the next time fetchPRCommentCount runs. For now, force a light-touch
    // re-application of stored unreadAuthors if present.
    const rows = document.querySelectorAll('tr[data-pr-key]');
    rows.forEach(row => {
        const prKey = row.dataset.prKey;
        const cached = prCommentCounts[prKey];
        if (!cached) return;
        const pr = allPRs.find(p => `${p._project}/${p._repo.id}/${p.pullRequestId}` === prKey);
        if (!pr) return;
        updateReviewerThreadBadges(prKey, cached.authorCounts || {}, cached.unreadAuthors || new Set());
        if (cached.authorObjects) {
            updateOtherAuthorsDisplay(prKey, pr.reviewers, cached.authorObjects, cached.authorCounts || {}, cached.unreadAuthors || new Set());
        }
    });
}

function updatePRCommentDisplay(prKey, count) {
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;

    const commentCell = row.querySelector('.pr-comments');
    if (!commentCell) return;

    if (count > 0) {
        commentCell.innerHTML = `<span style="color: #d13438; font-weight: 600;">${count}</span>`;
    } else {
        commentCell.innerHTML = '<span style="color: #8a8886;">0</span>';
    }
}

function updatePRUpdatesDisplay(prKey, count) {
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;

    const updatesCell = row.querySelector('.pr-updates');
    if (!updatesCell) return;

    if (count > 1) {
        updatesCell.innerHTML = `<span style="color: #0078d4; font-weight: 600;">${count}</span>`;
    } else {
        updatesCell.innerHTML = `<span style="color: #8a8886;">${count}</span>`;
    }
}

function updateReviewerThreadBadges(prKey, authorCounts, unreadAuthors) {
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;
    const unread = unreadAuthors || new Set();

    // Find all reviewer avatar wrappers in this row
    const avatarWrappers = row.querySelectorAll('.avatar-wrapper[data-user-id]');
    avatarWrappers.forEach(wrapper => {
        const reviewerId = wrapper.dataset.userId;

        // Remove existing thread/mail badges if any
        wrapper.querySelectorAll('.reviewer-thread-badge, .reviewer-mail-badge').forEach(el => el.remove());

        // Add badge if this reviewer has active threads
        const threadCount = authorCounts[reviewerId];
        if (threadCount && threadCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'reviewer-thread-badge';
            badge.textContent = threadCount;
            badge.title = `${threadCount} active thread${threadCount > 1 ? 's' : ''} started`;
            wrapper.appendChild(badge);
        }

        // Add mail badge if this reviewer has unreviewed comments
        if (unread.has(reviewerId)) {
            wrapper.insertAdjacentHTML('beforeend', MAIL_BADGE_HTML);
        }
    });
}

function updateOtherAuthorsDisplay(prKey, reviewers, authorObjects, authorCounts, unreadAuthors) {
    const unread = unreadAuthors || new Set();
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;

    const cell = row.querySelector('.pr-other-authors');
    if (!cell) return;

    // Get reviewer IDs
    const reviewerIds = new Set((reviewers || []).map(r => r.id));

    // Filter to authors who are not reviewers
    const otherAuthors = Object.values(authorObjects).filter(author =>
        author?.id && !reviewerIds.has(author.id)
    );

    if (otherAuthors.length === 0) {
        cell.innerHTML = '<span style="color: #8a8886;">-</span>';
        return;
    }

    // Render avatars with thread count badges
    const avatarsHtml = otherAuthors.map(author => {
        const displayName = ADOContent.escapeHtml(author.displayName || 'Unknown');
        const threadCount = authorCounts[author.id] || 0;
        const title = threadCount > 0
            ? `${displayName} - ${threadCount} active thread${threadCount > 1 ? 's' : ''} started`
            : displayName;

        let avatarHtml;
        if (author.id) {
            const cachedUrl = AvatarLoader.getCached(author.id);
            if (cachedUrl) {
                avatarHtml = `<img src="${cachedUrl}" data-user-id="${author.id}" alt="${title}" title="${title}" class="avatar">`;
            } else {
                avatarHtml = `<div class="avatar-placeholder" title="${title}"></div><img data-user-id="${author.id}" alt="${title}" title="${title}" class="avatar avatar-pending">`;
            }
        } else {
            const initials = (author.displayName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            avatarHtml = `<div class="avatar-fallback" title="${title}">${initials}</div>`;
        }

        // Thread count badge
        let badgeHtml = '';
        if (threadCount > 0) {
            badgeHtml = `<span class="reviewer-thread-badge">${threadCount}</span>`;
        }

        // Mail badge for unreviewed comments
        const mailHtml = author.id && unread.has(author.id) ? MAIL_BADGE_HTML : '';

        return `<div class="avatar-wrapper" data-user-id="${author.id || ''}">${avatarHtml}${badgeHtml}${mailHtml}</div>`;
    }).join('');

    cell.innerHTML = `<div class="avatars-container">${avatarsHtml}</div>`;

    // Load any pending avatars
    AvatarLoader.loadPending();
}

/**
 * Restore dynamic badges (thread badges on reviewer avatars, other authors)
 * after the table has been re-rendered (e.g., after column visibility change)
 */
function restoreDynamicBadges() {
    // Build a map of prKey -> PR for quick lookup
    const prByKey = {};
    allPRs.forEach(pr => {
        const prKey = `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
        prByKey[prKey] = pr;
    });

    // Find all visible PR rows
    const rows = document.querySelectorAll('tr[data-pr-key]');
    rows.forEach(row => {
        const prKey = row.dataset.prKey;
        const cachedData = prCommentCounts[prKey];
        const pr = prByKey[prKey];

        if (cachedData && cachedData.authorCounts) {
            const unread = cachedData.unreadAuthors || new Set();
            // Restore thread badges on reviewer avatars
            updateReviewerThreadBadges(prKey, cachedData.authorCounts, unread);

            // Restore other authors display
            if (pr && cachedData.authorObjects) {
                updateOtherAuthorsDisplay(prKey, pr.reviewers, cachedData.authorObjects, cachedData.authorCounts, unread);
            }
        }
    });
}

/**
 * Fetch all checks (statuses, policies, conflicts) for a PR using shared method
 */
async function fetchPRChecks(config, pr, forceRefresh = false) {
    const prKey = `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
    const now = Date.now();

    // Skip if already fetched recently (unless force refresh)
    if (!forceRefresh && prChecks[prKey] !== undefined) {
        return;
    }

    try {
        const projectId = pr.repository?.project?.id || pr._project;
        const data = await ChecksFormatter.fetchPRChecks(
            config,
            pr._project,
            pr._repo.id,
            pr.pullRequestId,
            projectId,
            pr.mergeStatus
        );

        prChecks[prKey] = {
            data: data,
            lastFetch: now
        };
        updatePRStatusDisplay(prKey);
    } catch (error) {
        // On error, mark as fetched with empty data to avoid retrying
        prChecks[prKey] = {
            data: { statuses: [], policies: [], conflicts: [], mergeStatus: pr.mergeStatus },
            lastFetch: now
        };
        updatePRStatusDisplay(prKey);
    }
}

/**
 * Update the status indicators display for a PR
 */
function updatePRStatusDisplay(prKey) {
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;

    const statusIndicators = row.querySelector('.pr-status-indicators');
    if (!statusIndicators) return;

    const html = generateStatusIndicatorsHtml(prKey);
    statusIndicators.innerHTML = html;
}

/**
 * Generate HTML for status indicators (merge conflicts, checks, policies)
 */
function generateStatusIndicatorsHtml(prKey) {
    const indicators = [];

    // Find the PR to get mergeStatus
    const pr = allPRs.find(p => `${p._project}/${p._repo.id}/${p.pullRequestId}` === prKey);

    // Get cached checks data
    const checksData = prChecks[prKey]?.data || {};
    const statuses = checksData.statuses || [];
    const policies = checksData.policies || [];
    const conflicts = checksData.conflicts || [];
    const mergeStatus = pr?.mergeStatus;

    // Build detailed tooltip
    const tooltipData = { statuses, policies, conflicts, mergeStatus };
    const tooltip = ChecksFormatter.buildTooltip(tooltipData);

    // Merge conflict indicator
    if (pr && mergeStatus && mergeStatus !== 'succeeded' && mergeStatus !== 'notSet') {
        let mergeIcon = '⚠️';
        let mergeText = '';
        let mergeClass = 'status-indicator-warning';

        switch (mergeStatus) {
            case 'conflicts':
                mergeIcon = '⚠️';
                mergeText = 'Conflicts';
                mergeClass = 'status-indicator-error';
                break;
            case 'rejectedByPolicy':
                mergeIcon = '🚫';
                mergeText = 'Rejected';
                mergeClass = 'status-indicator-error';
                break;
            case 'queued':
                mergeIcon = '⏳';
                mergeText = 'Queued';
                mergeClass = 'status-indicator-pending';
                break;
            case 'failure':
                mergeIcon = '❌';
                mergeText = 'Failed';
                mergeClass = 'status-indicator-error';
                break;
        }

        if (mergeText) {
            indicators.push(`<span class="status-indicator ${mergeClass}">${mergeIcon}</span>`);
        }
    }

    // Status checks indicator (compact) - only show if there are actual checks
    const statusCounts = ChecksFormatter.countStatuses(statuses);
    if (statusCounts.total > 0) {
        let statusClass = 'status-indicator-success';
        let statusIcon = '✓';
        let statusText = `${statusCounts.total}`;

        if (statusCounts.failed > 0) {
            statusClass = 'status-indicator-error';
            statusIcon = '✗';
            statusText = `${statusCounts.failed}/${statusCounts.total}`;
        } else if (statusCounts.pending > 0) {
            statusClass = 'status-indicator-pending';
            statusIcon = '●';
            statusText = `${statusCounts.pending}/${statusCounts.total}`;
        }

        indicators.push(`<span class="status-indicator ${statusClass}">📊 ${statusIcon} ${statusText}</span>`);
    }

    // Build policies indicator (with SVG icons grouped by state)
    const buildCounts = ChecksFormatter.countBuildPolicies(policies);
    if (buildCounts.total > 0) {
        // Determine overall status class
        let buildClass = 'status-indicator-success';
        if (buildCounts.failed > 0) {
            buildClass = 'status-indicator-error';
        } else if (buildCounts.running > 0 || buildCounts.queued > 0 || buildCounts.notTriggered > 0 || buildCounts.expired > 0) {
            buildClass = 'status-indicator-pending';
        }

        const parts = [];

        // Order: failed, expired, notTriggered, running, queued, succeeded
        if (buildCounts.failed > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.failed}${ChecksFormatter.getBuildStatusSvg('failed', 14)}</span>`);
        }
        if (buildCounts.expired > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.expired}${ChecksFormatter.getBuildStatusSvg('expired', 14)}</span>`);
        }
        if (buildCounts.notTriggered > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.notTriggered}${ChecksFormatter.getBuildStatusSvg('notTriggered', 14)}</span>`);
        }
        if (buildCounts.running > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.running}${ChecksFormatter.getBuildStatusSvg('running', 14)}</span>`);
        }
        if (buildCounts.queued > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.queued}${ChecksFormatter.getBuildStatusSvg('queued', 14)}</span>`);
        }
        if (buildCounts.succeeded > 0) {
            parts.push(`<span class="build-status-count">${buildCounts.succeeded}${ChecksFormatter.getBuildStatusSvg('succeeded', 14)}</span>`);
        }

        indicators.push(`<span class="status-indicator build-status-group ${buildClass}">🔧 ${parts.join(' ')}</span>`);
    }

    // Non-build policy evaluations indicator (compact)
    const policyCounts = ChecksFormatter.countPolicies(policies);
    if (policyCounts.total > 0) {
        let policyClass = 'status-indicator-success';
        let policyIcon = '✓';
        let policyText = `${policyCounts.total}`;

        if (policyCounts.rejected > 0) {
            policyClass = 'status-indicator-error';
            policyIcon = '✗';
            policyText = `${policyCounts.rejected}/${policyCounts.total}`;
        } else if (policyCounts.running > 0) {
            policyClass = 'status-indicator-pending';
            policyIcon = '●';
            policyText = `${policyCounts.running}/${policyCounts.total}`;
        }

        indicators.push(`<span class="status-indicator ${policyClass}">📋 ${policyIcon} ${policyText}</span>`);
    }

    // Wrap in container with tooltip
    if (indicators.length === 0) {
        return '';
    }

    const escapedTooltip = ADOContent.escapeHtml(tooltip).replace(/\n/g, '&#10;');
    return `<span class="status-indicators-wrapper" title="${escapedTooltip}">${indicators.join(' ')}</span>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateStatusIndicatorsHtml, buildCommentFetchQueue, updatePRCommentDisplay, updatePRUpdatesDisplay, computeUnreadAuthorIds };
}
