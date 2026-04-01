import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub globals before importing the module
globalThis.ADOContent = {
    escapeHtml: vi.fn((s) => s),
    processContent: vi.fn((s) => s),
};
globalThis.ADOConfig = { get: vi.fn() };
globalThis.ADOAPI = {
    getPR: vi.fn(),
    getPRThreads: vi.fn(),
    getPRIterations: vi.fn(),
    getPRIterationChanges: vi.fn(),
    getPRWorkItemRefs: vi.fn(),
    getWorkItemsBatch: vi.fn(),
    requeuePolicyEvaluation: vi.fn(),
};
globalThis.ADOUI = {
    renderStatusBadge: vi.fn(),
};
globalThis.ADOIdentity = {
    collectAndResolveFromThreads: vi.fn(),
};
globalThis.ChecksFormatter = {
    fetchPRChecks: vi.fn(),
    getLatestStatuses: vi.fn(() => []),
    formatStatus: vi.fn((s) => ({ name: s.context?.name || 'check', url: s.targetUrl })),
    isBuildPolicy: vi.fn((p) => !!p._isBuild),
    getBuildState: vi.fn((p) => p._buildState || 'succeeded'),
    getBuildStatusSvg: vi.fn(() => '<svg></svg>'),
    formatPolicy: vi.fn((p) => ({ label: p._label || 'Policy', extra: p._extra || '' })),
    getIcon: vi.fn((state) => `[${state}]`),
    getClass: vi.fn((state) => `status-${state}`),
};
globalThis.PRThreadsUtils = {
    isThreadDeleted: vi.fn((t) => !!t.isDeleted),
};

// Globals accessed by the module
globalThis.currentPRId = 42;
globalThis.currentPRData = {};
globalThis.allThreads = [];
globalThis.allIterations = [];
globalThis.allChangeEntries = [];
globalThis.currentFileChangeStats = null;
globalThis.currentConfig = { serverUrl: 'https://dev.azure.com', organization: 'org', project: 'proj', repository: 'repo' };
globalThis.currentView = 'overview';
globalThis.updatesViewBuilt = false;
globalThis.fileDiffCache = new Map();
globalThis.fileTreeBuilt = false;
globalThis.liveUpdatesEnabled = true;
globalThis.selectedIterationStart = null;
globalThis.selectedIterationEnd = null;
globalThis.currentMergeBase = null;
globalThis.prChecksData = null;
globalThis.prWorkItems = null;
globalThis.updateReviewersDisplay = vi.fn();
globalThis.buildThreadsByFilePath = vi.fn();
globalThis.applyThreadFilters = vi.fn();
globalThis.refreshInlineThreadsIfNeeded = vi.fn();
globalThis.buildUpdatesView = vi.fn();
globalThis.buildFileTree = vi.fn();
globalThis.buildIterationSelector = vi.fn();
globalThis.calculateFileChangeStats = vi.fn(() => ({ added: 0, modified: 0, deleted: 0 }));
globalThis.buildCumulativeRenameMaps = vi.fn();
globalThis.fetchLineStatsAsync = vi.fn();
globalThis.updateThreadStats = vi.fn();
globalThis.updateFileStats = vi.fn();

// Mock document and localStorage
globalThis.document = {
    hidden: false,
    getElementById: vi.fn(() => null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
};
globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = vi.fn();
globalThis.localStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
};

const { renderChecksSection, renderWorkItemsSection, computeThreadStatusCounts } =
    await import('../js/pr-live-updates.js');

// --- computeThreadStatusCounts ---

