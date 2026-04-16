/**
 * pr-list-live-updates.js — Live update system for PR list: background polling,
 * change detection, notifications, user interaction tracking.
 *
 * Globals read: liveUpdatesEnabled, backgroundPollInterval, lastUserInteraction,
 *   lastBackgroundPoll, isBackgroundPolling, loadedRepoKeys, allPRs, filteredPRs,
 *   allAuthors, allReviewers, allCommentAuthors, prCommentCounts, grayedOutPRKeys,
 *   newPRsDetected, newFilterMatchesDetected, getSelectedRepos, getPRKey,
 *   prMatchesFilters, getCurrentFilters, displayPRs, updateSelectedFilters, updateURL,
 *   updatePRSourceDisplay, processPriorityQueue, getReviewerAvatarsHtml,
 *   updateReviewerThreadBadges, hasPRChanged, ADOConfig, PRReviewTimestamps
 * Globals written: liveUpdatesEnabled, backgroundPollInterval, lastUserInteraction,
 *   lastBackgroundPoll, isBackgroundPolling, allPRs, filteredPRs, allAuthors,
 *   allReviewers, allCommentAuthors, allReviewTimestamps, grayedOutPRKeys,
 *   newPRsDetected, newFilterMatchesDetected
 */

// Polling constants
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const USER_INTERACTION_PAUSE = 10 * 1000; // 10 seconds
const VISIBILITY_POLL_COOLDOWN = 20 * 1000; // 20 seconds cooldown for visibility-triggered polls

function toggleLiveUpdates() {
    liveUpdatesEnabled = !liveUpdatesEnabled;
    localStorage.setItem('prListLiveUpdates', liveUpdatesEnabled);

    const toggle = document.getElementById('liveUpdatesToggle');
    if (liveUpdatesEnabled) {
        toggle.classList.add('active');
        startBackgroundPolling();
    } else {
        toggle.classList.remove('active');
        stopBackgroundPolling();
    }
}

function initLiveUpdatesToggle() {
    const toggle = document.getElementById('liveUpdatesToggle');
    if (liveUpdatesEnabled) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
    }
}

function initializeUserInteractionTracking() {
    // Track various user interactions
    const interactionEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    interactionEvents.forEach(eventType => {
        document.addEventListener(eventType, () => {
            lastUserInteraction = Date.now();
        }, { passive: true });
    });
}

function isUserActivelyInteracting() {
    const timeSinceInteraction = Date.now() - lastUserInteraction;
    return timeSinceInteraction < USER_INTERACTION_PAUSE;
}

function startBackgroundPolling() {
    if (!liveUpdatesEnabled) return; // Live updates disabled by user
    if (backgroundPollInterval) {
        return; // Already running
    }

    updateLiveIndicator(true);

    backgroundPollInterval = setInterval(async () => {
        if (document.hidden) {
            // Don't poll if tab is hidden
            return;
        }

        if (isUserActivelyInteracting()) {
            // Don't update if user is actively interacting
            console.log('User is actively interacting, skipping background poll');
            return;
        }

        const selectedRepos = getSelectedRepos();
        if (selectedRepos.length === 0) {
            stopBackgroundPolling();
            return;
        }

        await performBackgroundPoll();
    }, POLL_INTERVAL);

    console.log('Background polling started');
}

function stopBackgroundPolling() {
    if (backgroundPollInterval) {
        clearInterval(backgroundPollInterval);
        backgroundPollInterval = null;
        updateLiveIndicator(false);
        console.log('Background polling stopped');
    }
}

function updateLiveIndicator(isActive, isUpdating = false) {
    const indicator = document.getElementById('liveIndicator');
    const dot = indicator.querySelector('.live-dot');
    const text = document.getElementById('liveIndicatorText');

    // Clear all states
    indicator.classList.remove('active', 'paused', 'updating');
    dot.classList.remove('active', 'updating');

    if (isUpdating && loadedRepoKeys.size > 0) {
        indicator.style.display = 'inline-flex';
        indicator.classList.add('updating');
        dot.classList.add('updating');
        text.textContent = 'Updating';
    } else if (isActive && loadedRepoKeys.size > 0) {
        indicator.style.display = 'inline-flex';
        indicator.classList.add('active');
        dot.classList.add('active');
        text.textContent = 'Live';
    } else if (loadedRepoKeys.size > 0) {
        indicator.style.display = 'inline-flex';
        indicator.classList.add('paused');
        text.textContent = 'Paused';
    } else {
        indicator.style.display = 'none';
    }
}

async function manualRefresh() {
    await performBackgroundPoll();
    // Auto-apply any detected changes
    if (newPRsDetected.length > 0 || newFilterMatchesDetected.length > 0 || grayedOutPRKeys.size > 0) {
        applyLiveUpdates();
    }
}

