// pr-live-updates.js — Live polling and checks/work-items rendering for ado-pr-threads.html
// Depends on: ADOAPI, ADOUI, ADOConfig, ADOContent, ADOIdentity, ChecksFormatter (common.js),
//             PRThreadsUtils (pr-threads-utils.js)
// Accesses globals: currentPRId, currentPRData, allThreads, allIterations, allChangeEntries,
//                   currentFileChangeStats, currentConfig, currentView, updatesViewBuilt,
//                   fileDiffCache, fileTreeBuilt, liveUpdatesEnabled,
//                   updateReviewersDisplay, buildThreadsByFilePath, applyThreadFilters, populateAuthorFilter,
//                   refreshInlineThreadsIfNeeded, buildUpdatesView, buildFileTree,
//                   buildIterationSelector, calculateFileChangeStats, buildCumulativeRenameMaps,
//                   fetchLineStatsAsync

        // PR data polling
        let prChecksData = null;
        let prWorkItems = null;
        let prPollingInterval = null;
        const PR_POLL_INTERVAL = 15000; // 15 seconds

        // Live updates toggle
        function toggleLiveUpdates() {
            liveUpdatesEnabled = !liveUpdatesEnabled;
            localStorage.setItem('prThreadsLiveUpdates', liveUpdatesEnabled);

            const toggle = document.getElementById('liveUpdatesToggle');
            if (liveUpdatesEnabled) {
                toggle.classList.add('active');
                const config = ADOConfig.get();
                if (config && currentPRData) startPRPolling(config);
            } else {
                toggle.classList.remove('active');
                stopPRPolling();
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

        // Fetch and update PR basic info (status, draft, target branch)
        async function fetchAndUpdatePRInfo(config) {
            try {
                const prData = await ADOAPI.getPR(config, currentPRId);

                // Update status badges
                const statusBadgesEl = document.getElementById('prStatusBadges');
                if (statusBadgesEl) {
                    statusBadgesEl.innerHTML = ADOUI.renderStatusBadge(prData.status, prData);
                }

                // Update target branch
                const targetBranchEl = document.getElementById('prTargetBranch');
                if (targetBranchEl) {
                    targetBranchEl.textContent = prData.targetRefName?.replace('refs/heads/', '') || 'Unknown';
                }

                // Update description if not currently being edited
                const descriptionContentEl = document.getElementById('pr-description-content');
                if (descriptionContentEl && !descriptionContentEl.querySelector('.comment-editor')) {
                    if (prData.description !== currentPRData.description) {
                        descriptionContentEl.innerHTML = prData.description
                            ? `<div class="pr-description">${ADOContent.processContent(prData.description)}</div>`
                            : '<div class="pr-description" style="color: #a19f9d; font-style: italic;">No description</div>';
                    }
                }

                // Update stored PR data first so updateReviewersDisplay uses fresh data
                currentPRData = prData;

                // Update reviewers (only avatar containers, preserving search forms)
                updateReviewersDisplay();
            } catch (error) {
                console.error('Failed to fetch PR info:', error);
            }
        }

        // Fetch and update threads
        async function fetchAndUpdateThreads(config) {
            try {
                if (window._adoDebug) console.log(`[POLL] fetchAndUpdateThreads start t=${Date.now()}`);
                const threadsData = await ADOAPI.getPRThreads(config, currentPRId);
                const newThreads = (threadsData.value || []).map((t, idx) => ({ ...t, _originalIndex: idx }));
                if (window._adoDebug) console.log(`[POLL] fetchAndUpdateThreads got ${newThreads.length} threads t=${Date.now()}`);

                // Check if threads changed (compare without _originalIndex for stability)
                const compareThreads = (threads) => JSON.stringify(threads.map(t => {
                    const { _originalIndex, ...rest } = t;
                    return rest;
                }));
                const changed = compareThreads(newThreads) !== compareThreads(allThreads);
                if (window._adoDebug) console.log(`[POLL] threads changed=${changed} (current=${allThreads.length}, new=${newThreads.length})`);
                if (changed) {
                    if (window._adoDebug) console.log(`[POLL] allThreads replacing (${allThreads.length} → ${newThreads.length}) t=${Date.now()}`);
                    allThreads = newThreads;
                    // Resolve any new @mention identities before re-rendering
                    await ADOIdentity.collectAndResolveFromThreads(allThreads, config.serverUrl, config.organization, config.pat);
                    buildThreadsByFilePath();
                    updateThreadStats();
                    populateAuthorFilter();
                    // Re-apply filters to refresh thread display
                    if (window._adoDebug) console.log(`[POLL] applyThreadFilters start t=${Date.now()}`);
                    applyThreadFilters();
                    if (window._adoDebug) console.log(`[POLL] fetchAndUpdateThreads done t=${Date.now()}`);
                    refreshInlineThreadsIfNeeded();
                }
            } catch (error) {
                console.error('Failed to fetch threads:', error);
            }
        }

        // Compute thread status counts (pure function)
        function computeThreadStatusCounts(threads, isDeletedFn) {
            return threads.reduce((acc, thread) => {
                if (isDeletedFn(thread)) {
                    acc.deleted = (acc.deleted || 0) + 1;
                } else if (thread.status === undefined) {
                    acc.noStatus = (acc.noStatus || 0) + 1;
                } else {
                    const status = thread.status;
                    acc[status] = (acc[status] || 0) + 1;
                }
                return acc;
            }, {});
        }

        // Update thread stats display
        function updateThreadStats() {
            const container = document.getElementById('threadStatsContainer');
            if (!container) return;

            const statusCounts = computeThreadStatusCounts(allThreads, PRThreadsUtils.isThreadDeleted);

            container.innerHTML = `
                <span title="Active"><span class="thread-status-dot active"></span> <strong>${statusCounts.active || 0}</strong></span>
                <span title="Resolved"><span class="thread-status-dot fixed"></span> <strong>${statusCounts.fixed || 0}</strong></span>
                <span title="Closed"><span class="thread-status-dot closed"></span> <strong>${statusCounts.closed || 0}</strong></span>
                ${statusCounts.pending ? `<span title="Pending"><span class="thread-status-dot pending"></span> <strong>${statusCounts.pending}</strong></span>` : ''}
                ${statusCounts.wontFix ? `<span title="Won't Fix"><span class="thread-status-dot wontFix"></span> <strong>${statusCounts.wontFix}</strong></span>` : ''}
                ${statusCounts.deleted ? `<span title="Deleted"><span class="thread-status-dot deleted"></span> <strong>${statusCounts.deleted}</strong></span>` : ''}
            `;
        }

        // Fetch and update iterations
        async function fetchAndUpdateIterations(config) {
            try {
                const iterationsData = await ADOAPI.getPRIterations(config, currentPRId);
                const newIterations = iterationsData.value || [];

                // Check if iterations changed
                if (newIterations.length !== allIterations.length) {
                    const oldTotal = allIterations.length;
                    allIterations = newIterations;

                    // Update merge base to reflect the new iteration's commonRefCommit.
                    // A rebase creates a new iteration with a different merge base, so
                    // currentMergeBase must be refreshed or "All" mode diffs will use the
                    // old pre-rebase base commit.
                    const newMergeBase = newIterations[newIterations.length - 1]?.commonRefCommit?.commitId;
                    if (newMergeBase) currentMergeBase = newMergeBase;

                    // Update iterations count
                    const container = document.getElementById('updatesStatsContainer');
                    if (container) {
                        container.innerHTML = `<span>Updates</span><strong>${allIterations.length}</strong>`;
                    }

                    // Mark updates view as stale and rebuild if active
                    updatesViewBuilt = false;
                    if (currentView === 'updates') {
                        updatesViewBuilt = true;
                        buildUpdatesView();
                    }
                    // Update updates tab count
                    const updatesTabBtn = document.querySelector('.view-tab[data-view="updates"]');
                    if (updatesTabBtn) {
                        updatesTabBtn.textContent = `Updates (${allIterations.length})`;
                    }

                    // Refresh file change stats if we have a new iteration
                    if (allIterations.length > 0) {
                        try {
                            const changesData = await ADOAPI.getPRIterationChanges(config, currentPRId, allIterations.length, 0);
                            const entries = changesData.changeEntries || [];
                            allChangeEntries = entries;
                            currentFileChangeStats = calculateFileChangeStats(entries);
                            buildCumulativeRenameMaps(entries);
                            updateFileStats();
                            if (currentView === 'files') {
                                // Pin the iteration selection to the previous range to avoid
                                // disrupting an active file review when a new iteration arrives.
                                // If the user was in "All" mode (selectedIterationEnd === null),
                                // they were implicitly viewing 1..oldTotal; lock that in explicitly
                                // so the diff panel and selector don't jump to include the new iteration.
                                if (selectedIterationEnd === null) {
                                    selectedIterationStart = selectedIterationStart !== null ? selectedIterationStart : 1;
                                    selectedIterationEnd = oldTotal;
                                }
                                // Don't clear fileDiffCache: the pinned range hasn't changed, so
                                // all cached diffs remain valid and the diff panel won't reload.
                                buildFileTree(allChangeEntries);
                                buildIterationSelector();
                            } else {
                                fileDiffCache.clear();
                                fileTreeBuilt = false;
                            }
                            // Update files tab count
                            const filesTabBtn = document.querySelector('.view-tab[data-view="files"]');
                            if (filesTabBtn) {
                                filesTabBtn.textContent = `Files (${allChangeEntries.length})`;
                            }
                            // Also refresh line stats
                            fetchLineStatsAsync(config, currentPRData);
                        } catch (e) {
                            console.warn('Failed to fetch file change stats:', e);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch iterations:', error);
            }
        }

        // Update file stats display
        function updateFileStats() {
            const container = document.getElementById('fileStatsContainer');
            if (!container || !currentFileChangeStats) return;

            container.innerHTML = `
                <span>Files</span>
                <strong style="color: #107c10;" title="Added">+${currentFileChangeStats.added}</strong>
                <strong style="color: #0078d4;" title="Modified">~${currentFileChangeStats.modified}</strong>
                <strong style="color: #a4262c;" title="Deleted">-${currentFileChangeStats.deleted}</strong>
            `;
        }

        // Fetch and update checks (statuses, policies, conflicts)
        async function fetchAndUpdateChecks(config, prData) {
            try {
                const projectId = prData.repository?.project?.id || config.project;
                prChecksData = await ChecksFormatter.fetchPRChecks(
                    config,
                    config.project,
                    config.repository,
                    prData.pullRequestId,
                    projectId,
                    prData.mergeStatus
                );
                updateChecksDisplay();
            } catch (error) {
                console.error('Failed to fetch checks:', error);
            }
        }

        // Fetch and update work items
        async function fetchAndUpdateWorkItems(config, prId) {
            try {
                const refsData = await ADOAPI.getPRWorkItemRefs(config, prId);
                const refs = refsData.value || [];
                if (refs.length > 0) {
                    const ids = refs.map(r => r.id);
                    const detailsData = await ADOAPI.getWorkItemsBatch(config, ids);
                    prWorkItems = detailsData.value || [];
                } else {
                    prWorkItems = [];
                }
                const container = document.getElementById('rightSidebarWorkItems');
                if (container) {
                    container.innerHTML = renderWorkItemsSection();
                }
            } catch (error) {
                console.warn('Failed to fetch work items:', error);
                prWorkItems = [];
            }
        }

        // Legacy alias for fetchAndUpdateChecks
        async function fetchPRChecks(config, prData) {
            await fetchAndUpdateChecks(config, prData);
        }

        // Poll all PR data
        async function pollPRData(config) {
            if (document.hidden) return; // Don't poll if tab is hidden
            if (window._adoDebug) console.log(`[POLL] pollPRData tick t=${Date.now()}`);

            await Promise.all([
                fetchAndUpdatePRInfo(config),
                fetchAndUpdateThreads(config),
                fetchAndUpdateIterations(config),
                fetchAndUpdateChecks(config, currentPRData)
            ]);
        }

        function startPRPolling(config) {
            if (!liveUpdatesEnabled) return; // Live updates disabled by user
            if (prPollingInterval) return; // Already polling

            prPollingInterval = setInterval(() => pollPRData(config), PR_POLL_INTERVAL);
        }

        function stopPRPolling() {
            if (prPollingInterval) {
                clearInterval(prPollingInterval);
                prPollingInterval = null;
            }
        }

        // Refresh all data when tab becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && liveUpdatesEnabled && currentPRData) {
                const config = ADOConfig.get();
                if (config) pollPRData(config);
            }
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', stopPRPolling);

        function updateChecksDisplay() {
            const container = document.getElementById('rightSidebarChecks');
            if (!container) return;

            container.innerHTML = renderChecksSection();

            // Attach click handlers for queue build buttons
            container.querySelectorAll('.queue-build-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const evaluationId = btn.dataset.evaluationId;
                    if (!evaluationId || !currentPRData) return;

                    btn.disabled = true;
                    btn.textContent = '⏳';

                    try {
                        const config = ADOConfig.get();
                        await ADOAPI.requeuePolicyEvaluation(config, config.project, evaluationId);

                        // Refresh checks after queueing
                        await fetchPRChecks(config, currentPRData);
                    } catch (err) {
                        alert(`Failed to queue build: ${err.message}`);
                        btn.disabled = false;
                        btn.textContent = '▶';
                    }
                });
            });
        }

        // Use shared utilities from common.js
        const getStatusIcon = ChecksFormatter.getIcon.bind(ChecksFormatter);
        const getStatusClass = ChecksFormatter.getClass.bind(ChecksFormatter);

        function renderWorkItemsSection(workItems = prWorkItems, config = currentConfig) {
            if (!workItems) {
                return '';
            }
            if (workItems.length === 0) {
                return `
                    <div class="work-items-section">
                        <h4>Work Items</h4>
                        <span class="no-reviewers">None</span>
                    </div>
                `;
            }

            const workItemTypeIcons = {
                'Bug': '🐛',
                'Task': '📋',
                'User Story': '📖',
                'Feature': '🚀',
                'Epic': '⚡',
                'Issue': '⚠️',
                'Test Case': '🧪',
                'Impediment': '🚧',
            };

            const itemsHtml = workItems.map(wi => {
                const typeName = wi.fields?.['System.WorkItemType'] || '';
                const title = wi.fields?.['System.Title'] || `Work Item ${wi.id}`;
                const state = wi.fields?.['System.State'] || '';
                const icon = workItemTypeIcons[typeName] || '📌';
                const wiUrl = `${config.serverUrl}/${config.organization}/${config.project}/_workitems/edit/${wi.id}`;

                return `<div class="work-item-entry">
                    <a href="${wiUrl}" target="_blank" rel="noopener" title="${ADOContent.escapeHtml(typeName)}${state ? ' - ' + ADOContent.escapeHtml(state) : ''}">
                        <span class="work-item-icon">${icon}</span>
                        <span class="work-item-id">${wi.id}</span>
                        <span class="work-item-title">${ADOContent.escapeHtml(title)}</span>
                    </a>
                </div>`;
            }).join('');

            return `
                <div class="work-items-section">
                    <h4>Work Items</h4>
                    ${itemsHtml}
                </div>
            `;
        }

        function renderChecksSection(checksData = prChecksData, config = currentConfig) {
            if (!checksData) {
                return `
                    <div class="checks-section">
                        <h4>Checks</h4>
                        <div class="checks-loading">Loading...</div>
                    </div>
                `;
            }

            const sections = [];
            const { statuses, policies, conflicts, mergeStatus } = checksData;

            // Merge conflicts section
            if (mergeStatus === 'conflicts') {
                let conflictHtml = '<div class="check-group"><div class="check-group-header status-indicator-error">⚠️ Merge Conflicts</div>';
                if (conflicts.length > 0) {
                    conflictHtml += '<ul class="check-list">';
                    conflicts.forEach(c => {
                        const path = c.conflictPath || c.filePath || c.sourceFilePath || c.targetFilePath || c.path || 'Unknown file';
                        conflictHtml += `<li class="check-item"><code>${ADOContent.escapeHtml(path)}</code></li>`;
                    });
                    conflictHtml += '</ul>';
                } else {
                    conflictHtml += '<div class="check-item-note">Unable to load conflict details</div>';
                }
                conflictHtml += '</div>';
                sections.push(conflictHtml);
            } else if (mergeStatus && mergeStatus !== 'succeeded' && mergeStatus !== 'notSet') {
                // Other merge issues
                let mergeText = '';
                switch (mergeStatus) {
                    case 'rejectedByPolicy': mergeText = '🚫 Rejected by policy'; break;
                    case 'queued': mergeText = '⏳ Merge queued'; break;
                    case 'failure': mergeText = '❌ Merge failed'; break;
                }
                if (mergeText) {
                    sections.push(`<div class="check-group"><div class="check-group-header ${getStatusClass(mergeStatus)}">${mergeText}</div></div>`);
                }
            }

            // Status checks section - use improved deduplication from common.js
            const statusList = ChecksFormatter.getLatestStatuses(statuses);
            if (statusList.length > 0) {
                const failed = statusList.filter(s => s.state === 'failed' || s.state === 'error');
                const pending = statusList.filter(s => s.state === 'pending' || !s.state);
                const succeeded = statusList.filter(s => s.state === 'succeeded');

                let checksHtml = '<div class="check-group"><div class="check-group-header">📊 Status Checks</div><ul class="check-list">';

                // Show failed first, then pending, then succeeded
                [...failed, ...pending, ...succeeded].forEach(s => {
                    const info = ChecksFormatter.formatStatus(s);
                    const icon = getStatusIcon(s.state || 'pending');
                    const cls = getStatusClass(s.state || 'pending');
                    const desc = s.description ? ` - ${ADOContent.escapeHtml(s.description)}` : '';

                    if (info.url) {
                        checksHtml += `<li class="check-item ${cls}"><span class="check-icon">${icon}</span> <a href="${ADOContent.escapeHtml(info.url)}" target="_blank" rel="noopener">${ADOContent.escapeHtml(info.name)}</a>${desc}</li>`;
                    } else {
                        checksHtml += `<li class="check-item ${cls}"><span class="check-icon">${icon}</span> ${ADOContent.escapeHtml(info.name)}${desc}</li>`;
                    }
                });

                checksHtml += '</ul></div>';
                sections.push(checksHtml);
            }

            // Build policies section - separate with SVG icons
            const buildPolicies = policies.filter(p => ChecksFormatter.isBuildPolicy(p));
            if (buildPolicies.length > 0) {
                // Sort by state: failed, expired, notTriggered, running, queued, succeeded
                const stateOrder = { failed: 0, expired: 1, notTriggered: 2, running: 3, queued: 4, succeeded: 5 };
                const sorted = buildPolicies.sort((a, b) => {
                    const stateA = ChecksFormatter.getBuildState(a);
                    const stateB = ChecksFormatter.getBuildState(b);
                    return (stateOrder[stateA] ?? 5) - (stateOrder[stateB] ?? 5);
                });

                let buildHtml = '<div class="check-group"><div class="check-group-header">🔧 Builds</div><ul class="check-list">';

                sorted.forEach(p => {
                    const state = ChecksFormatter.getBuildState(p);
                    const icon = ChecksFormatter.getBuildStatusSvg(state, 14);
                    const stateClasses = { expired: 'status-indicator-expired', notTriggered: 'status-indicator-not-triggered' };
                    const cls = stateClasses[state] || getStatusClass(p.status);
                    const { label, extra } = ChecksFormatter.formatPolicy(p);
                    const extraHtml = extra ? ` <span class="check-extra">${extra}</span>` : '';

                    // Queue button for builds that can be queued/requeued
                    const canQueue = ['notTriggered', 'failed', 'succeeded', 'expired'].includes(state);
                    const evaluationId = p.evaluationId;
                    let queueBtn = '';
                    if (canQueue && evaluationId) {
                        const tooltip = state === 'notTriggered' ? 'Queue build' : 'Requeue build';
                        queueBtn = `<button class="queue-build-btn" data-evaluation-id="${evaluationId}" title="${tooltip}"><svg height="16" viewBox="0 0 32 32" width="16"><circle cx="16" cy="16" r="16" fill="#0078d4"/><path d="M12 9v14l12-7z" fill="#fff"/></svg></button>`;
                    }

                    // Link to the build run if a buildId is available
                    const buildId = p.context?.buildId;
                    let labelHtml;
                    if (buildId) {
                        const buildUrl = `${config.serverUrl}/${config.organization}/${config.project}/_build/results?buildId=${buildId}`;
                        labelHtml = `<a href="${ADOContent.escapeHtml(buildUrl)}" target="_blank" rel="noopener">${ADOContent.escapeHtml(label)}</a>`;
                    } else {
                        labelHtml = ADOContent.escapeHtml(label);
                    }

                    buildHtml += `<li class="check-item ${cls}"><span class="check-icon">${icon}</span> ${labelHtml}${extraHtml}${queueBtn}</li>`;
                });

                buildHtml += '</ul></div>';
                sections.push(buildHtml);
            }

            // Non-build policy evaluations section
            const nonBuildPolicies = policies.filter(p => !ChecksFormatter.isBuildPolicy(p));
            if (nonBuildPolicies.length > 0) {
                const rejected = nonBuildPolicies.filter(e => e.status === 'rejected');
                const running = nonBuildPolicies.filter(e => e.status === 'running' || e.status === 'queued');
                const approved = nonBuildPolicies.filter(e => e.status === 'approved');

                let policyHtml = '<div class="check-group"><div class="check-group-header">📋 Policies</div><ul class="check-list">';

                // Show rejected first, then running, then approved
                [...rejected, ...running, ...approved].forEach(p => {
                    const icon = getStatusIcon(p.status);
                    const cls = getStatusClass(p.status);
                    const { label, extra } = ChecksFormatter.formatPolicy(p);
                    const extraHtml = extra ? ` <span class="check-extra">${extra}</span>` : '';

                    policyHtml += `<li class="check-item ${cls}"><span class="check-icon">${icon}</span> ${ADOContent.escapeHtml(label)}${extraHtml}</li>`;
                });

                policyHtml += '</ul></div>';
                sections.push(policyHtml);
            }

            if (sections.length === 0) {
                return '';
            }

            return `
                <div class="checks-section">
                    <h4>Checks</h4>
                    ${sections.join('')}
                </div>
            `;
        }

        if (typeof module !== 'undefined' && module.exports) {
            module.exports = { renderChecksSection, renderWorkItemsSection, computeThreadStatusCounts };
        }
