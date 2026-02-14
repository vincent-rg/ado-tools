import { describe, it, expect } from 'vitest';
import { ChecksFormatter } from '../common.js';

describe('ChecksFormatter', () => {
    describe('getIcon', () => {
        it('returns check mark for succeeded', () => {
            expect(ChecksFormatter.getIcon('succeeded')).toBe('✓');
        });

        it('returns check mark for approved', () => {
            expect(ChecksFormatter.getIcon('approved')).toBe('✓');
        });

        it('returns X for failed', () => {
            expect(ChecksFormatter.getIcon('failed')).toBe('✗');
        });

        it('returns X for rejected', () => {
            expect(ChecksFormatter.getIcon('rejected')).toBe('✗');
        });

        it('returns filled circle for pending', () => {
            expect(ChecksFormatter.getIcon('pending')).toBe('●');
        });

        it('returns empty circle for unknown state', () => {
            expect(ChecksFormatter.getIcon('unknown')).toBe('○');
        });
    });

    describe('getClass', () => {
        it('returns success class for succeeded', () => {
            expect(ChecksFormatter.getClass('succeeded')).toBe('status-indicator-success');
        });

        it('returns error class for failed', () => {
            expect(ChecksFormatter.getClass('failed')).toBe('status-indicator-error');
        });

        it('returns pending class for running', () => {
            expect(ChecksFormatter.getClass('running')).toBe('status-indicator-pending');
        });

        it('returns warning class for unknown', () => {
            expect(ChecksFormatter.getClass('something')).toBe('status-indicator-warning');
        });
    });

    describe('getBuildState', () => {
        it('returns expired when context.isExpired', () => {
            expect(ChecksFormatter.getBuildState({ context: { isExpired: true } })).toBe('expired');
        });

        it('returns succeeded for approved status', () => {
            expect(ChecksFormatter.getBuildState({ status: 'approved', context: {} })).toBe('succeeded');
        });

        it('returns failed for rejected status', () => {
            expect(ChecksFormatter.getBuildState({ status: 'rejected', context: {} })).toBe('failed');
        });

        it('returns running for running status', () => {
            expect(ChecksFormatter.getBuildState({ status: 'running', context: {} })).toBe('running');
        });

        it('returns queued when queued with buildId', () => {
            expect(ChecksFormatter.getBuildState({ status: 'queued', context: { buildId: 123 } })).toBe('queued');
        });

        it('returns notTriggered when queued without buildId', () => {
            expect(ChecksFormatter.getBuildState({ status: 'queued', context: {} })).toBe('notTriggered');
        });
    });

    describe('getBuildStatusSvg', () => {
        it('returns SVG string for succeeded', () => {
            const svg = ChecksFormatter.getBuildStatusSvg('succeeded');
            expect(svg).toContain('<svg');
            expect(svg).toContain('fill="#107c10"');
        });

        it('returns SVG string for failed', () => {
            const svg = ChecksFormatter.getBuildStatusSvg('failed');
            expect(svg).toContain('fill="#d13438"');
        });

        it('falls back to notTriggered for unknown state', () => {
            const svg = ChecksFormatter.getBuildStatusSvg('unknown');
            expect(svg).toContain('fill="#8a8886"');
        });

        it('respects size parameter', () => {
            const svg = ChecksFormatter.getBuildStatusSvg('succeeded', 24);
            expect(svg).toContain('height="24"');
            expect(svg).toContain('width="24"');
        });
    });

    describe('isBuildPolicy', () => {
        it('returns true for build policy', () => {
            expect(ChecksFormatter.isBuildPolicy({
                configuration: { type: { displayName: 'Build' } },
            })).toBe(true);
        });

        it('returns false for other policy types', () => {
            expect(ChecksFormatter.isBuildPolicy({
                configuration: { type: { displayName: 'Status' } },
            })).toBe(false);
        });

        it('returns false when configuration is missing', () => {
            expect(ChecksFormatter.isBuildPolicy({})).toBe(false);
        });
    });

    describe('formatPolicy', () => {
        it('formats build policy with displayName', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Build' },
                    settings: { displayName: 'CI Pipeline' }
                },
                context: {}
            });
            expect(result.label).toBe('Build: CI Pipeline');
        });

        it('formats build policy with buildDefinitionName fallback', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: { type: { displayName: 'Build' }, settings: {} },
                context: { buildDefinitionName: 'Nightly Build' }
            });
            expect(result.label).toBe('Build: Nightly Build');
        });

        it('formats build policy as Unknown build when no name available', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: { type: { displayName: 'Build' }, settings: {} },
                context: {}
            });
            expect(result.label).toBe('Build: Unknown build');
        });

        it('formats status policy with genre', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Status' },
                    settings: { statusName: 'coverage', statusGenre: 'ci' }
                },
                context: {}
            });
            expect(result.label).toBe('Status: coverage (ci)');
        });

        it('formats status policy without genre', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Status' },
                    settings: { statusName: 'lint' }
                },
                context: {}
            });
            expect(result.label).toBe('Status: lint');
        });

        it('formats minimum reviewer policy with count', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Minimum number of reviewers' },
                    settings: { minimumApproverCount: 2 }
                },
                context: {}
            });
            expect(result.label).toBe('Minimum number of reviewers: 2 required');
        });

        it('formats required reviewer policy with name', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Required reviewers' },
                    settings: { displayName: 'Team Lead' }
                },
                context: {}
            });
            expect(result.label).toBe('Required reviewer: Team Lead');
        });

        it('formats work item policy', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Work item linking' },
                    settings: {}
                },
                context: {}
            });
            expect(result.label).toBe('Work item linking');
        });

        it('formats unknown policy type with displayName setting', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {
                    type: { displayName: 'Custom Check' },
                    settings: { displayName: 'My Custom' }
                },
                context: {}
            });
            expect(result.label).toBe('Custom Check: My Custom');
        });

        it('falls back to Policy when type is missing', () => {
            const result = ChecksFormatter.formatPolicy({
                configuration: {},
                context: {}
            });
            expect(result.label).toBe('Policy');
        });
    });

    describe('formatStatus', () => {
        it('formats status with name and genre', () => {
            const result = ChecksFormatter.formatStatus({
                context: { name: 'coverage', genre: 'ci' },
                description: 'Code coverage check',
                targetUrl: 'https://example.com/build/1'
            });
            expect(result.name).toBe('coverage (ci)');
            expect(result.description).toBe('Code coverage check');
            expect(result.url).toBe('https://example.com/build/1');
        });

        it('formats status without genre', () => {
            const result = ChecksFormatter.formatStatus({
                context: { name: 'lint' },
                description: 'Lint check'
            });
            expect(result.name).toBe('lint');
            expect(result.url).toBeNull();
        });

        it('handles missing context', () => {
            const result = ChecksFormatter.formatStatus({});
            expect(result.name).toBe('Unknown check');
            expect(result.description).toBe('');
            expect(result.url).toBeNull();
        });
    });

    describe('getLatestStatuses', () => {
        it('returns empty array for empty input', () => {
            expect(ChecksFormatter.getLatestStatuses([])).toEqual([]);
            expect(ChecksFormatter.getLatestStatuses(null)).toEqual([]);
        });

        it('filters to latest iteration only', () => {
            const statuses = [
                { iterationId: 1, context: { name: 'lint' }, state: 'failed', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 2, context: { name: 'lint' }, state: 'succeeded', creationDate: '2024-01-02T00:00:00Z' }
            ];
            const result = ChecksFormatter.getLatestStatuses(statuses);
            expect(result).toHaveLength(1);
            expect(result[0].state).toBe('succeeded');
            expect(result[0].iterationId).toBe(2);
        });

        it('deduplicates by context name+genre keeping latest creationDate', () => {
            const statuses = [
                { iterationId: 3, context: { name: 'lint', genre: 'ci' }, state: 'failed', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 3, context: { name: 'lint', genre: 'ci' }, state: 'succeeded', creationDate: '2024-01-02T00:00:00Z' }
            ];
            const result = ChecksFormatter.getLatestStatuses(statuses);
            expect(result).toHaveLength(1);
            expect(result[0].state).toBe('succeeded');
        });

        it('keeps different contexts separate', () => {
            const statuses = [
                { iterationId: 1, context: { name: 'lint' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 1, context: { name: 'coverage' }, state: 'failed', creationDate: '2024-01-01T00:00:00Z' }
            ];
            const result = ChecksFormatter.getLatestStatuses(statuses);
            expect(result).toHaveLength(2);
        });

        it('filters out notApplicable statuses', () => {
            const statuses = [
                { iterationId: 1, context: { name: 'lint' }, state: 'notApplicable', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 1, context: { name: 'coverage' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' }
            ];
            const result = ChecksFormatter.getLatestStatuses(statuses);
            expect(result).toHaveLength(1);
            expect(result[0].context.name).toBe('coverage');
        });

        it('handles statuses without iterationId', () => {
            const statuses = [
                { context: { name: 'lint' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' }
            ];
            const result = ChecksFormatter.getLatestStatuses(statuses);
            expect(result).toHaveLength(1);
        });
    });

    describe('countStatuses', () => {
        it('counts statuses by state', () => {
            const statuses = [
                { iterationId: 1, context: { name: 'a' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 1, context: { name: 'b' }, state: 'failed', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 1, context: { name: 'c' }, state: 'error', creationDate: '2024-01-01T00:00:00Z' },
                { iterationId: 1, context: { name: 'd' }, state: 'pending', creationDate: '2024-01-01T00:00:00Z' }
            ];
            const result = ChecksFormatter.countStatuses(statuses);
            expect(result.total).toBe(4);
            expect(result.succeeded).toBe(1);
            expect(result.failed).toBe(2); // failed + error
            expect(result.pending).toBe(1);
        });

        it('counts statuses without state as pending', () => {
            const statuses = [
                { iterationId: 1, context: { name: 'a' }, creationDate: '2024-01-01T00:00:00Z' }
            ];
            const result = ChecksFormatter.countStatuses(statuses);
            expect(result.pending).toBe(1);
        });

        it('returns zeros for empty input', () => {
            const result = ChecksFormatter.countStatuses([]);
            expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, pending: 0 });
        });
    });

    describe('countPolicies', () => {
        const buildPolicy = { configuration: { type: { displayName: 'Build' } }, status: 'approved' };
        const approvedPolicy = { configuration: { type: { displayName: 'Minimum number of reviewers' } }, status: 'approved' };
        const rejectedPolicy = { configuration: { type: { displayName: 'Work item linking' } }, status: 'rejected' };
        const runningPolicy = { configuration: { type: { displayName: 'Status' } }, status: 'running' };
        const queuedPolicy = { configuration: { type: { displayName: 'Required reviewers' } }, status: 'queued' };

        it('excludes build policies from count', () => {
            const result = ChecksFormatter.countPolicies([buildPolicy, approvedPolicy]);
            expect(result.total).toBe(1);
        });

        it('counts non-build policies by status', () => {
            const result = ChecksFormatter.countPolicies([approvedPolicy, rejectedPolicy, runningPolicy, queuedPolicy]);
            expect(result.total).toBe(4);
            expect(result.approved).toBe(1);
            expect(result.rejected).toBe(1);
            expect(result.running).toBe(2); // running + queued
        });

        it('returns zeros for empty input', () => {
            const result = ChecksFormatter.countPolicies([]);
            expect(result).toEqual({ total: 0, approved: 0, rejected: 0, running: 0 });
        });
    });

    describe('countBuildPolicies', () => {
        it('counts only build policies by state', () => {
            const policies = [
                { configuration: { type: { displayName: 'Build' } }, status: 'approved', context: {} },
                { configuration: { type: { displayName: 'Build' } }, status: 'rejected', context: {} },
                { configuration: { type: { displayName: 'Build' } }, status: 'running', context: {} },
                { configuration: { type: { displayName: 'Build' } }, status: 'queued', context: { buildId: 1 } },
                { configuration: { type: { displayName: 'Build' } }, status: 'queued', context: {} },
                { configuration: { type: { displayName: 'Status' } }, status: 'approved', context: {} }
            ];
            const result = ChecksFormatter.countBuildPolicies(policies);
            expect(result.total).toBe(5); // excludes the Status policy
            expect(result.succeeded).toBe(1);
            expect(result.failed).toBe(1);
            expect(result.running).toBe(1);
            expect(result.queued).toBe(1);
            expect(result.notTriggered).toBe(1);
        });

        it('returns zeros for no build policies', () => {
            const result = ChecksFormatter.countBuildPolicies([]);
            expect(result).toEqual({
                total: 0, notTriggered: 0, expired: 0,
                queued: 0, running: 0, succeeded: 0, failed: 0
            });
        });
    });

    describe('buildTooltip', () => {
        it('returns empty string for empty data', () => {
            expect(ChecksFormatter.buildTooltip({})).toBe('');
        });

        it('shows merge conflicts with file paths', () => {
            const tooltip = ChecksFormatter.buildTooltip({
                mergeStatus: 'conflicts',
                conflicts: [
                    { conflictPath: '/src/file1.js' },
                    { filePath: '/src/file2.js' }
                ]
            });
            expect(tooltip).toContain('Merge Conflicts');
            expect(tooltip).toContain('/src/file1.js');
            expect(tooltip).toContain('/src/file2.js');
        });

        it('truncates conflicts list after 5', () => {
            const conflicts = Array.from({ length: 8 }, (_, i) => ({ conflictPath: `/src/file${i}.js` }));
            const tooltip = ChecksFormatter.buildTooltip({ mergeStatus: 'conflicts', conflicts });
            expect(tooltip).toContain('and 3 more');
        });

        it('shows non-conflict merge status', () => {
            const tooltip = ChecksFormatter.buildTooltip({ mergeStatus: 'failure' });
            expect(tooltip).toContain('Merge failed');
        });

        it('does not show merge status for succeeded or notSet', () => {
            expect(ChecksFormatter.buildTooltip({ mergeStatus: 'succeeded' })).toBe('');
            expect(ChecksFormatter.buildTooltip({ mergeStatus: 'notSet' })).toBe('');
        });

        it('shows status checks section', () => {
            const tooltip = ChecksFormatter.buildTooltip({
                statuses: [
                    { iterationId: 1, context: { name: 'lint' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' },
                    { iterationId: 1, context: { name: 'coverage' }, state: 'failed', creationDate: '2024-01-01T00:00:00Z' }
                ]
            });
            expect(tooltip).toContain('Status Checks');
            expect(tooltip).toContain('lint');
            expect(tooltip).toContain('coverage');
            // Failed should appear before succeeded
            const lintPos = tooltip.indexOf('lint');
            const coveragePos = tooltip.indexOf('coverage');
            expect(coveragePos).toBeLessThan(lintPos);
        });

        it('shows build policies section', () => {
            const tooltip = ChecksFormatter.buildTooltip({
                policies: [
                    { configuration: { type: { displayName: 'Build' }, settings: { displayName: 'CI' } }, status: 'approved', context: {} },
                    { configuration: { type: { displayName: 'Build' }, settings: { displayName: 'Deploy' } }, status: 'rejected', context: {} }
                ]
            });
            expect(tooltip).toContain('Builds');
            expect(tooltip).toContain('CI');
            expect(tooltip).toContain('Deploy');
            // Failed should appear before succeeded
            const ciPos = tooltip.indexOf('CI');
            const deployPos = tooltip.indexOf('Deploy');
            expect(deployPos).toBeLessThan(ciPos);
        });

        it('shows non-build policies section', () => {
            const tooltip = ChecksFormatter.buildTooltip({
                policies: [
                    { configuration: { type: { displayName: 'Minimum number of reviewers' }, settings: { minimumApproverCount: 2 } }, status: 'rejected', context: {} }
                ]
            });
            expect(tooltip).toContain('Policies');
            expect(tooltip).toContain('2 required');
        });

        it('combines all sections', () => {
            const tooltip = ChecksFormatter.buildTooltip({
                mergeStatus: 'conflicts',
                conflicts: [{ conflictPath: '/src/a.js' }],
                statuses: [
                    { iterationId: 1, context: { name: 'lint' }, state: 'succeeded', creationDate: '2024-01-01T00:00:00Z' }
                ],
                policies: [
                    { configuration: { type: { displayName: 'Build' }, settings: { displayName: 'CI' } }, status: 'approved', context: {} },
                    { configuration: { type: { displayName: 'Work item linking' }, settings: {} }, status: 'rejected', context: {} }
                ]
            });
            expect(tooltip).toContain('Merge Conflicts');
            expect(tooltip).toContain('Status Checks');
            expect(tooltip).toContain('Builds');
            expect(tooltip).toContain('Policies');
        });
    });
});
