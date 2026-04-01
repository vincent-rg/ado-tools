// Bulk thread selection and status operations for ado-pr-threads.html

function toggleBulkMode() {
    isBulkMode = !isBulkMode;
    selectedThreadIds.clear();

    const button = document.getElementById('bulkModeToggle');
    const bulkActions = document.getElementById('bulkActions');
    const filters = document.querySelectorAll('.sidebar .filter-section');

    if (isBulkMode) {
        button.textContent = 'Disable Bulk Selection';
        button.classList.remove('btn-secondary');
        button.classList.add('btn-primary');
        bulkActions.classList.add('show');

        // Disable filters in bulk mode
        filters.forEach(row => {
            const inputs = row.querySelectorAll('input, select');
            inputs.forEach(input => input.disabled = true);
        });
    } else {
        button.textContent = 'Enable Bulk Selection';
        button.classList.remove('btn-primary');
        button.classList.add('btn-secondary');
        bulkActions.classList.remove('show');

        // Enable filters
        filters.forEach(row => {
            const inputs = row.querySelectorAll('input, select');
            inputs.forEach(input => input.disabled = false);
        });
    }

    // Refresh display to show/hide checkboxes
    applyThreadFilters();
}

function toggleThreadSelection(threadId) {
    if (selectedThreadIds.has(threadId)) {
        selectedThreadIds.delete(threadId);
    } else {
        selectedThreadIds.add(threadId);
    }

    // Update selected count
    document.getElementById('selectedCount').textContent = selectedThreadIds.size;

    // Update checkbox state
    const checkbox = document.getElementById(`thread-checkbox-${threadId}`);
    if (checkbox) {
        checkbox.checked = selectedThreadIds.has(threadId);
    }
}

function selectAllThreads() {
    selectedThreadIds.clear();

    // Get all visible thread IDs
    const checkboxes = document.querySelectorAll('.thread-checkbox');
    checkboxes.forEach(checkbox => {
        const threadId = checkbox.dataset.threadId;
        selectedThreadIds.add(threadId);
        checkbox.checked = true;
    });

    document.getElementById('selectedCount').textContent = selectedThreadIds.size;
}

function deselectAllThreads() {
    selectedThreadIds.clear();

    const checkboxes = document.querySelectorAll('.thread-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    document.getElementById('selectedCount').textContent = 0;
}

async function changeThreadStatus(threadId, newStatus) {
    if (!currentConfig || !currentPRId || !newStatus) return;

    const _opId = ++window._adoOpSeq;
    if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] changeThreadStatus threadId=${threadId} newStatus=${newStatus} t=${Date.now()}`);

    try {
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] updateThreadStatus API start t=${Date.now()}`);
        const updatedThread = await ADOAPI.updateThreadStatus(currentConfig, currentPRId, threadId, newStatus);
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] API returned status=${updatedThread.status} t=${Date.now()}`);

        // Update local thread data with response from API
        // Note: threadId from onclick is a string, but thread.id is a number
        const thread = allThreads.find(t => t.id == threadId);
        if (thread && updatedThread) {
            const oldStatus = thread.status;
            thread.status = updatedThread.status;
            thread.properties = updatedThread.properties;
            if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] optimistic update ${oldStatus} → ${thread.status}`);
        } else {
            if (window._adoDebugStatus) console.warn(`[STATUS op#${_opId}] thread ${threadId} not found in allThreads for optimistic update`);
        }

        // Refresh display to show updated badge
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] applyThreadFilters start t=${Date.now()}`);
        applyThreadFilters();
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] applyThreadFilters done t=${Date.now()}`);
        refreshInlineThreadsIfNeeded();
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] refreshInlineThreadsIfNeeded done t=${Date.now()}`);

        return true;
    } catch (error) {
        console.error(`Failed to update thread status:`, error);
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] ERROR t=${Date.now()}`, error.message);
        alert(`Failed to update thread status: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        return false;
    }
}

async function removeThreadStatus(threadId) {
    if (!currentConfig || !currentPRId) return;

    const confirmed = confirm('Are you sure you want to remove the status from this thread?');
    if (!confirmed) return;

    const _opId = ++window._adoOpSeq;
    if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] removeThreadStatus threadId=${threadId} t=${Date.now()}`);

    try {
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] removeThreadStatus API start t=${Date.now()}`);
        const updatedThread = await ADOAPI.removeThreadStatus(currentConfig, currentPRId, threadId);
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] API done, new status=${updatedThread.status} t=${Date.now()}`);

        // Update local thread data with response from API
        // Note: threadId from onclick is a string, but thread.id is a number
        const thread = allThreads.find(t => t.id == threadId);
        if (thread && updatedThread) {
            const oldStatus = thread.status;
            thread.status = updatedThread.status;
            thread.properties = updatedThread.properties;
            if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] optimistic update ${oldStatus} → ${thread.status}`);
        } else {
            if (window._adoDebugStatus) console.warn(`[STATUS op#${_opId}] thread ${threadId} not found in allThreads for optimistic update`);
        }

        // Refresh display
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] applyThreadFilters start t=${Date.now()}`);
        applyThreadFilters();
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] applyThreadFilters done t=${Date.now()}`);
        refreshInlineThreadsIfNeeded();
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] refreshInlineThreadsIfNeeded done t=${Date.now()}`);

        return true;
    } catch (error) {
        console.error(`Failed to remove thread status:`, error);
        if (window._adoDebugStatus) console.log(`[STATUS op#${_opId}] ERROR t=${Date.now()}`, error.message);
        alert(`Failed to remove thread status: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        return false;
    }
}

async function applyBulkStatusChange() {
    const newStatus = document.getElementById('bulkStatusSelect').value;

    if (!newStatus) {
        alert('Please select a status to apply.');
        return;
    }

    if (selectedThreadIds.size === 0) {
        alert('Please select at least one thread.');
        return;
    }

    const statusLabels = {
        'active': 'Active',
        'fixed': 'Resolved',
        'closed': 'Closed',
        'wontFix': "Won't Fix",
        'pending': 'Pending'
    };
    const statusLabel = statusLabels[newStatus] || newStatus;

    const confirmed = confirm(`Are you sure you want to change ${selectedThreadIds.size} thread(s) to "${statusLabel}"?`);
    if (!confirmed) return;

    ADOUI.showLoading('results', `Updating ${selectedThreadIds.size} thread(s)...`);

    let successCount = 0;
    let failCount = 0;

    for (const threadId of selectedThreadIds) {
        const success = await changeThreadStatus(threadId, newStatus);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }

    // Clear selection and refresh
    selectedThreadIds.clear();
    document.getElementById('selectedCount').textContent = 0;
    document.getElementById('bulkStatusSelect').value = '';

    applyThreadFilters();

    if (failCount === 0) {
        alert(`Successfully updated ${successCount} thread(s).`);
    } else {
        alert(`Updated ${successCount} thread(s) successfully.\n${failCount} thread(s) failed to update.`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { changeThreadStatus, removeThreadStatus, applyBulkStatusChange };
}
