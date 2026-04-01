// PR status actions (draft/abandon/reactivate/complete/auto-complete) for ado-pr-threads.html

function showPRActionModal(title, bodyHtml, footerHtml) {
    document.getElementById('prActionModalTitle').textContent = title;
    document.getElementById('prActionModalBody').innerHTML = bodyHtml;
    document.getElementById('prActionModalFooter').innerHTML = footerHtml;
    document.getElementById('prActionModal').classList.add('show');
}

function closePRActionModal() {
    document.getElementById('prActionModal').classList.remove('show');
}

function renderPRStatusActions(prData) {
    if (!prData) return '';

    const status = prData.status;
    const isDraft = prData.isDraft;

    // Completed PRs have no actions
    if (status === 'completed') return '';

    let actions = [];

    if (status === 'active') {
        if (isDraft) {
            actions.push(`<option value="publish">Publish (Remove Draft)</option>`);
        } else {
            actions.push(`<option value="draft">Mark as Draft</option>`);
        }
        actions.push(`<option value="abandon">Abandon</option>`);
        actions.push(`<option value="complete">Complete</option>`);
    } else if (status === 'abandoned') {
        actions.push(`<option value="reactivate">Reactivate</option>`);
    }

    if (actions.length === 0) return '';

    return `
        <select id="prStatusActionSelect" onchange="handlePRStatusAction(this.value); this.value='';" class="pr-action-select">
            <option value="">Set to</option>
            ${actions.join('')}
        </select>
    `;
}

function renderAutoCompleteButton(prData) {
    if (!prData) return '';

    // Only show for active, non-draft PRs
    if (prData.status !== 'active' || prData.isDraft) return '';

    const isSet = !!prData.autoCompleteSetBy;
    const buttonClass = isSet ? 'auto-complete-btn active' : 'auto-complete-btn';
    const buttonText = isSet ? 'Remove Auto-Complete' : 'Set Auto-Complete';
    const lightningIcon = ADOUI.getLightningSvg(14, 14, 'auto-complete-icon');

    return `<button id="autoCompleteBtn" class="${buttonClass}" onclick="handleAutoCompleteToggle()" title="${buttonText}">${lightningIcon} ${buttonText}</button>`;
}

async function handleAutoCompleteToggle() {
    if (!currentConfig || !currentPRData) return;

    const isCurrentlySet = !!currentPRData.autoCompleteSetBy;
    const actionText = isCurrentlySet ? 'remove auto-complete from' : 'set auto-complete on';

    // Disable button during operation
    const btn = document.getElementById('autoCompleteBtn');
    if (btn) btn.disabled = true;

    try {
        if (isCurrentlySet) {
            // Remove auto-complete
            await ADOAPI.removeAutoComplete(currentConfig, currentPRId);
        } else {
            // Set auto-complete - need to get current user first
            const currentUser = await ADOAPI.getCurrentUser(currentConfig);
            await ADOAPI.setAutoComplete(currentConfig, currentPRId, { id: currentUser.id });
        }

        // Refresh PR data
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);
        updatePRStatusDisplay();
    } catch (error) {
        alert(`Failed to ${actionText} this PR: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handlePRStatusAction(action) {
    if (!action || !currentConfig || !currentPRData) return;

    switch (action) {
        case 'draft':
            await handleSetDraft(true);
            break;
        case 'publish':
            await handleSetDraft(false);
            break;
        case 'abandon':
            await handleAbandon();
            break;
        case 'reactivate':
            await handleReactivate();
            break;
        case 'complete':
            await handleComplete();
            break;
    }
}

async function handleSetDraft(isDraft) {
    const actionText = isDraft ? 'mark as draft' : 'publish';
    const confirmed = confirm(`Are you sure you want to ${actionText} this PR?`);
    if (!confirmed) return;

    try {
        await ADOAPI.setDraft(currentConfig, currentPRId, isDraft);
        // Refresh PR data
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);
        updatePRStatusDisplay();
    } catch (error) {
        alert(`Failed to ${actionText}: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    }
}

async function handleAbandon() {
    const confirmed = confirm('Are you sure you want to abandon this PR?\n\nThis will mark the PR as abandoned. It can be reactivated later.');
    if (!confirmed) return;

    try {
        await ADOAPI.abandonPR(currentConfig, currentPRId);
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);
        updatePRStatusDisplay();
    } catch (error) {
        alert(`Failed to abandon PR: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    }
}

async function handleReactivate() {
    const confirmed = confirm('Are you sure you want to reactivate this PR?');
    if (!confirmed) return;

    try {
        await ADOAPI.reactivatePR(currentConfig, currentPRId);
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);
        updatePRStatusDisplay();
    } catch (error) {
        alert(`Failed to reactivate PR: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    }
}

async function handleComplete() {
    // Show loading modal
    showPRActionModal(
        'Complete Pull Request',
        '<div class="pr-modal-body-loading">Checking completion requirements...</div>',
        ''
    );

    try {
        // Use the already-fetched prChecksData if available, otherwise fetch
        let checksData = prChecksData;
        if (!checksData) {
            const projectId = currentPRData.repository?.project?.id || currentConfig.project;
            checksData = await ChecksFormatter.fetchPRChecks(
                currentConfig,
                currentConfig.project,
                currentConfig.repository,
                currentPRId,
                projectId,
                currentPRData.mergeStatus
            );
        }

        // Check for blocking issues
        const blockingIssues = getCompletionBlockers(checksData, currentPRData);

        if (blockingIssues.length > 0) {
            showCompletionBlockedModal(blockingIssues);
        } else {
            await showCompletionOptionsModal();
        }
    } catch (error) {
        showPRActionModal(
            'Error',
            `<div class="error">Failed to check completion requirements: ${ADOContent.escapeHtml(error.message)}</div>`,
            `<button class="btn-secondary" onclick="closePRActionModal()">Close</button>`
        );
    }
}