describe('computeThreadStatusCounts', () => {
    const isDeleted = (t) => !!t.isDeleted;

    it('returns empty object for empty array', () => {
        const result = computeThreadStatusCounts([], isDeleted);
        expect(result).toEqual({});
    });

    it('counts active threads', () => {
        const threads = [{ status: 'active' }, { status: 'active' }];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.active).toBe(2);
    });

    it('counts fixed threads', () => {
        const threads = [{ status: 'fixed' }];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.fixed).toBe(1);
    });

    it('counts closed, pending, wontFix threads', () => {
        const threads = [
            { status: 'closed' },
            { status: 'pending' },
            { status: 'wontFix' },
        ];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.closed).toBe(1);
        expect(result.pending).toBe(1);
        expect(result.wontFix).toBe(1);
    });

    it('counts threads with undefined status as noStatus', () => {
        const threads = [{ status: undefined }, {}];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.noStatus).toBe(2);
    });

    it('counts deleted threads via callback', () => {
        const threads = [{ isDeleted: true, status: 'active' }, { isDeleted: true }];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.deleted).toBe(2);
        // Deleted threads should not be counted by status
        expect(result.active).toBeUndefined();
    });

    it('counts mixed statuses correctly', () => {
        const threads = [
            { status: 'active' },
            { status: 'active' },
            { status: 'fixed' },
            { status: 'closed' },
            { isDeleted: true },
            { status: undefined },
        ];
        const result = computeThreadStatusCounts(threads, isDeleted);
        expect(result.active).toBe(2);
        expect(result.fixed).toBe(1);
        expect(result.closed).toBe(1);
        expect(result.deleted).toBe(1);
        expect(result.noStatus).toBe(1);
    });
});

// --- renderWorkItemsSection ---

