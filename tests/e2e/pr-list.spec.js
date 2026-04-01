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
});
