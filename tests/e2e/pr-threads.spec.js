import { test, expect } from './fixtures/setup.js';
import { testConfig, singlePR, threads, iterations } from './fixtures/mock-responses.js';

/**
 * PR Threads page tests.
 *
 * The page requires URL params: ?prId=101&project=TestProject&repo=TestRepo
 * When config is valid and prId is set, it auto-loads via loadPRThreads().
 */

const prURL = `/ado-pr-threads.html?prId=${singlePR.pullRequestId}&project=${testConfig.project}&repo=${testConfig.repository}`;

test.describe('PR Threads page', () => {
    test('shows error when no prId in URL', async ({ seedConfig, page }) => {
        await seedConfig(page);
        await page.goto('/ado-pr-threads.html');
        // Should show a "no PR" error
        await expect(page.locator('body')).toContainText(/PR ID|no pull request/i);
    });

    test('auto-loads PR data when prId and config are set', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        // Should display PR title
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });
    });

    test('displays thread list in overview', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        // Wait for threads to render
        await expect(page.locator('body')).toContainText('Should we add error handling here?', { timeout: 10000 });
        await expect(page.locator('body')).toContainText('Typo in variable name');
    });

    test('shows thread authors', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        await expect(page.locator('body')).toContainText('Bob', { timeout: 10000 });
        await expect(page.locator('body')).toContainText('Alice');
    });

    test('has view tabs (Overview, Files, Updates)', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        // Wait for page to load
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        await expect(page.locator('.view-tab[data-view="overview"]')).toBeVisible();
        await expect(page.locator('.view-tab[data-view="files"]')).toBeVisible();
        await expect(page.locator('.view-tab[data-view="updates"]')).toBeVisible();
    });

    test('overview tab is active by default', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        const overviewTab = page.locator('.view-tab[data-view="overview"]');
        await expect(overviewTab).toHaveClass(/active/);
    });

    test('can switch to files view', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        await page.click('.view-tab[data-view="files"]');
        // Files view should become visible
        await expect(page.locator('#filesView')).toBeVisible();
    });

    test('status filter chips are present', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        // Status chip filters in the sidebar
        await expect(page.locator('.status-chip[data-status="noStatus"]')).toBeVisible();
    });

    test('shows PR info in sidebar', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        // Should show PR metadata
        await expect(page.locator('body')).toContainText('Alice', { timeout: 10000 });
        await expect(page.locator('body')).toContainText('feature-x');
    });

    test('shows reviewer in sidebar', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });
        // Bob is a reviewer
        await expect(page.locator('body')).toContainText('Bob');
    });

    test('load button is hidden after auto-load', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto(prURL);

        // After auto-load with valid config + prId, the config section (including load button) is hidden
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });
        await expect(page.locator('#loadButton')).toBeHidden();
    });
});