async function performBackgroundPoll() {
    if (isBackgroundPolling) {
        return; // Already polling
    }
    if (typeof isLoadingAllPRs !== 'undefined' && isLoadingAllPRs) {
        return; // Refresh/initial load in progress; its result is authoritative
    }

    isBackgroundPolling = true;
    updateLiveIndicator(true, true);
    console.log('Performing background poll...');

    try {
        const config = ADOConfig.get();
        const selectedRepos = getSelectedRepos();

        // Fetch fresh PR data
        const prPromises = selectedRepos.map(repo =>
            ADOAPI.getPRs(config, repo.projectName, repo.name, 'all')
                .then(data => ({
                    repo: repo,
                    prs: data.value || []
                }))
                .catch(error => ({
                    repo: repo,
                    prs: [],
                    error: error.message
                }))
        );

        const prResults = await Promise.all(prPromises);

        // If a refresh started while we were fetching, its result is authoritative — discard this poll.
        if (typeof isLoadingAllPRs !== 'undefined' && isLoadingAllPRs) {
            return;
        }

        // Build fresh PR list with metadata
        const freshPRs = [];
        prResults.forEach(result => {
            result.prs.forEach(pr => {
                pr._repo = result.repo;
                pr._project = result.repo.projectName;
                freshPRs.push(pr);
            });
        });

        // If allPRs is empty there is no meaningful baseline to diff against — a diff here would
        // flag every fetched PR as "new" and spam the notification banner. Skip detection.
        if (allPRs.length === 0) {
            return;
        }

        // Detect changes
        const changes = detectChanges(allPRs, freshPRs);

        if (changes.hasChanges) {
            console.log('Changes detected:', changes);
            await handleDetectedChanges(changes, freshPRs);
        }

        // Update timestamps
        selectedRepos.forEach(repo => {
            const repoKey = `${repo.projectName}/${repo.id}`;
            loadedRepoKeys.set(repoKey, Date.now());
        });

        updatePRSourceDisplay();

        // Reload review timestamps from DB so mail badges reflect changes
        // made while viewing PRs in other tabs.
        try {
            allReviewTimestamps = await PRReviewTimestamps.loadAllForOrg(config.serverUrl, config.organization);
        } catch (e) { /* non-critical — stale badges are tolerable */ }

        // Refresh comment counts using priority queue (force refresh for visible PRs)
        await processPriorityQueue(true);

        // Track when this poll completed
        lastBackgroundPoll = Date.now();

    } catch (error) {
        console.error('Background poll error:', error);
    } finally {
        isBackgroundPolling = false;
        updateLiveIndicator(liveUpdatesEnabled);
    }
}

function detectChanges(oldPRs, freshPRs) {
    const changes = {
        hasChanges: false,
        newPRs: [],
        updatedPRs: [],
        removedPRKeys: [],
        newFilterMatches: []
    };

    // Create maps for quick lookup
    const oldPRMap = new Map();
    oldPRs.forEach(pr => {
        oldPRMap.set(getPRKey(pr), pr);
    });

    const freshPRMap = new Map();
    freshPRs.forEach(pr => {
        freshPRMap.set(getPRKey(pr), pr);
    });

    // Detect new and updated PRs
    freshPRs.forEach(freshPR => {
        const prKey = getPRKey(freshPR);
        const oldPR = oldPRMap.get(prKey);

        if (!oldPR) {
            // New PR
            changes.newPRs.push(freshPR);
            changes.hasChanges = true;

            // Check if it matches current filters
            if (prMatchesFilters(freshPR, getCurrentFilters())) {
                changes.newFilterMatches.push(freshPR);
            }
        } else {
            // Check if PR has been updated
            if (hasPRChanged(oldPR, freshPR)) {
                changes.updatedPRs.push({
                    old: oldPR,
                    fresh: freshPR,
                    prKey: prKey
                });
                changes.hasChanges = true;
            }
        }
    });

    // Detect removed PRs
    oldPRs.forEach(oldPR => {
        const prKey = getPRKey(oldPR);
        if (!freshPRMap.has(prKey)) {
            changes.removedPRKeys.push(prKey);
            changes.hasChanges = true;
        }
    });

    return changes;
}

async function handleDetectedChanges(changes, freshPRs) {
    // Handle updated PRs (in-place updates)
    if (changes.updatedPRs.length > 0) {
        changes.updatedPRs.forEach(update => {
            // Update the PR in allPRs
            const index = allPRs.findIndex(pr => getPRKey(pr) === update.prKey);
            if (index !== -1) {
                allPRs[index] = update.fresh;
            }

            // Check if PR still matches filters
            const stillMatches = prMatchesFilters(update.fresh, getCurrentFilters());
            const wasVisible = filteredPRs.some(pr => getPRKey(pr) === update.prKey);

            if (wasVisible && !stillMatches) {
                // PR no longer matches, gray it out
                grayedOutPRKeys.add(update.prKey);
            } else if (wasVisible && stillMatches) {
                // Update in place with highlight
                updatePRRowInPlace(update.prKey, update.fresh);
            }
        });

        // Update authors/reviewers
        updateAuthorsAndReviewers();
    }

    // Handle removed PRs
    if (changes.removedPRKeys.length > 0) {
        changes.removedPRKeys.forEach(prKey => {
            grayedOutPRKeys.add(prKey);
        });
    }

    // Store new PRs for notification
    if (changes.newPRs.length > 0) {
        // Append new PRs instead of replacing to preserve PRs from previous polls
        const existingKeys = new Set(newPRsDetected.map(pr => getPRKey(pr)));
        const trulyNewPRs = changes.newPRs.filter(pr => !existingKeys.has(getPRKey(pr)));
        newPRsDetected = [...newPRsDetected, ...trulyNewPRs];
    }

    // Store new filter matches for notification
    if (changes.newFilterMatches.length > 0) {
        // Only add if they're truly new (not already in newPRsDetected from before)
        const existingNewPRKeys = new Set(newPRsDetected.map(pr => getPRKey(pr)));
        const additionalMatches = changes.newFilterMatches.filter(pr =>
            !existingNewPRKeys.has(getPRKey(pr))
        );

        if (additionalMatches.length > 0) {
            newFilterMatchesDetected = [...newFilterMatchesDetected, ...additionalMatches];
        }
    }

    // Update the source display to show/hide the "Show PR changes" button
    updatePRSourceDisplay();

    // Re-apply filters to update grayed out rows
    if (changes.updatedPRs.length > 0 || changes.removedPRKeys.length > 0) {
        applyFiltersWithoutReset();
    }
}

