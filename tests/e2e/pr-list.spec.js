import { test, expect } from './fixtures/setup.js';
import { testConfig, pullRequests } from './fixtures/mock-responses.js';

const PR_LIST_ROUTE = /_apis\/git\/repositories\/[^/]+\/pullRequests\?/;

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

// --- Helpers for polling tests ---

const basePR = pullRequests.value[1]; // PR 102

function makePR(overrides) {
    return { ...basePR, ...overrides };
}

function newActivePR(id, title) {
    return {
        pullRequestId: id,
        title,
        status: 'active',
        createdBy: { displayName: 'Diana', id: 'user-4', uniqueName: 'diana@example.com' },
        creationDate: '2024-06-03T10:00:00Z',
        sourceRefName: 'refs/heads/new-feature',
        targetRefName: 'refs/heads/main',
        reviewers: [],
        repository: { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
        isDraft: false,
    };
}

function buildPRResponse(prs) {
    return { value: prs, count: prs.length };
}

async function swapPRRoute(page, newResponse) {
    await page.unroute(PR_LIST_ROUTE);
    await page.route(PR_LIST_ROUTE, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(newResponse),
        })
    );
}

const changesButton = 'button:has-text("Show PR changes")';

test.describe('PR list background polling', () => {
    test.beforeEach(async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);
        await page.goto('/ado-pr-list.html');
        await expect(page.locator('#loadButton')).toBeEnabled();
        await loadPRsViaModal(page);
    });

    test('status change to filtered-out status grays out row and shows button', async ({ page }) => {
        // Default: "active" filter, PRs 101 and 102 visible
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll returns PR 102 as abandoned
        const pr102Abandoned = makePR({ status: 'abandoned' });
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Abandoned, pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        // PR 102 row should be grayed out but still visible
        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102).toBeVisible();
        await expect(row102).toHaveClass(/grayed-out/);
        await expect(row102).toContainText('no longer matches filters');

        // Button should appear
        await expect(page.locator(changesButton)).toBeVisible();
        await expect(page.locator(changesButton)).toContainText('1');

        // Click button → PR 102 disappears
        await page.click(changesButton);
        await expect(row102).not.toBeVisible();
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(1);
    });

    test('previously filtered-out PR becoming matching shows button instead of silently appearing', async ({ page }) => {
        // Default: "active" filter, PRs 101 and 102 visible, PR 103 (completed) hidden
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);
        await expect(page.locator('tr[data-pr-key*="103"]')).not.toBeVisible();

        // Poll returns PR 103 reactivated (completed → active)
        const pr103Reactivated = { ...pullRequests.value[2], status: 'active' };
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pullRequests.value[1], pr103Reactivated]));
        await page.evaluate(() => performBackgroundPoll());

        // Button should appear — PR 103 should NOT silently appear
        await expect(page.locator(changesButton)).toBeVisible();
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Click button → PR 103 appears
        await page.click(changesButton);
        await expect(page.locator('tr[data-pr-key*="103"]')).toBeVisible();
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(3);
    });

    test('new PR detected during poll shows button', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll returns a new active PR 104
        const pr104 = newActivePR(104, 'New active PR');
        await swapPRRoute(page, buildPRResponse([...pullRequests.value, pr104]));
        await page.evaluate(() => performBackgroundPoll());

        // Button should appear
        await expect(page.locator(changesButton)).toBeVisible();

        // PR 104 should NOT be in the table yet
        await expect(page.locator('tr[data-pr-key*="104"]')).not.toBeVisible();

        // Click button → PR 104 appears
        await page.click(changesButton);
        await expect(page.locator('tr[data-pr-key*="104"]')).toBeVisible();
    });

    test('in-place update for title change without button', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll returns PR 102 with changed title
        const pr102Updated = makePR({ title: 'Fix bug in parser v2' });
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Updated, pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        // No button should appear
        await expect(page.locator(changesButton)).not.toBeVisible();

        // Row should show new title
        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102).toContainText('Fix bug in parser v2');
    });

    test('PR removed from API response grays out and shows button', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll returns only PR 101 (PR 102 gone)
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        // PR 102 row should be grayed out
        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102).toBeVisible();
        await expect(row102).toHaveClass(/grayed-out/);

        // Button should appear
        await expect(page.locator(changesButton)).toBeVisible();

        // Click button → PR 102 disappears
        await page.click(changesButton);
        await expect(row102).not.toBeVisible();
    });

    test('multiple simultaneous changes in one poll', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll: PR 102 abandoned + new PR 104
        const pr102Abandoned = makePR({ status: 'abandoned' });
        const pr104 = newActivePR(104, 'Brand new PR');
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Abandoned, pullRequests.value[2], pr104]));
        await page.evaluate(() => performBackgroundPoll());

        // Button should show count of 2
        await expect(page.locator(changesButton)).toBeVisible();
        await expect(page.locator(changesButton)).toContainText('2');

        // PR 102 grayed out, PR 104 not yet visible
        await expect(page.locator('tr[data-pr-key*="102"]')).toHaveClass(/grayed-out/);
        await expect(page.locator('tr[data-pr-key*="104"]')).not.toBeVisible();

        // Click button → PR 102 gone, PR 104 appears
        await page.click(changesButton);
        await expect(page.locator('tr[data-pr-key*="102"]')).not.toBeVisible();
        await expect(page.locator('tr[data-pr-key*="104"]')).toBeVisible();
    });

    test('consecutive polls accumulate changes', async ({ page }) => {
        // First poll: new PR 104
        const pr104 = newActivePR(104, 'First new PR');
        await swapPRRoute(page, buildPRResponse([...pullRequests.value, pr104]));
        await page.evaluate(() => performBackgroundPoll());

        await expect(page.locator(changesButton)).toContainText('1');

        // Second poll: PR 104 + PR 105
        const pr105 = newActivePR(105, 'Second new PR');
        await swapPRRoute(page, buildPRResponse([...pullRequests.value, pr104, pr105]));
        await page.evaluate(() => performBackgroundPoll());

        await expect(page.locator(changesButton)).toContainText('2');
    });

    test('show PR changes button clears all pending state', async ({ page }) => {
        // PR 102 abandoned + new PR 104
        const pr102Abandoned = makePR({ status: 'abandoned' });
        const pr104 = newActivePR(104, 'Incoming PR');
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Abandoned, pullRequests.value[2], pr104]));
        await page.evaluate(() => performBackgroundPoll());

        await expect(page.locator(changesButton)).toContainText('2');

        // Click the button
        await page.click(changesButton);

        // Button should disappear
        await expect(page.locator(changesButton)).not.toBeVisible();

        // No grayed-out rows
        await expect(page.locator('tr.grayed-out')).toHaveCount(0);

        // PR 102 gone (abandoned, no longer matches active filter), PR 104 visible
        await expect(page.locator('tr[data-pr-key*="102"]')).not.toBeVisible();
        await expect(page.locator('tr[data-pr-key*="104"]')).toBeVisible();
    });

    test('draft toggle detected as in-place update', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // Poll returns PR 102 as draft (still active)
        const pr102Draft = makePR({ isDraft: true });
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Draft, pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        // No button (PR still matches active filter)
        await expect(page.locator(changesButton)).not.toBeVisible();

        // Draft badge should appear
        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102.locator('.badge-draft')).toBeVisible();
    });

    test('status reverted back un-grays row and removes button', async ({ page }) => {
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);

        // First poll: PR 102 abandoned → grayed out
        const pr102Abandoned = makePR({ status: 'abandoned' });
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Abandoned, pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102).toHaveClass(/grayed-out/);
        await expect(page.locator(changesButton)).toBeVisible();

        // Second poll: PR 102 back to active
        await swapPRRoute(page, buildPRResponse(pullRequests.value));
        await page.evaluate(() => performBackgroundPoll());

        // Row should no longer be grayed out
        await expect(row102).not.toHaveClass(/grayed-out/);
        await expect(row102).not.toContainText('no longer matches filters');

        // Button should disappear (no pending changes left)
        await expect(page.locator(changesButton)).not.toBeVisible();

        // Still 2 rows visible
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(2);
    });

    test('status change with no filter active updates row in place', async ({ page }) => {
        // Uncheck all status filters (show all PRs)
        await page.uncheck('input[value="active"]');
        await expect(page.locator('.pr-table tbody tr')).toHaveCount(3);

        // Poll returns PR 102 as abandoned
        const pr102Abandoned = makePR({ status: 'abandoned' });
        await swapPRRoute(page, buildPRResponse([pullRequests.value[0], pr102Abandoned, pullRequests.value[2]]));
        await page.evaluate(() => performBackgroundPoll());

        // No button (no status filter active, PR still visible)
        await expect(page.locator(changesButton)).not.toBeVisible();

        // Row should show updated status badge
        const row102 = page.locator('tr[data-pr-key*="102"]');
        await expect(row102.locator('.badge').first()).toContainText(/abandoned/i);
    });
});
