import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing the module
globalThis.currentConfig = { serverUrl: 'https://dev.azure.com', organization: 'org', project: 'proj' };
globalThis.currentPRId = 42;
globalThis.allThreads = [];
globalThis.selectedThreadIds = new Set();
globalThis.isBulkMode = false;
globalThis.window = globalThis.window || {};
globalThis.window._adoOpSeq = 0;
globalThis.window._adoDebugStatus = false;

globalThis.ADOAPI = {
    updateThreadStatus: vi.fn(),
    removeThreadStatus: vi.fn(),
};
globalThis.ADOUI = {
    showLoading: vi.fn(),
};
globalThis.applyThreadFilters = vi.fn();
globalThis.refreshInlineThreadsIfNeeded = vi.fn();
globalThis.alert = vi.fn();
globalThis.confirm = vi.fn(() => true);

// Mock document for bulk UI
globalThis.document = {
    getElementById: vi.fn((id) => {
        if (id === 'bulkStatusSelect') return { value: '' };
        if (id === 'selectedCount') return { textContent: '' };
        if (id === 'bulkModeToggle') return { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } };
        if (id === 'bulkActions') return { classList: { add: vi.fn(), remove: vi.fn() } };
        return null;
    }),
    querySelectorAll: vi.fn(() => []),
};

const { changeThreadStatus, removeThreadStatus, applyBulkStatusChange } =
    await import('../js/pr-bulk-operations.js');

describe('changeThreadStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.currentConfig = { serverUrl: 'https://dev.azure.com' };
        globalThis.currentPRId = 42;
        globalThis.allThreads = [];
        globalThis.window._adoOpSeq = 0;
    });

    it('returns undefined when currentConfig is falsy', async () => {
        globalThis.currentConfig = null;
        const result = await changeThreadStatus(1, 'fixed');
        expect(ADOAPI.updateThreadStatus).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('returns undefined when currentPRId is falsy', async () => {
        globalThis.currentPRId = null;
        const result = await changeThreadStatus(1, 'fixed');
        expect(ADOAPI.updateThreadStatus).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('returns undefined when newStatus is falsy', async () => {
        const result = await changeThreadStatus(1, '');
        expect(ADOAPI.updateThreadStatus).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('calls API with correct arguments', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });
        globalThis.allThreads = [{ id: 1, status: 'active' }];

        await changeThreadStatus(1, 'fixed');
        expect(ADOAPI.updateThreadStatus).toHaveBeenCalledWith(
            globalThis.currentConfig, 42, 1, 'fixed'
        );
    });

    it('returns true on success', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });
        globalThis.allThreads = [{ id: 1, status: 'active' }];

        const result = await changeThreadStatus(1, 'fixed');
        expect(result).toBe(true);
    });

    it('updates local thread object on success', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: { key: 'val' } });
        globalThis.allThreads = [{ id: 1, status: 'active', properties: {} }];

        await changeThreadStatus(1, 'fixed');
        expect(globalThis.allThreads[0].status).toBe('fixed');
        expect(globalThis.allThreads[0].properties).toEqual({ key: 'val' });
    });

    it('handles string/number threadId matching (loose equality)', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'closed', properties: {} });
        globalThis.allThreads = [{ id: 5, status: 'active' }];

        // Pass threadId as string (like from onclick)
        await changeThreadStatus('5', 'closed');
        expect(globalThis.allThreads[0].status).toBe('closed');
    });

    it('does not crash when thread not found in allThreads', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });
        globalThis.allThreads = [{ id: 99, status: 'active' }];

        const result = await changeThreadStatus(1, 'fixed');
        expect(result).toBe(true);
    });

    it('calls applyThreadFilters and refreshInlineThreadsIfNeeded on success', async () => {
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });
        globalThis.allThreads = [];

        await changeThreadStatus(1, 'fixed');
        expect(applyThreadFilters).toHaveBeenCalled();
        expect(refreshInlineThreadsIfNeeded).toHaveBeenCalled();
    });

    it('shows alert and returns false on API error', async () => {
        ADOAPI.updateThreadStatus.mockRejectedValue(new Error('403 Forbidden'));

        const result = await changeThreadStatus(1, 'fixed');
        expect(result).toBe(false);
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('403 Forbidden'));
    });
});

