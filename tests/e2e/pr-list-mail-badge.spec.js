import { test, expect } from './fixtures/setup.js';
import { pullRequests } from './fixtures/mock-responses.js';

/**
 * Helper: open modal, check first project, load PRs, wait for table.
 */
async function loadPRsViaModal(page) {
    await page.click('#loadButton');
    await expect(page.locator('#loadPRModal')).toHaveClass(/show/);
    await expect(page.locator('.project-checkbox').first()).toBeVisible();
    await page.locator('.project-header').first().click();
    await expect(page.locator('.repo-checkbox').first()).toBeVisible();
    await page.locator('.repo-checkbox').first().check();
    await page.locator('#loadPRModal').locator('button:has-text("Load Pull Requests")').click();
    await expect(page.locator('.pr-table tbody tr').first()).toBeVisible({ timeout: 10000 });
}

test.describe('PR List mail badge refresh', () => {
    test('mail badge updates after background poll reloads review timestamps', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);

        // Start with empty review timestamps → thread 1 (by Bob/user-2) is unread
        await mockADO(page, {
            reviewTimestamps: [],
        });

        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();
        await loadPRsViaModal(page);

        // Wait for comment fetching to complete — mail badge should appear on Bob's avatar
        // PR 101 has reviewer Bob (user-2) who started active thread 1.
        // Current user is Alice (user-1, from connectionData), so thread 1 is "unread".
        const pr101Row = page.locator('tr[data-pr-key="TestProject/repo-1/101"]');
        await expect(pr101Row).toBeVisible();
        await expect(pr101Row.locator('.reviewer-mail-badge')).toBeVisible({ timeout: 10000 });

        // Now update the review-timestamps mock to mark thread 1 as reviewed.
        // The comment's publishedDate is '2024-06-01T12:00:00Z' = 1717243200000ms.
        // Set the review timestamp to after that.
        await page.unroute(/\/review-timestamps/);
        await page.route(/\/review-timestamps/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { prId: '101', threadId: 1, timestamp: 1717243300000 },
                ]),
            });
        });

        // Trigger a background poll (instead of waiting 2 minutes)
        await page.evaluate(() => performBackgroundPoll());

        // The mail badge should disappear since the thread is now "reviewed"
        await expect(pr101Row.locator('.reviewer-mail-badge')).toHaveCount(0, { timeout: 10000 });
    });

    test('mail badge updates after manual refresh reloads review timestamps', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);

        // Start with empty review timestamps → unread
        await mockADO(page, {
            reviewTimestamps: [],
        });

        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();
        await loadPRsViaModal(page);

        const pr101Row = page.locator('tr[data-pr-key="TestProject/repo-1/101"]');
        await expect(pr101Row.locator('.reviewer-mail-badge')).toBeVisible({ timeout: 10000 });

        // Update mock to mark as reviewed
        await page.unroute(/\/review-timestamps/);
        await page.route(/\/review-timestamps/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { prId: '101', threadId: 1, timestamp: 1717243300000 },
                ]),
            });
        });

        // Trigger manual refresh
        await page.evaluate(() => refreshPRs());

        // Wait for refresh to complete and comment counts to be re-fetched
        await expect(pr101Row.locator('.reviewer-mail-badge')).toHaveCount(0, { timeout: 10000 });
    });
});
