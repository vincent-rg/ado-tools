import { describe, it, expect } from 'vitest';
import { ADOUI } from '../common.js';

describe('ADOUI', () => {
    describe('formatDate', () => {
        it('formats a valid ISO date string', () => {
            const result = ADOUI.formatDate('2024-06-15T10:30:00Z');
            // Result depends on locale, but should contain the date components
            expect(result).toBeTruthy();
            expect(result).toContain('2024');
        });

        it('returns Invalid Date for garbage input', () => {
            expect(ADOUI.formatDate('not-a-date')).toBe('Invalid Date');
        });
    });

    describe('getStatusBadgeClass', () => {
        it('returns badge-active for active', () => {
            expect(ADOUI.getStatusBadgeClass('active')).toBe('badge-active');
        });

        it('returns badge-fixed for fixed', () => {
            expect(ADOUI.getStatusBadgeClass('fixed')).toBe('badge-fixed');
        });

        it('returns badge-closed for closed', () => {
            expect(ADOUI.getStatusBadgeClass('closed')).toBe('badge-closed');
        });

        it('returns badge-completed for completed', () => {
            expect(ADOUI.getStatusBadgeClass('completed')).toBe('badge-completed');
        });

        it('returns badge-abandoned for abandoned', () => {
            expect(ADOUI.getStatusBadgeClass('abandoned')).toBe('badge-abandoned');
        });

        it('is case-insensitive', () => {
            expect(ADOUI.getStatusBadgeClass('Active')).toBe('badge-active');
            expect(ADOUI.getStatusBadgeClass('COMPLETED')).toBe('badge-completed');
        });

        it('returns badge-closed for unknown status', () => {
            expect(ADOUI.getStatusBadgeClass('something')).toBe('badge-closed');
        });

        it('returns badge-deleted when isDeleted is true', () => {
            expect(ADOUI.getStatusBadgeClass('active', true)).toBe('badge-deleted');
        });

        it('returns badge-deleted regardless of status when isDeleted', () => {
            expect(ADOUI.getStatusBadgeClass('completed', true)).toBe('badge-deleted');
        });

        it('handles null status', () => {
            expect(ADOUI.getStatusBadgeClass(null)).toBe('badge-closed');
        });
    });

    describe('getStatusText', () => {
        it('returns Active for active', () => {
            expect(ADOUI.getStatusText('active')).toBe('Active');
        });

        it('returns Resolved for fixed', () => {
            expect(ADOUI.getStatusText('fixed')).toBe('Resolved');
        });

        it('returns Closed for closed', () => {
            expect(ADOUI.getStatusText('closed')).toBe('Closed');
        });

        it("returns Won't Fix for wontFix", () => {
            expect(ADOUI.getStatusText('wontFix')).toBe("Won't Fix");
        });

        it('returns Pending for pending', () => {
            expect(ADOUI.getStatusText('pending')).toBe('Pending');
        });

        it('returns Completed for completed', () => {
            expect(ADOUI.getStatusText('completed')).toBe('Completed');
        });

        it('returns Abandoned for abandoned', () => {
            expect(ADOUI.getStatusText('abandoned')).toBe('Abandoned');
        });

        it('returns Unknown for unknown status', () => {
            expect(ADOUI.getStatusText('something')).toBe('Unknown');
        });

        it('returns Deleted when isDeleted is true', () => {
            expect(ADOUI.getStatusText('active', true)).toBe('Deleted');
        });

        it('returns Deleted regardless of status when isDeleted', () => {
            expect(ADOUI.getStatusText('completed', true)).toBe('Deleted');
        });
    });

    describe('getLightningSvg', () => {
        it('returns SVG with default dimensions', () => {
            const svg = ADOUI.getLightningSvg();
            expect(svg).toContain('<svg');
            expect(svg).toContain('width="16"');
            expect(svg).toContain('height="18"');
            expect(svg).toContain('<path');
        });

        it('respects custom dimensions', () => {
            const svg = ADOUI.getLightningSvg(24, 28);
            expect(svg).toContain('width="24"');
            expect(svg).toContain('height="28"');
        });

        it('adds class attribute when className provided', () => {
            const svg = ADOUI.getLightningSvg(16, 18, 'my-icon');
            expect(svg).toContain('class="my-icon"');
        });

        it('omits class attribute when no className', () => {
            const svg = ADOUI.getLightningSvg(16, 18, '');
            expect(svg).not.toContain('class=');
        });
    });

    describe('getAutoCompleteIcon', () => {
        it('returns empty string when no autoCompleteSetBy', () => {
            expect(ADOUI.getAutoCompleteIcon({})).toBe('');
        });

        it('returns empty string for null prData', () => {
            expect(ADOUI.getAutoCompleteIcon(null)).toBe('');
        });

        it('returns SVG when autoCompleteSetBy is set', () => {
            const result = ADOUI.getAutoCompleteIcon({ autoCompleteSetBy: { id: 'user1' } });
            expect(result).toContain('<svg');
            expect(result).toContain('auto-complete-icon');
        });
    });

    describe('renderStatusBadge', () => {
        it('renders basic status badge', () => {
            const html = ADOUI.renderStatusBadge('active');
            expect(html).toContain('badge-active');
            expect(html).toContain('Active');
        });

        it('includes auto-complete icon when set', () => {
            const html = ADOUI.renderStatusBadge('active', { autoCompleteSetBy: { id: 'u1' } });
            expect(html).toContain('auto-complete-icon');
            expect(html).toContain('<svg');
        });

        it('does not include auto-complete icon when not set', () => {
            const html = ADOUI.renderStatusBadge('active', {});
            expect(html).not.toContain('auto-complete-icon');
        });

        it('includes draft badge when isDraft', () => {
            const html = ADOUI.renderStatusBadge('active', { isDraft: true });
            expect(html).toContain('badge-draft');
            expect(html).toContain('Draft');
        });

        it('does not include draft badge when not draft', () => {
            const html = ADOUI.renderStatusBadge('active', { isDraft: false });
            expect(html).not.toContain('badge-draft');
        });

        it('combines auto-complete and draft', () => {
            const html = ADOUI.renderStatusBadge('active', {
                autoCompleteSetBy: { id: 'u1' },
                isDraft: true
            });
            expect(html).toContain('auto-complete-icon');
            expect(html).toContain('badge-draft');
        });

        it('renders completed status', () => {
            const html = ADOUI.renderStatusBadge('completed');
            expect(html).toContain('badge-completed');
            expect(html).toContain('Completed');
        });

        it('renders abandoned status', () => {
            const html = ADOUI.renderStatusBadge('abandoned');
            expect(html).toContain('badge-abandoned');
            expect(html).toContain('Abandoned');
        });
    });
});