function getCompletionBlockers(checksData, prData) {
    return PRThreadsUtils.getCompletionBlockers(checksData, prData, {
        formatPolicy: ChecksFormatter.formatPolicy.bind(ChecksFormatter)
    });
}

function showCompletionBlockedModal(blockers) {
    let bodyHtml = `
        <p style="margin-bottom: 15px;">This PR cannot be completed due to the following issues:</p>
        <ul class="blocker-list">
    `;

    blockers.forEach(b => {
        let cls, icon;
        if (b.type === 'conflict') {
            cls = 'blocker-conflict';
            icon = '⚠';
        } else if (b.status === 'running' || b.status === 'queued') {
            cls = 'blocker-running';
            icon = '⏳';
        } else {
            cls = 'blocker-policy';
            icon = '✗';
        }
        bodyHtml += `<li class="${cls}">${icon} ${ADOContent.escapeHtml(b.message)}</li>`;
    });

    bodyHtml += '</ul>';

    showPRActionModal(
        'Cannot Complete PR',
        bodyHtml,
        `<button class="btn-secondary" onclick="closePRActionModal()">Close</button>`
    );
}

async function showCompletionOptionsModal() {
    // Build merge strategy options
    const mergeStrategies = [
        { value: 'noFastForward', label: 'Merge (no fast forward)' },
        { value: 'squash', label: 'Squash commit' },
        { value: 'rebase', label: 'Rebase' },
        { value: 'rebaseMerge', label: 'Rebase and merge' }
    ];

    const strategyOptions = mergeStrategies
        .map(s => `<option value="${s.value}">${s.label}</option>`)
        .join('');

    // Build default merge commit message
    const defaultMessage = `Merged PR ${currentPRId}: ${currentPRData.title || ''}`;

    const bodyHtml = `
        <div class="merge-option-group">
            <label for="mergeStrategy">Merge Type:</label>
            <select id="mergeStrategy">
                ${strategyOptions}
            </select>
        </div>
        <div class="merge-option-group">
            <label for="mergeCommitMessage">Commit Message:</label>
            <textarea id="mergeCommitMessage">${ADOContent.escapeHtml(defaultMessage)}</textarea>
        </div>
        <div class="merge-option-group">
            <label class="merge-option-checkbox">
                <input type="checkbox" id="deleteSourceBranch" checked>
                Delete source branch after merging
            </label>
        </div>
    `;

    const footerHtml = `
        <button class="btn-secondary" onclick="closePRActionModal()">Cancel</button>
        <button class="btn-primary" onclick="executePRCompletion()">Complete</button>
    `;

    showPRActionModal('Complete Pull Request', bodyHtml, footerHtml);
}

async function executePRCompletion() {
    const mergeStrategy = document.getElementById('mergeStrategy').value;
    const deleteSourceBranch = document.getElementById('deleteSourceBranch').checked;
    const mergeCommitMessage = document.getElementById('mergeCommitMessage').value;

    // Update modal to show loading
    document.getElementById('prActionModalBody').innerHTML =
        '<div class="pr-modal-body-loading">Completing pull request...</div>';
    document.getElementById('prActionModalFooter').innerHTML = '';

    try {
        const completionOptions = {
            mergeStrategy,
            deleteSourceBranch,
            mergeCommitMessage
        };

        const lastMergeSourceCommitId = currentPRData.lastMergeSourceCommit?.commitId;
        if (!lastMergeSourceCommitId) {
            throw new Error('Cannot determine source commit for completion. The PR may need to be re-queued for merge.');
        }

        // Pre-set completionOptions on the PR to satisfy "Require a merge strategy" policy
        await ADOAPI.setCompletionOptions(currentConfig, currentPRId, completionOptions);

        const updatedPR = await ADOAPI.completePR(
            currentConfig,
            currentPRId,
            lastMergeSourceCommitId,
            completionOptions
        );

        closePRActionModal();

        // Update PR data from response and refresh display
        currentPRData = updatedPR;
        updatePRStatusDisplay();

        // Show success message briefly
        alert('Pull request completed successfully!');
    } catch (error) {
        showPRActionModal(
            'Completion Failed',
            `<div class="error">${ADOContent.escapeHtml(error.message)}</div>`,
            `<button class="btn-secondary" onclick="closePRActionModal()">Close</button>`
        );
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderPRStatusActions, renderAutoCompleteButton, getCompletionBlockers, showCompletionBlockedModal };
}

function updatePRStatusDisplay() {
    const statusBadgesEl = document.getElementById('prStatusBadges');
    const actionsEl = document.getElementById('prStatusActions');
    const autoCompleteEl = document.getElementById('autoCompleteBtnContainer');

    if (statusBadgesEl && currentPRData) {
        statusBadgesEl.innerHTML = ADOUI.renderStatusBadge(currentPRData.status, currentPRData);
    }

    if (actionsEl && currentPRData) {
        actionsEl.innerHTML = renderPRStatusActions(currentPRData);
    }

    if (autoCompleteEl && currentPRData) {
        autoCompleteEl.innerHTML = renderAutoCompleteButton(currentPRData);
    }
}
