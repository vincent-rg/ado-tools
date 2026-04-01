import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub document so showPRActionModal can execute (it's module-scoped, not overridable)
const mockElements = {};
globalThis.document = {
    getElementById: vi.fn((id) => {
        if (!mockElements[id]) {
            mockElements[id] = { textContent: '', innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } };
        }
        return mockElements[id];
    }),
};

globalThis.PRThreadsUtils = {
    getCompletionBlockers: vi.fn(() => []),
};
globalThis.ChecksFormatter = {
    formatPolicy: vi.fn(),
};
globalThis.ADOUI = {
    getLightningSvg: vi.fn((w, h, cls) => `<svg class="${cls}"></svg>`),
};
globalThis.ADOContent = {
    escapeHtml: vi.fn((s) => s),
};

const { showCompletionBlockedModal } = await import('../js/pr-status-actions.js');

describe('showCompletionBlockedModal', () => {
    beforeEach(() => {
        Object.keys(mockElements).forEach(k => delete mockElements[k]);
        document.getElementById.mockClear();
        ADOContent.escapeHtml.mockImplementation(s => s);
    });

    function getModalBody() {
        return mockElements['prActionModalBody']?.innerHTML || '';
    }

    function getModalTitle() {
        return mockElements['prActionModalTitle']?.textContent || '';
    }

    function getModalFooter() {
        return mockElements['prActionModalFooter']?.innerHTML || '';
    }

    it('sets modal title to "Cannot Complete PR"', () => {
        showCompletionBlockedModal([]);
        expect(getModalTitle()).toBe('Cannot Complete PR');
    });

    it('renders a close button in the footer', () => {
        showCompletionBlockedModal([]);
        const footer = getModalFooter();
        expect(footer).toContain('closePRActionModal()');
        expect(footer).toContain('Close');
    });

    it('renders empty blocker list for empty array', () => {
        showCompletionBlockedModal([]);
        const body = getModalBody();
        expect(body).toContain('blocker-list');
        expect(body).not.toContain('<li');
    });

    it('renders conflict-type blocker with warning icon and blocker-conflict class', () => {
        showCompletionBlockedModal([{ type: 'conflict', message: 'Merge conflicts' }]);
        const body = getModalBody();
        expect(body).toContain('blocker-conflict');
        expect(body).toContain('⚠');
        expect(body).toContain('Merge conflicts');
    });

    it('renders running-status blocker with hourglass icon and blocker-running class', () => {
        showCompletionBlockedModal([{ type: 'policy', status: 'running', message: 'Build in progress' }]);
        const body = getModalBody();
        expect(body).toContain('blocker-running');
        expect(body).toContain('⏳');
        expect(body).toContain('Build in progress');
    });

    it('renders queued-status blocker with hourglass icon and blocker-running class', () => {
        showCompletionBlockedModal([{ type: 'policy', status: 'queued', message: 'Build queued' }]);
        const body = getModalBody();
        expect(body).toContain('blocker-running');
        expect(body).toContain('⏳');
    });

    it('renders policy-type blocker with X icon and blocker-policy class', () => {
        showCompletionBlockedModal([{ type: 'policy', status: 'failed', message: 'Required reviewers' }]);
        const body = getModalBody();
        expect(body).toContain('blocker-policy');
        expect(body).toContain('✗');
        expect(body).toContain('Required reviewers');
    });

    it('renders mixed blocker types correctly', () => {
        showCompletionBlockedModal([
            { type: 'conflict', message: 'Conflicts' },
            { type: 'policy', status: 'running', message: 'CI' },
            { type: 'policy', status: 'failed', message: 'Approval' },
        ]);
        const body = getModalBody();
        expect(body).toContain('blocker-conflict');
        expect(body).toContain('blocker-running');
        expect(body).toContain('blocker-policy');
        expect(body).toContain('Conflicts');
        expect(body).toContain('CI');
        expect(body).toContain('Approval');
    });

    it('escapes HTML in blocker messages', () => {
        ADOContent.escapeHtml.mockImplementation(s => s.replace(/</g, '&lt;'));
        showCompletionBlockedModal([{ type: 'policy', status: 'failed', message: '<script>xss</script>' }]);
        const body = getModalBody();
        expect(body).toContain('&lt;script>xss&lt;/script>');
    });

    it('renders introductory paragraph', () => {
        showCompletionBlockedModal([{ type: 'conflict', message: 'test' }]);
        const body = getModalBody();
        expect(body).toContain('cannot be completed');
    });

    it('defaults to policy class for unknown type/status', () => {
        showCompletionBlockedModal([{ type: 'unknown', status: 'unknown', message: 'Something' }]);
        const body = getModalBody();
        expect(body).toContain('blocker-policy');
        expect(body).toContain('✗');
    });
});
