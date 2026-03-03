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

    try {
        console.log(`Attempting to change thread ${threadId} status to: ${newStatus}`);
        const updatedThread = await ADOAPI.updateThreadStatus(currentConfig, currentPRId, threadId, newStatus);
        console.log(`API returned status:`, updatedThread.status);
        console.log(`Full updated thread:`, updatedThread);

        // Update local thread data with response from API
        // Note: threadId from onclick is a string, but thread.id is a number
        const thread = allThreads.find(t => t.id == threadId);
        if (thread && updatedThread) {
            const oldStatus = thread.status;
            thread.status = updatedThread.status;
            thread.properties = updatedThread.properties;
            console.log(`Updated local thread from ${oldStatus} to ${thread.status}`);
        } else {
            console.warn(`Could not find thread ${threadId} in allThreads to update locally`);
        }

        // Refresh display to show updated badge
        applyThreadFilters();
        refreshInlineThreadsIfNeeded();

        return true;
    } catch (error) {
        console.error(`Failed to update thread status:`, error);
        alert(`Failed to update thread status: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        return false;
    }
}

async function removeThreadStatus(threadId) {
    if (!currentConfig || !currentPRId) return;

    const confirmed = confirm('Are you sure you want to remove the status from this thread?');
    if (!confirmed) return;

    try {
        console.log(`Attempting to remove status from thread ${threadId}`);
        const updatedThread = await ADOAPI.removeThreadStatus(currentConfig, currentPRId, threadId);
        console.log(`API returned after removing status:`, updatedThread);

        // Update local thread data with response from API
        // Note: threadId from onclick is a string, but thread.id is a number
        const thread = allThreads.find(t => t.id == threadId);
        if (thread && updatedThread) {
            thread.status = updatedThread.status;
            thread.properties = updatedThread.properties;
            console.log(`Removed status from thread, new status:`, thread.status);
        } else {
            console.warn(`Could not find thread ${threadId} in allThreads to update locally`);
        }

        // Refresh display
        applyThreadFilters();
        refreshInlineThreadsIfNeeded();

        return true;
    } catch (error) {
        console.error(`Failed to remove thread status:`, error);
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
