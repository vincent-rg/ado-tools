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
    });
});
