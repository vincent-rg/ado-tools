// pr-line-stats.js — Line stats computation for ado-pr-threads.html
// Depends on: HistogramDiff (diff.js), PRThreadsUtils (pr-threads-utils.js),
//             ADOAPI (common.js), ADOContent (common.js)
// Accesses globals: currentPRData, allIterations, currentMergeBase, currentConfig

        function getLineStatsCacheKey(config, prId, iterationCount) {
            return PRThreadsUtils.getLineStatsCacheKey(config, prId, iterationCount);
        }

        function getCachedLineStats(cacheKey) {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (e) {
                console.warn('Failed to read line stats cache:', e);
            }
            return null;
        }

        function setCachedLineStats(cacheKey, stats) {
            try {
                localStorage.setItem(cacheKey, JSON.stringify(stats));
            } catch (e) {
                console.warn('Failed to cache line stats:', e);
            }
        }

        function computeLineDiff(oldContent, newContent) {
            // Use histogram diff for accurate line stats
            return HistogramDiff.stats(oldContent, newContent);
        }

        async function fetchFileContent(config, path, commitId) {
            try {
                const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&api-version=6.0`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Basic ${btoa(':' + config.pat)}` }
                });
                if (!response.ok) return null;
                return await response.text();
            } catch (e) {
                return null;
            }
        }

        async function fetchLineStatsViaLocalDiff(config, prData, changes, mergeBaseCommit) {
            const baseCommit = mergeBaseCommit;
            const targetCommit = prData.lastMergeSourceCommit?.commitId;

            console.group('[LineStats:LocalDiff] Starting');
            console.log('baseCommit (merge base):', baseCommit);
            console.log('targetCommit (lastMergeSourceCommit):', targetCommit);

            let totalAdded = 0;
            let totalRemoved = 0;

            // Process files
            for (const change of changes) {
                const newPath = change.item?.path;
                if (!newPath) continue;

                const changeType = (change.changeType || '').toLowerCase();
                // For renames, sourceServerItem or originalPath contains the old path
                const oldPath = change.sourceServerItem || change.originalPath || newPath;

                console.group(`  File: ${newPath} (changeType: ${changeType})`);

                if (changeType.includes('add')) {
                    const content = await fetchFileContent(config, newPath, targetCommit);
                    if (content) {
                        const lines = content.split('\n').length;
                        console.log(`  Added file: ${lines} lines`);
                        totalAdded += lines;
                    }
                } else if (changeType.includes('delete')) {
                    const content = await fetchFileContent(config, oldPath, baseCommit);
                    if (content) {
                        const lines = content.split('\n').length;
                        console.log(`  Deleted file: ${lines} lines`);
                        totalRemoved += lines;
                    }
                } else if (changeType.includes('edit') || changeType.includes('rename')) {
                    const [oldContent, newContent] = await Promise.all([
                        fetchFileContent(config, oldPath, baseCommit),
                        fetchFileContent(config, newPath, targetCommit)
                    ]);
                    console.log(`  Old content length: ${oldContent?.length ?? 'null'} chars, ${oldContent?.split('\\n').length ?? 0} lines`);
                    console.log(`  New content length: ${newContent?.length ?? 'null'} chars, ${newContent?.split('\\n').length ?? 0} lines`);
                    const diff = computeLineDiff(oldContent, newContent);
                    console.log(`  Diff result: +${diff.added} -${diff.removed}`);
                    totalAdded += diff.added;
                    totalRemoved += diff.removed;
                }

                console.log(`  Running total: +${totalAdded} -${totalRemoved}`);
                console.groupEnd();
            }

            console.log(`TOTAL via local diff: +${totalAdded} -${totalRemoved}`);
            console.groupEnd();
            return { added: totalAdded, removed: totalRemoved };
        }

        async function resolveMergeBase(config) {
            const sourceCommit = currentPRData.lastMergeSourceCommit?.commitId;
            const targetBranchCommit = currentPRData.lastMergeTargetCommit?.commitId;

            if (!sourceCommit || !targetBranchCommit) return null;

            // Try iteration commonRefCommit first
            if (allIterations.length > 0 && allIterations[0].commonRefCommit?.commitId) {
                return allIterations[0].commonRefCommit.commitId;
            }

            // Fallback: merge bases API
            try {
                const mergeBasesData = await ADOAPI.getMergeBases(config, sourceCommit, targetBranchCommit);
                const bases = mergeBasesData.value || [];
                if (bases.length > 0) {
                    return bases[0].commitId;
                }
            } catch (e) {
                console.warn('Merge bases API failed:', e);
            }

            // Last resort: target branch HEAD
            console.warn('Could not resolve merge base, falling back to lastMergeTargetCommit');
            return targetBranchCommit;
        }

        async function fetchLineStatsAsync(config, prData) {
            const iterationCount = allIterations.length;
            const cacheKey = getLineStatsCacheKey(config, prData.pullRequestId, iterationCount);

            console.group('[LineStats] fetchLineStatsAsync for PR #' + prData.pullRequestId);
            console.log('Iteration count:', iterationCount);
            console.log('Cache key:', cacheKey);
            console.log('PR source branch:', prData.sourceRefName);
            console.log('PR target branch:', prData.targetRefName);
            console.log('lastMergeTargetCommit:', prData.lastMergeTargetCommit?.commitId);
            console.log('lastMergeSourceCommit:', prData.lastMergeSourceCommit?.commitId);
            console.log('lastMergeCommit:', prData.lastMergeCommit?.commitId);

            // Check cache first (validate that values are numbers, not null)
            const cached = getCachedLineStats(cacheKey);
            if (cached && typeof cached.added === 'number' && typeof cached.removed === 'number') {
                console.log('CACHE HIT — returning cached stats:', cached);
                console.log('To force recalculation, run: localStorage.removeItem("' + cacheKey + '")');
                console.groupEnd();
                updateLineStatsDisplay(cached.added, cached.removed);
                return;
            }
            console.log('CACHE MISS — computing fresh stats');

            // Need to compute - show loading
            updateLineStatsLoading();

            try {
                const mergeBaseCommit = currentMergeBase || await resolveMergeBase(config);

                if (!mergeBaseCommit) {
                    console.warn('Missing merge base commit, aborting');
                    console.groupEnd();
                    hideLineStatsLoading();
                    return;
                }

                console.log('Using merge base:', mergeBaseCommit);

                // Get file changes from the latest iteration compared to base (compareTo=0)
                // This gives cumulative changes across all pushes, not just the first push
                const latestIterationId = iterationCount;
                console.log('Fetching changes for iteration', latestIterationId, 'compared to base (compareTo=0)');
                const changesData = await ADOAPI.getPRIterationChanges(config, prData.pullRequestId, latestIterationId, 0);
                const changes = changesData.changeEntries || [];

                console.log('Cumulative PR changes (' + changes.length + ' files):', changes.map(c => ({
                    path: c.item?.path,
                    changeType: c.changeType,
                    sourceServerItem: c.sourceServerItem
                })));

                if (changes.length === 0) {
                    console.log('No changes found, displaying 0/0');
                    console.groupEnd();
                    updateLineStatsDisplay(0, 0);
                    return;
                }

                const stats = await fetchLineStatsViaLocalDiff(config, prData, changes, mergeBaseCommit);
                console.log('Final stats via local diff:', stats);

                console.log('=== FINAL LINE STATS: +' + stats.added + ' -' + stats.removed + ' ===');
                setCachedLineStats(cacheKey, stats);
                updateLineStatsDisplay(stats.added, stats.removed);

            } catch (e) {
                console.warn('Failed to compute line stats:', e);
                hideLineStatsLoading();
            }
            console.groupEnd();
        }

        function hideLineStatsLoading() {
            const container = document.getElementById('lineStatsContainer');
            if (container) {
                container.innerHTML = '';
            }
        }

        function updateLineStatsLoading() {
            const container = document.getElementById('lineStatsContainer');
            if (!container) return;
            container.innerHTML = `
                <span>Lines</span>
                <span style="color: #605e5c;">⏳</span>
                ${getLineStatsMenuHtml()}
            `;
        }

        function getLineStatsMenuHtml() {
            return `
                <div class="line-stats-menu-wrapper">
                    <button class="line-stats-menu-btn" onclick="toggleLineStatsMenu(event)" title="Options">
                        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                    </button>
                    <div class="line-stats-context-menu" id="lineStatsContextMenu">
                        <button onclick="resetLineStats()">🔄 Reset line stat</button>
                    </div>
                </div>
            `;
        }

        function toggleLineStatsMenu(event) {
            event.stopPropagation();
            const menu = document.getElementById('lineStatsContextMenu');
            if (!menu) return;
            menu.classList.toggle('open');

            // Close on outside click
            if (menu.classList.contains('open')) {
                const closeHandler = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.classList.remove('open');
                        document.removeEventListener('click', closeHandler);
                    }
                };
                // Defer so the current click doesn't immediately close it
                setTimeout(() => document.addEventListener('click', closeHandler), 0);
            }
        }

        async function resetLineStats() {
            // Close the menu
            const menu = document.getElementById('lineStatsContextMenu');
            if (menu) menu.classList.remove('open');

            if (!currentConfig || !currentPRData) return;

            // Remove cache entry
            const iterationCount = allIterations.length;
            const cacheKey = getLineStatsCacheKey(currentConfig, currentPRData.pullRequestId, iterationCount);
            try {
                localStorage.removeItem(cacheKey);
                console.log('Removed line stats cache for key:', cacheKey);
            } catch (e) {
                console.warn('Failed to remove line stats cache:', e);
            }

            // Trigger fresh computation
            await fetchLineStatsAsync(currentConfig, currentPRData);
        }

        function updateLineStatsDisplay(added, removed) {
            const container = document.getElementById('lineStatsContainer');
            if (!container) return;

            container.innerHTML = `
                <span>Lines</span>
                <strong style="color: #107c10;" title="Added">+${added}</strong>
                <strong style="color: #a4262c;" title="Removed">-${removed}</strong>
                ${getLineStatsMenuHtml()}
            `;
        }
