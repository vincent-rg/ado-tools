import { test, expect } from './fixtures/setup.js';
import { testConfig, pullRequests } from './fixtures/mock-responses.js';

/**
 * Helper: open modal, check first project, load PRs, wait for table.
 */
async function loadPRsViaModal(page) {
    await page.click('#loadButton');
    await expect(page.locator('#loadPRModal')).toHaveClass(/show/);

    // Wait for project tree to be populated
    await expect(page.locator('.project-checkbox').first()).toBeVisible();

    // Expand the first project to reveal repos
    await page.locator('.project-header').first().click();
    await expect(page.locator('.repo-checkbox').first()).toBeVisible();

    // Check the first repo checkbox directly
    await page.locator('.repo-checkbox').first().check();

    // Click Load Pull Requests
    await page.locator('#loadPRModal').locator('button:has-text("Load Pull Requests")').click();

    // Wait for PR table rows to appear
    await expect(page.locator('.pr-table tbody tr').first()).toBeVisible({ timeout: 10000 });
}

test.describe('PR List page', () => {
    test('shows error when no config set', async ({ page }) => {
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeDisabled();
    });

    test('loads and shows title with config set', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page).toHaveTitle(/PR List/);
    });

    test('load button is enabled when config is set', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();
    });

    test('project selection modal opens and shows projects', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');

        // Wait for projects to load in the background
        await expect(page.locator('#loadButton')).toBeEnabled();

        await page.click('#loadButton');
        await expect(page.locator('#loadPRModal')).toHaveClass(/show/);
        await expect(page.locator('#projectTree')).toContainText('TestProject');
    });

    test('can select repo and load PRs', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Default filter shows only "active" PRs (2 of 3 in mock data)
        const activePRs = pullRequests.value.filter(pr => pr.status === 'active');
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(activePRs.length);
    });

    test('PR table shows correct data', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        await expect(page.locator('.pr-table')).toContainText('Add feature X');
        await expect(page.locator('.pr-table')).toContainText('Fix bug in parser');
        await expect(page.locator('.pr-table')).toContainText('101');
        await expect(page.locator('.pr-table')).toContainText('102');
    });

    test('status filter checkboxes are present', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');

        await expect(page.locator('input[value="active"]')).toBeVisible();
        await expect(page.locator('input[value="completed"]')).toBeVisible();
        await expect(page.locator('input[value="abandoned"]')).toBeVisible();
    });

    test('title filter narrows displayed PRs', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Default shows only active PRs (2 of 3)
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Filter by title
        await page.fill('#titleFilter', 'feature');

        // Should show only the matching active PR
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(1);
        await expect(page.locator('.pr-table')).toContainText('Add feature X');
    });

    test('status filter hides completed PRs', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Uncheck "completed" status
        await page.uncheck('input[value="completed"]');

        // Should show only active PRs (2 of 3)
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);
        await expect(page.locator('.pr-table')).not.toContainText('Refactor utils');
    });

    test('sidebar filter inputs are present', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');

        await expect(page.locator('#prIdFilter')).toBeVisible();
        await expect(page.locator('#titleFilter')).toBeVisible();
        await expect(page.locator('#createdByFilter')).toBeVisible();
    });

    test('clicking column header sorts PRs', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Default sort is ID desc — first row should be 102
        const firstRowBefore = page.locator('.pr-table tbody tr').first();
        await expect(firstRowBefore).toContainText('102');

        // Click ID header to toggle to ascending
        await page.click('th[data-column="id"]');

        // Now first row should be 101
        const firstRowAfter = page.locator('.pr-table tbody tr').first();
        await expect(firstRowAfter).toContainText('101');
    });

    test('columns dropdown toggles column visibility', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Verify Repository column is visible
        await expect(page.locator('th[data-column="repository"]')).toBeVisible();

        // Open columns dropdown
        await page.click('.columns-dropdown-btn');
        await expect(page.locator('#columnsDropdownMenu')).toHaveClass(/show/);

        // Uncheck Repository column
        await page.uncheck('#col-vis-repository');

        // Repository column should be hidden
        await expect(page.locator('th[data-column="repository"]')).toHaveCount(0);

        // Re-check Repository column
        await page.click('.columns-dropdown-btn');
        await page.check('#col-vis-repository');
        await expect(page.locator('th[data-column="repository"]')).toBeVisible();
    });

    test('live updates toggle persists state', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');

        // Live updates toggle should be present
        const toggle = page.locator('#liveUpdatesToggle');
        await expect(toggle).toBeVisible();

        // Toggle is active by default
        await expect(toggle).toHaveClass(/active/);

        // Click to disable
        await toggle.click();
        await expect(toggle).not.toHaveClass(/active/);

        // Verify localStorage was updated
        const stored = await page.evaluate(() => localStorage.getItem('prListLiveUpdates'));
        expect(stored).toBe('false');
    });

    test('clear all filters resets filters and shows all active PRs', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();

        await loadPRsViaModal(page);

        // Apply a title filter to narrow results
        await page.fill('#titleFilter', 'feature');
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(1);

        // Click Clear All Filters
        await page.click('.clear-filters');

        // Title filter should be cleared
        await expect(page.locator('#titleFilter')).toHaveValue('');

        // All PRs should be visible (clearFilters unchecks all status boxes = show all)
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(3);
    });
});