describe('renderWorkItemsSection', () => {
    const config = { serverUrl: 'https://dev.azure.com', organization: 'org', project: 'proj' };

    beforeEach(() => {
        ADOContent.escapeHtml.mockImplementation(s => s);
    });

    it('returns empty string for null workItems', () => {
        expect(renderWorkItemsSection(null, config)).toBe('');
    });

    it('returns "None" message for empty array', () => {
        const html = renderWorkItemsSection([], config);
        expect(html).toContain('Work Items');
        expect(html).toContain('None');
    });

    it('renders Bug with bug icon', () => {
        const items = [{ id: 1, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'Fix crash' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('🐛');
        expect(html).toContain('Fix crash');
        expect(html).toContain('1'); // work item ID
    });

    it('renders Task with clipboard icon', () => {
        const items = [{ id: 2, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Do thing' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('📋');
    });

    it('renders User Story with book icon', () => {
        const items = [{ id: 3, fields: { 'System.WorkItemType': 'User Story', 'System.Title': 'Story' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('📖');
    });

    it('falls back to pin icon for unknown type', () => {
        const items = [{ id: 4, fields: { 'System.WorkItemType': 'CustomType', 'System.Title': 'Custom' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('📌');
    });

    it('constructs correct URL', () => {
        const items = [{ id: 99, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'Test' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('https://dev.azure.com/org/proj/_workitems/edit/99');
    });

    it('escapes HTML in title', () => {
        ADOContent.escapeHtml.mockImplementation(s => s.replace(/</g, '&lt;'));
        const items = [{ id: 1, fields: { 'System.WorkItemType': 'Bug', 'System.Title': '<b>XSS</b>' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('&lt;b>XSS&lt;/b>');
    });

    it('renders state in title attribute', () => {
        const items = [{ id: 1, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'Test', 'System.State': 'Active' } }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('Active');
    });

    it('renders multiple work items', () => {
        const items = [
            { id: 1, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'Bug 1' } },
            { id: 2, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Task 1' } },
        ];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('Bug 1');
        expect(html).toContain('Task 1');
    });

    it('handles missing fields gracefully', () => {
        const items = [{ id: 5, fields: {} }];
        const html = renderWorkItemsSection(items, config);
        expect(html).toContain('Work Item 5');
        expect(html).toContain('📌'); // unknown type → fallback icon
    });
});

// --- renderChecksSection ---

describe('renderChecksSection', () => {
    const config = { serverUrl: 'https://dev.azure.com', organization: 'org', project: 'proj' };

    beforeEach(() => {
        ADOContent.escapeHtml.mockImplementation(s => s);
        ChecksFormatter.getLatestStatuses.mockReturnValue([]);
        ChecksFormatter.isBuildPolicy.mockImplementation(p => !!p._isBuild);
        ChecksFormatter.getBuildState.mockImplementation(p => p._buildState || 'succeeded');
        ChecksFormatter.getBuildStatusSvg.mockReturnValue('<svg></svg>');
        ChecksFormatter.formatPolicy.mockImplementation(p => ({ label: p._label || 'Policy', extra: p._extra || '' }));
        ChecksFormatter.formatStatus.mockImplementation(s => ({ name: s.context?.name || 'check', url: s.targetUrl }));
        ChecksFormatter.getIcon.mockImplementation(state => `[${state}]`);
        ChecksFormatter.getClass.mockImplementation(state => `status-${state}`);
    });

    it('returns loading HTML when checksData is null', () => {
        const html = renderChecksSection(null, config);
        expect(html).toContain('Loading...');
        expect(html).toContain('Checks');
    });

    it('returns empty string when no sections', () => {
        const checksData = { statuses: [], policies: [], conflicts: [], mergeStatus: 'succeeded' };
        const html = renderChecksSection(checksData, config);
        expect(html).toBe('');
    });

    it('renders merge conflict section with file paths', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [{ conflictPath: '/src/file.js' }],
            mergeStatus: 'conflicts',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Merge Conflicts');
        expect(html).toContain('/src/file.js');
    });

    it('renders "Unable to load" when conflicts array empty', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'conflicts',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Merge Conflicts');
        expect(html).toContain('Unable to load conflict details');
    });

    it('renders rejectedByPolicy merge status', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'rejectedByPolicy',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Rejected by policy');
    });

    it('renders queued merge status', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'queued',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Merge queued');
    });

    it('renders failure merge status', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'failure',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Merge failed');
    });

    it('does not render merge section for succeeded', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'succeeded',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).not.toContain('Merge');
    });

    it('does not render merge section for notSet', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [],
            mergeStatus: 'notSet',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toBe('');
    });

    it('renders status checks sorted: failed, pending, succeeded', () => {
        const statuses = [
            { context: { name: 'CI-success' }, state: 'succeeded', targetUrl: null },
            { context: { name: 'CI-fail' }, state: 'failed', targetUrl: null },
            { context: { name: 'CI-pending' }, state: 'pending', targetUrl: null },
        ];
        ChecksFormatter.getLatestStatuses.mockReturnValue(statuses);

        const checksData = { statuses, policies: [], conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);

        expect(html).toContain('Status Checks');
        // Failed should appear before succeeded in the HTML
        const failIdx = html.indexOf('CI-fail');
        const pendingIdx = html.indexOf('CI-pending');
        const successIdx = html.indexOf('CI-success');
        expect(failIdx).toBeLessThan(pendingIdx);
        expect(pendingIdx).toBeLessThan(successIdx);
    });

    it('renders status check with URL as link', () => {
        const statuses = [{ context: { name: 'CI' }, state: 'succeeded', targetUrl: 'https://ci.example.com/build/1' }];
        ChecksFormatter.getLatestStatuses.mockReturnValue(statuses);
        ChecksFormatter.formatStatus.mockReturnValue({ name: 'CI', url: 'https://ci.example.com/build/1' });

        const checksData = { statuses, policies: [], conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('href="https://ci.example.com/build/1"');
        expect(html).toContain('target="_blank"');
    });

    it('renders status check without URL as text', () => {
        const statuses = [{ context: { name: 'Lint' }, state: 'succeeded', targetUrl: null }];
        ChecksFormatter.getLatestStatuses.mockReturnValue(statuses);
        ChecksFormatter.formatStatus.mockReturnValue({ name: 'Lint', url: null });

        const checksData = { statuses, policies: [], conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Lint');
        expect(html).not.toContain('href');
    });

    it('renders build policies section', () => {
        const policies = [{
            _isBuild: true,
            _buildState: 'succeeded',
            _label: 'Build CI',
            _extra: '',
            status: 'approved',
            context: {},
        }];
        ChecksFormatter.isBuildPolicy.mockImplementation(p => !!p._isBuild);

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Builds');
        expect(html).toContain('Build CI');
    });

    it('renders build policy with buildId as link', () => {
        const policies = [{
            _isBuild: true,
            _buildState: 'succeeded',
            _label: 'CI Pipeline',
            _extra: '',
            status: 'approved',
            context: { buildId: 123 },
        }];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('_build/results?buildId=123');
        expect(html).toContain('href=');
    });

    it('renders queue button for failed/notTriggered builds with evaluationId', () => {
        const policies = [{
            _isBuild: true,
            _buildState: 'failed',
            _label: 'Build',
            _extra: '',
            status: 'rejected',
            evaluationId: 'eval-1',
            context: {},
        }];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('queue-build-btn');
        expect(html).toContain('data-evaluation-id="eval-1"');
        expect(html).toContain('Requeue build');
    });

    it('does not render queue button without evaluationId', () => {
        const policies = [{
            _isBuild: true,
            _buildState: 'failed',
            _label: 'Build',
            _extra: '',
            status: 'rejected',
            context: {},
        }];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).not.toContain('queue-build-btn');
    });

    it('renders non-build policies section sorted: rejected, running, approved', () => {
        const policies = [
            { _isBuild: false, status: 'approved', _label: 'Policy A', _extra: '' },
            { _isBuild: false, status: 'rejected', _label: 'Policy B', _extra: '' },
            { _isBuild: false, status: 'running', _label: 'Policy C', _extra: '' },
        ];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Policies');

        const rejIdx = html.indexOf('Policy B');
        const runIdx = html.indexOf('Policy C');
        const appIdx = html.indexOf('Policy A');
        expect(rejIdx).toBeLessThan(runIdx);
        expect(runIdx).toBeLessThan(appIdx);
    });

    it('renders multiple conflict file paths', () => {
        const checksData = {
            statuses: [], policies: [],
            conflicts: [
                { conflictPath: '/src/a.js' },
                { filePath: '/src/b.js' },
            ],
            mergeStatus: 'conflicts',
        };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('/src/a.js');
        expect(html).toContain('/src/b.js');
    });

    it('renders status check description', () => {
        const statuses = [{ context: { name: 'CI' }, state: 'succeeded', targetUrl: null, description: 'All checks passed' }];
        ChecksFormatter.getLatestStatuses.mockReturnValue(statuses);
        ChecksFormatter.formatStatus.mockReturnValue({ name: 'CI', url: null });

        const checksData = { statuses, policies: [], conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('All checks passed');
    });

    it('renders build policies sorted by state order', () => {
        const policies = [
            { _isBuild: true, _buildState: 'succeeded', _label: 'Build A', _extra: '', status: 'approved', context: {} },
            { _isBuild: true, _buildState: 'failed', _label: 'Build B', _extra: '', status: 'rejected', context: {} },
            { _isBuild: true, _buildState: 'running', _label: 'Build C', _extra: '', status: 'running', context: {} },
        ];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);

        const failIdx = html.indexOf('Build B');
        const runIdx = html.indexOf('Build C');
        const successIdx = html.indexOf('Build A');
        expect(failIdx).toBeLessThan(runIdx);
        expect(runIdx).toBeLessThan(successIdx);
    });

    it('renders notTriggered build with "Queue build" tooltip', () => {
        const policies = [{
            _isBuild: true,
            _buildState: 'notTriggered',
            _label: 'Build',
            _extra: '',
            status: 'queued',
            evaluationId: 'eval-2',
            context: {},
        }];

        const checksData = { statuses: [], policies, conflicts: [], mergeStatus: 'notSet' };
        const html = renderChecksSection(checksData, config);
        expect(html).toContain('Queue build');
    });
});
