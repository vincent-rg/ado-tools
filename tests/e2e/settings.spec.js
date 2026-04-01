import { test, expect } from './fixtures/setup.js';
import { testConfig } from './fixtures/mock-responses.js';

test.describe('Settings page', () => {
    test('loads and shows title', async ({ page }) => {
        await page.goto('/ado-settings.html');
        await expect(page).toHaveTitle('Azure DevOps - Settings');
        await expect(page.locator('h1')).toContainText('Azure DevOps Settings');
    });

    test('shows no-settings warning when config is empty', async ({ page }) => {
        await page.goto('/ado-settings.html');
        await expect(page.locator('#currentStatus')).toContainText('No settings found');
    });

    test('form fields are empty when no config set', async ({ page }) => {
        await page.goto('/ado-settings.html');
        await expect(page.locator('#serverUrl')).toHaveValue('');
        await expect(page.locator('#organization')).toHaveValue('');
        await expect(page.locator('#project')).toHaveValue('');
        await expect(page.locator('#repository')).toHaveValue('');
        await expect(page.locator('#pat')).toHaveValue('');
    });

    test('can fill and save settings', async ({ page }) => {
        await page.goto('/ado-settings.html');

        await page.fill('#serverUrl', testConfig.serverUrl);
        await page.fill('#organization', testConfig.organization);
        await page.fill('#project', testConfig.project);
        await page.fill('#repository', testConfig.repository);
        await page.fill('#pat', testConfig.pat);

        await page.click('button[type="submit"]');

        // Verify success message
        await expect(page.locator('#message')).toContainText('Settings saved successfully');

        // Verify status updated
        await expect(page.locator('#currentStatus')).toContainText('Settings configured');
        await expect(page.locator('#currentStatus')).toContainText(testConfig.serverUrl);

        // Verify localStorage was written
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('adoConfig')));
        expect(stored.serverUrl).toBe(testConfig.serverUrl);
        expect(stored.organization).toBe(testConfig.organization);
        expect(stored.project).toBe(testConfig.project);
        expect(stored.repository).toBe(testConfig.repository);
        expect(stored.pat).toBe(testConfig.pat);
    });

    test('loads existing config into form fields', async ({ seedConfig, page }) => {
        await seedConfig(page);
        await page.goto('/ado-settings.html');

        await expect(page.locator('#serverUrl')).toHaveValue(testConfig.serverUrl);
        await expect(page.locator('#organization')).toHaveValue(testConfig.organization);
        await expect(page.locator('#project')).toHaveValue(testConfig.project);
        await expect(page.locator('#repository')).toHaveValue(testConfig.repository);
        await expect(page.locator('#pat')).toHaveValue(testConfig.pat);
    });

    test('shows configured status when config exists', async ({ seedConfig, page }) => {
        await seedConfig(page);
        await page.goto('/ado-settings.html');

        await expect(page.locator('#currentStatus')).toContainText('Settings configured');
        await expect(page.locator('#currentStatus')).toContainText(testConfig.serverUrl);
        await expect(page.locator('#currentStatus')).toContainText(testConfig.organization);
    });

    test('clear settings removes config', async ({ seedConfig, page }) => {
        await seedConfig(page);
        await page.goto('/ado-settings.html');

        // Set up dialog handler to accept the confirm prompt
        page.on('dialog', (dialog) => dialog.accept());

        await page.click('text=Clear All');

        // Verify cleared message
        await expect(page.locator('#message')).toContainText('Settings cleared');

        // Verify status reverted to no-settings
        await expect(page.locator('#currentStatus')).toContainText('No settings found');

        // Verify localStorage was cleared
        const stored = await page.evaluate(() => localStorage.getItem('adoConfig'));
        expect(stored).toBeNull();
    });

    test('PAT help modal opens and closes', async ({ page }) => {
        await page.goto('/ado-settings.html');

        const modal = page.locator('#patHelpModal');
        await expect(modal).not.toHaveClass(/show/);

        await page.click('#patHelpLink');
        await expect(modal).toHaveClass(/show/);

        await page.click('#patHelpModal button:has-text("Close")');
        await expect(modal).not.toHaveClass(/show/);
    });

    test('debug checkboxes persist to localStorage', async ({ page }) => {
        await page.goto('/ado-settings.html');

        await page.check('#debugReply');
        await page.check('#debugStatus');

        const debug = await page.evaluate(() => JSON.parse(localStorage.getItem('adoDebugLog')));
        expect(debug.reply).toBe(true);
        expect(debug.review).toBe(false);
        expect(debug.status).toBe(true);
    });

    test('test connection button with mocked API', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-settings.html');

        await page.click('text=Test Connection');

        await expect(page.locator('#message')).toContainText('Connection successful');
        await expect(page.locator('#message')).toContainText('2 repositories');
    });
});