describe('removeThreadStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.currentConfig = { serverUrl: 'https://dev.azure.com' };
        globalThis.currentPRId = 42;
        globalThis.allThreads = [];
        globalThis.window._adoOpSeq = 0;
        confirm.mockReturnValue(true);
    });

    it('returns undefined when currentConfig is falsy', async () => {
        globalThis.currentConfig = null;
        await removeThreadStatus(1);
        expect(ADOAPI.removeThreadStatus).not.toHaveBeenCalled();
    });

    it('returns undefined when confirm is cancelled', async () => {
        confirm.mockReturnValue(false);
        await removeThreadStatus(1);
        expect(ADOAPI.removeThreadStatus).not.toHaveBeenCalled();
    });

    it('calls API and updates local thread on success', async () => {
        ADOAPI.removeThreadStatus.mockResolvedValue({ status: undefined, properties: {} });
        globalThis.allThreads = [{ id: 1, status: 'fixed', properties: { key: 'val' } }];

        const result = await removeThreadStatus(1);
        expect(result).toBe(true);
        expect(ADOAPI.removeThreadStatus).toHaveBeenCalledWith(globalThis.currentConfig, 42, 1);
        expect(globalThis.allThreads[0].status).toBeUndefined();
    });

    it('shows alert on API error', async () => {
        ADOAPI.removeThreadStatus.mockRejectedValue(new Error('Server error'));

        const result = await removeThreadStatus(1);
        expect(result).toBe(false);
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('Server error'));
    });
});

describe('applyBulkStatusChange', () => {
    let mockBulkStatusSelect;
    let mockSelectedCount;

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.currentConfig = { serverUrl: 'https://dev.azure.com' };
        globalThis.currentPRId = 42;
        globalThis.allThreads = [];
        globalThis.selectedThreadIds = new Set();
        globalThis.window._adoOpSeq = 0;
        confirm.mockReturnValue(true);

        mockBulkStatusSelect = { value: '' };
        mockSelectedCount = { textContent: '' };

        document.getElementById.mockImplementation((id) => {
            if (id === 'bulkStatusSelect') return mockBulkStatusSelect;
            if (id === 'selectedCount') return mockSelectedCount;
            return null;
        });
    });

    it('alerts when no status selected', async () => {
        mockBulkStatusSelect.value = '';
        await applyBulkStatusChange();
        expect(alert).toHaveBeenCalledWith('Please select a status to apply.');
    });

    it('alerts when no threads selected', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set();
        await applyBulkStatusChange();
        expect(alert).toHaveBeenCalledWith('Please select at least one thread.');
    });

    it('returns early when confirm is cancelled', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set([1]);
        confirm.mockReturnValue(false);

        await applyBulkStatusChange();
        expect(ADOAPI.updateThreadStatus).not.toHaveBeenCalled();
    });

    it('iterates selectedThreadIds and calls changeThreadStatus for each', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set([1, 2, 3]);
        globalThis.allThreads = [
            { id: 1, status: 'active' },
            { id: 2, status: 'active' },
            { id: 3, status: 'active' },
        ];
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });

        await applyBulkStatusChange();
        expect(ADOAPI.updateThreadStatus).toHaveBeenCalledTimes(3);
    });

    it('clears selection after completion', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set([1]);
        globalThis.allThreads = [{ id: 1, status: 'active' }];
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });

        await applyBulkStatusChange();
        expect(globalThis.selectedThreadIds.size).toBe(0);
        expect(mockSelectedCount.textContent).toBe(0);
        expect(mockBulkStatusSelect.value).toBe('');
    });

    it('shows success alert when all succeed', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set([1, 2]);
        globalThis.allThreads = [{ id: 1 }, { id: 2 }];
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'fixed', properties: {} });

        await applyBulkStatusChange();
        expect(alert).toHaveBeenCalledWith('Successfully updated 2 thread(s).');
    });

    it('shows partial failure alert when some fail', async () => {
        mockBulkStatusSelect.value = 'fixed';
        globalThis.selectedThreadIds = new Set([1, 2]);
        globalThis.allThreads = [{ id: 1 }, { id: 2 }];
        ADOAPI.updateThreadStatus
            .mockResolvedValueOnce({ status: 'fixed', properties: {} })
            .mockRejectedValueOnce(new Error('fail'));

        await applyBulkStatusChange();
        // Last alert should mention both success and failure counts
        const lastAlertCall = alert.mock.calls[alert.mock.calls.length - 1][0];
        expect(lastAlertCall).toContain('1 thread(s) successfully');
        expect(lastAlertCall).toContain('1 thread(s) failed');
    });

    it('uses human-readable status labels in confirm dialog', async () => {
        mockBulkStatusSelect.value = 'wontFix';
        globalThis.selectedThreadIds = new Set([1]);
        globalThis.allThreads = [{ id: 1 }];
        ADOAPI.updateThreadStatus.mockResolvedValue({ status: 'wontFix', properties: {} });

        await applyBulkStatusChange();
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Won't Fix"));
    });
});
