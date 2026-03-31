import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing the module
globalThis.PRThreadsUtils = {
    getCompletionBlockers: vi.fn(() => []),
};
globalThis.ChecksFormatter = {
    formatPolicy: vi.fn(),
};
globalThis.ADOUI = {
    getLightningSvg: vi.fn((w, h, cls) => `<svg class="${cls}"></svg>`),
};

const { renderPRStatusActions, renderAutoCompleteButton, getCompletionBlockers } = await import('../js/pr-status-actions.js');

describe('renderPRStatusActions', () => {
    it('returns empty string for null prData', () => {
        expect(renderPRStatusActions(null)).toBe('');
    });

    it('returns empty string for completed PR', () => {
        expect(renderPRStatusActions({ status: 'completed' })).toBe('');
    });

    it('shows draft/abandon/complete for active non-draft PR', () => {
        const html = renderPRStatusActions({ status: 'active', isDraft: false });
        expect(html).toContain('Mark as Draft');
        expect(html).toContain('Abandon');
        expect(html).toContain('Complete');
        expect(html).not.toContain('Publish');
    });

    it('shows publish/abandon/complete for active draft PR', () => {
        const html = renderPRStatusActions({ status: 'active', isDraft: true });
        expect(html).toContain('Publish (Remove Draft)');
        expect(html).toContain('Abandon');
        expect(html).toContain('Complete');
        expect(html).not.toContain('Mark as Draft');
    });

    it('shows only reactivate for abandoned PR', () => {
        const html = renderPRStatusActions({ status: 'abandoned' });
        expect(html).toContain('Reactivate');
        expect(html).not.toContain('Abandon');
        expect(html).not.toContain('Complete');
    });

    it('renders a select element with "Set to" default option', () => {
        const html = renderPRStatusActions({ status: 'active', isDraft: false });
        expect(html).toContain('<select');
        expect(html).toContain('Set to');
    });
});

describe('renderAutoCompleteButton', () => {
    it('returns empty string for null prData', () => {
        expect(renderAutoCompleteButton(null)).toBe('');
    });

    it('returns empty string for draft PR', () => {
        expect(renderAutoCompleteButton({ status: 'active', isDraft: true })).toBe('');
    });

    it('returns empty string for abandoned PR', () => {
        expect(renderAutoCompleteButton({ status: 'abandoned', isDraft: false })).toBe('');
    });

    it('returns empty string for completed PR', () => {
        expect(renderAutoCompleteButton({ status: 'completed', isDraft: false })).toBe('');
    });

    it('shows "Set Auto-Complete" when not set', () => {
        const html = renderAutoCompleteButton({ status: 'active', isDraft: false, autoCompleteSetBy: null });
        expect(html).toContain('Set Auto-Complete');
        expect(html).toContain('auto-complete-btn');
        expect(html).not.toContain('active');
    });

    it('shows "Remove Auto-Complete" when set', () => {
        const html = renderAutoCompleteButton({ status: 'active', isDraft: false, autoCompleteSetBy: { id: 'user1' } });
        expect(html).toContain('Remove Auto-Complete');
        expect(html).toContain('auto-complete-btn active');
    });
});

describe('getCompletionBlockers', () => {
    beforeEach(() => {
        PRThreadsUtils.getCompletionBlockers.mockClear();
    });

    it('delegates to PRThreadsUtils.getCompletionBlockers', () => {
        const checksData = { policies: [] };
        const prData = { status: 'active' };
        PRThreadsUtils.getCompletionBlockers.mockReturnValue([{ message: 'blocked' }]);

        const result = getCompletionBlockers(checksData, prData);

        expect(PRThreadsUtils.getCompletionBlockers).toHaveBeenCalledWith(
            checksData, prData, { formatPolicy: expect.any(Function) }
        );
        expect(result).toEqual([{ message: 'blocked' }]);
    });
});