function updatePRRowInPlace(prKey, freshPR) {
    const row = document.querySelector(`tr[data-pr-key="${prKey}"]`);
    if (!row) return;

    // Update status badge (including draft badge)
    const statusBadge = row.querySelector('.badge');
    if (statusBadge && statusBadge.parentElement) {
        statusBadge.parentElement.innerHTML = ADOUI.renderStatusBadge(freshPR.status, freshPR);
    }

    // Update reviewers
    const reviewerCells = row.querySelectorAll('.pr-meta');
    if (reviewerCells.length >= 2) {
        const reviewerCell = reviewerCells[1];
        reviewerCell.innerHTML = getReviewerAvatarsHtml(freshPR.reviewers);
        // Re-apply cached thread badges immediately (getReviewerAvatarsHtml only renders vote badges)
        const cached = prCommentCounts[prKey];
        if (cached && cached.authorCounts) {
            updateReviewerThreadBadges(prKey, cached.authorCounts, cached.unreadAuthors || new Set());
        }
        AvatarLoader.loadPending();
    }

    // Add highlight animation
    row.classList.remove('updated');
    void row.offsetWidth; // Trigger reflow
    row.classList.add('updated');
}

function applyFiltersWithoutReset() {
    // Same as applyFilters but doesn't reset page or clear grayed out set
    const filters = getCurrentFilters();
    filteredPRs = allPRs.filter(pr => prMatchesFilters(pr, filters));

    displayPRs();
    updateSelectedFilters();
    updateURL();
}

function updateAuthorsAndReviewers() {
    allAuthors = new Set();
    allReviewers = new Set();
    allCommentAuthors = new Set();

    allPRs.forEach(pr => {
        if (pr.createdBy) {
            allAuthors.add(pr.createdBy.displayName);
        }
        if (pr.reviewers) {
            pr.reviewers.forEach(reviewer => {
                allReviewers.add(reviewer.displayName);
            });
        }
        // Rebuild comment authors from cached data
        const prKey = `${pr._project}/${pr._repo.id}/${pr.pullRequestId}`;
        const cached = prCommentCounts[prKey];
        if (cached && cached.authorObjects) {
            Object.values(cached.authorObjects).forEach(author => {
                if (author.displayName) {
                    allCommentAuthors.add(author.displayName);
                }
            });
        }
    });
}

function applyLiveUpdates() {
    // Clear grayed out PRs
    grayedOutPRKeys.clear();

    // Add new PRs to allPRs
    newPRsDetected.forEach(pr => {
        allPRs.push(pr);

        // Update authors/reviewers
        if (pr.createdBy) {
            allAuthors.add(pr.createdBy.displayName);
        }
        if (pr.reviewers) {
            pr.reviewers.forEach(reviewer => {
                allReviewers.add(reviewer.displayName);
            });
        }
    });

    // Clear detection arrays
    newPRsDetected = [];
    newFilterMatchesDetected = [];

    // Re-apply filters and display
    applyFilters();
    updatePRSourceDisplay();
}

// Trigger background poll when tab becomes visible (with cooldown to prevent spam)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && liveUpdatesEnabled && loadedRepoKeys.size > 0 && backgroundPollInterval) {
        const timeSinceLastPoll = Date.now() - lastBackgroundPoll;

        // Only trigger poll if at least 20 seconds have passed since last poll
        if (timeSinceLastPoll >= VISIBILITY_POLL_COOLDOWN) {
            console.log('Tab became visible, triggering background poll...');
            performBackgroundPoll();
        } else {
            console.log(`Tab became visible, but last poll was ${Math.round(timeSinceLastPoll / 1000)}s ago (cooldown: ${VISIBILITY_POLL_COOLDOWN / 1000}s)`);
        }
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectChanges, isUserActivelyInteracting, POLL_INTERVAL, USER_INTERACTION_PAUSE, VISIBILITY_POLL_COOLDOWN };
}
