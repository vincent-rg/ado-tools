import { test, expect } from './fixtures/setup.js';

test.describe('Index page', () => {
    test('loads and shows title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle('Azure DevOps Tools');
        await expect(page.locator('.hero h1')).toContainText('Azure DevOps Tools');
    });

    test('shows configuration warning when no config set', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#setupWarning')).toContainText('Configuration Required');
    });

    test('shows ready message when config is set', async ({ seedConfig, page }) => {
        await seedConfig(page);
        await page.goto('/');
        await expect(page.locator('#setupWarning')).toContainText('Ready to go');
        await expect(page.locator('#setupWarning')).toContainText('TestOrg');
        await expect(page.locator('#setupWarning')).toContainText('TestProject');
    });

    test('has navigation links to all tools', async ({ page }) => {
        await page.goto('/');
        const settingsLink = page.locator('a[href="ado-settings.html"]').first();
        const prListLink = page.locator('a[href="ado-pr-list.html"]');
        const prThreadsLink = page.locator('a[href="ado-pr-threads.html"]');

        await expect(settingsLink).toBeVisible();
        await expect(prListLink).toBeVisible();
        await expect(prThreadsLink).toBeVisible();
    });

    test('settings link navigates to settings page', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tool-card[href="ado-settings.html"]').click();
        await expect(page).toHaveURL(/ado-settings\.html/);
    });
});
