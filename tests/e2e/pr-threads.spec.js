import { test, expect } from './fixtures/setup.js';
import { testConfig, singlePR, threads, iterations, iterationChangesWithFiles, fileContentOld, fileContentNew, identitySearchResults } from './fixtures/mock-responses.js';

/**
 * PR Threads page tests.
 *
 * The page requires URL params: ?prId=101&project=TestProject&repo=TestRepo
 * When config is valid and prId is set, it auto-loads via loadPRThreads().
 */

const prURL = `/ado-pr-threads.html?prId=${singlePR.pullRequestId}&project=${testConfig.project}&repo=${testConfig.repository}`;

/** Helper: seed config, mock API, navigate, wait for threads to render */
async function loadThreadsPage(seedConfig, mockADO, page, overrides = {}) {
    await seedConfig(page);
    await mockADO(page, overrides);
    await page.goto(prURL);
    await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });
}

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

test.describe('PR Threads – status chip filtering', () => {
    test('deselecting active chip hides active threads', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Both threads visible initially
        await expect(page.locator('body')).toContainText('Should we add error handling here?');
        await expect(page.locator('body')).toContainText('Typo in variable name');

        // Deselect "Active" chip — thread 1 (active) should hide
        await page.click('.status-chip[data-status="active"]');

        await expect(page.locator('#filteredCount')).toHaveText('1');
        await expect(page.locator('body')).not.toContainText('Should we add error handling here?');
        await expect(page.locator('body')).toContainText('Typo in variable name');
    });

    test('deselecting fixed chip hides resolved threads', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Deselect "Resolved" chip — thread 2 (fixed) should hide
        await page.click('.status-chip[data-status="fixed"]');

        await expect(page.locator('#filteredCount')).toHaveText('1');
        await expect(page.locator('body')).toContainText('Should we add error handling here?');
        await expect(page.locator('body')).not.toContainText('Typo in variable name');
    });

    test('deselecting all status chips shows no threads', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Deselect both active and fixed
        await page.click('.status-chip[data-status="active"]');
        await page.click('.status-chip[data-status="fixed"]');

        await expect(page.locator('#filteredCount')).toHaveText('0');
    });
});

test.describe('PR Threads – search filter', () => {
    test('typing in search filters threads by comment content', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Search for text in thread 1
        await page.fill('#searchFilter', 'error handling');
        await expect(page.locator('#filteredCount')).toHaveText('1');
        await expect(page.locator('body')).toContainText('Should we add error handling here?');
        await expect(page.locator('body')).not.toContainText('Typo in variable name');

        // Clear search — both threads return
        await page.fill('#searchFilter', '');
        await expect(page.locator('#filteredCount')).toHaveText('2');
    });
});

test.describe('PR Threads – show deleted toggle', () => {
    test('checking show deleted reveals deleted threads', async ({ seedConfig, mockADO, page }) => {
        const threadsWithDeleted = {
            value: [
                ...threads.value,
                {
                    id: 3,
                    status: 'closed',
                    threadContext: null,
                    comments: [
                        {
                            id: 1,
                            parentCommentId: 0,
                            content: 'This comment was deleted',
                            commentType: 'text',
                            author: { displayName: 'Charlie', id: 'user-3' },
                            publishedDate: '2024-06-01T09:00:00Z',
                            lastUpdatedDate: '2024-06-01T09:00:00Z',
                        },
                    ],
                    publishedDate: '2024-06-01T09:00:00Z',
                    lastUpdatedDate: '2024-06-01T09:00:00Z',
                    isDeleted: true,
                },
            ],
            count: 3,
        };

        await loadThreadsPage(seedConfig, mockADO, page, { threads: threadsWithDeleted });

        // Deleted thread hidden by default
        await expect(page.locator('#filteredCount')).toHaveText('2');

        // Check show deleted
        await page.check('#showDeleted');
        await expect(page.locator('#filteredCount')).toHaveText('3');

        // Uncheck — hides again
        await page.uncheck('#showDeleted');
        await expect(page.locator('#filteredCount')).toHaveText('2');
    });
});

test.describe('PR Threads – left sidebar', () => {
    test('toggle collapses and expands filter sidebar', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        const sidebar = page.locator('#threadFilters');
        const toggle = page.locator('#leftSidebarToggle');

        // Collapse
        await toggle.click();
        await expect(sidebar).toHaveClass(/sidebar-collapsed/);

        // Expand
        await toggle.click();
        await expect(sidebar).not.toHaveClass(/sidebar-collapsed/);
    });
});

test.describe('PR Threads – tab switching', () => {
    test('switching to Updates tab shows iteration history', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('.view-tab[data-view="updates"]');
        await expect(page.locator('#updatesView')).toBeVisible();
        await expect(page.locator('#overviewView')).toBeHidden();

        // Should show iteration info
        await expect(page.locator('#updatesView')).toContainText(/push|iteration|update/i, { timeout: 5000 });
    });

    test('switching back to Overview from Files shows threads', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Go to Files
        await page.click('.view-tab[data-view="files"]');
        await expect(page.locator('#filesView')).toBeVisible();

        // Back to Overview
        await page.click('.view-tab[data-view="overview"]');
        await expect(page.locator('#overviewView')).toBeVisible();
        await expect(page.locator('#filesView')).toBeHidden();
        await expect(page.locator('body')).toContainText('Should we add error handling here?');
    });
});

test.describe('PR Threads – thread status change', () => {
    test('changing thread status dropdown sends PATCH and updates display', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Intercept PATCH to thread status endpoint
        let patchBody = null;
        await page.route(/threads\/\d+\?/, async (route) => {
            if (route.request().method() === 'PATCH') {
                patchBody = JSON.parse(route.request().postData());
                // Return thread with updated status
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...threads.value[0], status: 'fixed' }),
                });
            } else {
                route.fallback();
            }
        });

        // Find the status select for thread 1 (active) and change to Resolved
        const threadSelect = page.locator('select[onchange*="changeThreadStatus"]').first();
        await threadSelect.selectOption('fixed');

        // Verify PATCH was sent with correct status enum value
        await expect.poll(() => patchBody).toBeTruthy();
        expect(patchBody.status).toBe(2); // 2 = fixed in ADO enum
    });
});

test.describe('PR Threads – reply to thread', () => {
    test('clicking Reply shows reply form', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Click Reply on the first thread
        await page.click('#reply-btn-1');

        // Reply form should appear with textarea and submit button
        await expect(page.locator('#reply-content-1')).toBeVisible();
        await expect(page.locator('#reply-submit-1')).toBeVisible();
    });

    test('submitting reply sends POST to comments endpoint', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Intercept POST to comments endpoint
        let postBody = null;
        await page.route(/threads\/\d+\/comments/, async (route) => {
            if (route.request().method() === 'POST') {
                postBody = JSON.parse(route.request().postData());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: 99,
                        parentCommentId: 0,
                        content: postBody.content,
                        commentType: 1,
                        author: { displayName: 'Alice', id: 'user-1' },
                        publishedDate: '2024-06-03T10:00:00Z',
                        lastUpdatedDate: '2024-06-03T10:00:00Z',
                    }),
                });
            } else {
                route.fallback();
            }
        });

        // Open reply form
        await page.click('#reply-btn-1');
        await page.fill('#reply-content-1', 'Looks good, will fix');
        await page.click('#reply-submit-1');

        // Verify POST was sent
        await expect.poll(() => postBody).toBeTruthy();
        expect(postBody.content).toBe('Looks good, will fix');
    });
});

test.describe('PR Threads – bulk mode', () => {
    test('toggling bulk mode shows checkboxes and actions', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Enable bulk mode
        await page.click('#bulkModeToggle');

        // Bulk actions should be visible
        await expect(page.locator('#bulkActions')).toHaveClass(/show/);

        // Thread checkboxes should appear
        await expect(page.locator('.thread-checkbox').first()).toBeVisible();

        // Disable bulk mode
        await page.click('#bulkModeToggle');
        await expect(page.locator('#bulkActions')).not.toHaveClass(/show/);
    });

    test('selecting threads updates selected count', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('#bulkModeToggle');

        // Select first thread
        await page.check('#thread-checkbox-1');
        await expect(page.locator('#selectedCount')).toHaveText('1');

        // Select second thread
        await page.check('#thread-checkbox-2');
        await expect(page.locator('#selectedCount')).toHaveText('2');

        // Deselect first
        await page.uncheck('#thread-checkbox-1');
        await expect(page.locator('#selectedCount')).toHaveText('1');
    });
});

test.describe('PR Threads – file diff view', () => {
    test('files tab shows changed files from iteration changes', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);

        // Override iteration changes with file data (must be after mockADO for priority)
        await page.route(/iterations\/\d+\/changes/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(iterationChangesWithFiles),
            });
        });

        await page.goto(prURL);
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        // Switch to Files tab
        await page.click('.view-tab[data-view="files"]');
        await expect(page.locator('#filesView')).toBeVisible();

        // File tree should show the changed file
        await expect(page.locator('#filesView')).toContainText('feature.js', { timeout: 10000 });
    });

    test('clicking a file loads diff in the diff panel', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);

        // Override iteration changes (must be after mockADO for priority)
        await page.route(/iterations\/\d+\/changes/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(iterationChangesWithFiles),
            });
        });

        // Route for file content (returns text, not JSON)
        await page.route(/\/items\?/, async (route) => {
            const url = route.request().url();
            const isOldVersion = url.includes('mergebase') || url.includes('target');
            route.fulfill({
                status: 200,
                contentType: 'text/plain',
                body: isOldVersion ? fileContentOld : fileContentNew,
            });
        });

        await page.goto(prURL);
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        // Switch to Files tab and wait for file tree
        await page.click('.view-tab[data-view="files"]');
        await expect(page.locator('#filesView')).toContainText('feature.js', { timeout: 10000 });

        // Click the file name to show diff
        await page.locator('.file-tree-file-name').first().click();

        // Diff panel should render diff content (contains function names from mock data)
        await expect(page.locator('#fileDiffPanel')).toContainText('hello', { timeout: 10000 });
    });
});

test.describe('PR Threads – line stats', () => {
    test('line stats load automatically on page render', async ({ seedConfig, mockADO, page }) => {
        await seedConfig(page);
        await mockADO(page);

        // Override iteration changes with file data
        await page.route(/iterations\/\d+\/changes/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(iterationChangesWithFiles),
            });
        });

        // Route for file content so line diff can be computed
        await page.route(/\/items\?/, async (route) => {
            const url = route.request().url();
            const isOldVersion = url.includes('mergebase') || url.includes('target');
            route.fulfill({
                status: 200,
                contentType: 'text/plain',
                body: isOldVersion ? fileContentOld : fileContentNew,
            });
        });

        await page.goto(prURL);
        await expect(page.locator('body')).toContainText(singlePR.title, { timeout: 10000 });

        // Line stats should compute and display +/- counts (not stay on loading spinner)
        const lineStats = page.locator('#lineStatsContainer');
        await expect(lineStats.locator('[title="Added"]')).toBeVisible({ timeout: 15000 });
        await expect(lineStats.locator('[title="Removed"]')).toBeVisible();
    });
});

test.describe('PR Threads – description editing', () => {
    test('clicking edit shows description textarea', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('#description-edit-btn');

        await expect(page.locator('#edit-description-textarea')).toBeVisible();
        await expect(page.locator('#edit-description-save')).toBeVisible();
        // Textarea should contain the current description
        await expect(page.locator('#edit-description-textarea')).toHaveValue(singlePR.description);
    });

    test('saving description sends PATCH with new content', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Intercept PATCH to PR endpoint for description update
        let patchBody = null;
        await page.route(/pullRequests\/\d+\?/, async (route) => {
            if (route.request().method() === 'PATCH') {
                patchBody = JSON.parse(route.request().postData());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...singlePR, description: patchBody.description }),
                });
            } else {
                route.fallback();
            }
        });

        await page.click('#description-edit-btn');
        await page.fill('#edit-description-textarea', 'Updated description text');
        await page.click('#edit-description-save');

        await expect.poll(() => patchBody).toBeTruthy();
        expect(patchBody.description).toBe('Updated description text');
    });

    test('cancelling edit hides textarea without saving', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('#description-edit-btn');
        await expect(page.locator('#edit-description-textarea')).toBeVisible();

        // Click cancel
        await page.locator('.btn-cancel').click();
        await expect(page.locator('#edit-description-textarea')).toBeHidden();
    });
});

test.describe('PR Threads – reviewer management', () => {
    test('clicking + opens reviewer search input', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Click the add required reviewer button
        await page.locator('.add-reviewer-inline-btn').first().click();

        // Search input should be visible
        const searchDiv = page.locator('#reviewerSearchRequired');
        await expect(searchDiv).toBeVisible();
        await expect(searchDiv.locator('input')).toBeFocused();
    });

    test('typing in search shows identity results', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Mock identity search endpoint
        await page.route(/\/identity-search/, async (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(identitySearchResults),
            });
        });

        // Open search and type
        await page.locator('.add-reviewer-inline-btn').first().click();
        await page.locator('#reviewerSearchRequired input').fill('Charlie');

        // Wait for debounced search results (300ms debounce + network)
        await expect(page.locator('.inline-search-result').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.inline-search-result').first()).toContainText('Charlie');
    });

    test('clicking a search result sends PUT to add reviewer', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Mock identity search
        await page.route(/\/identity-search/, async (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(identitySearchResults),
            });
        });

        // Mock add reviewer PUT
        let putCalled = false;
        await page.route(/reviewers\//, async (route) => {
            if (route.request().method() === 'PUT') {
                putCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'user-3', displayName: 'Charlie', vote: 0, isRequired: true }),
                });
            } else {
                route.fallback();
            }
        });

        // Open search, type, wait for results
        await page.locator('.add-reviewer-inline-btn').first().click();
        await page.locator('#reviewerSearchRequired input').fill('Charlie');
        await expect(page.locator('.inline-search-result').first()).toBeVisible({ timeout: 5000 });

        // Click the result
        await page.locator('.inline-search-result').first().click();

        await expect.poll(() => putCalled).toBe(true);
    });
});

test.describe('PR Threads – PR actions', () => {
    test('mark as draft sends PATCH with isDraft', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        let patchBody = null;
        await page.route(/pullRequests\/\d+\?/, async (route) => {
            if (route.request().method() === 'PATCH') {
                patchBody = JSON.parse(route.request().postData());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...singlePR, isDraft: true }),
                });
            } else {
                route.fallback();
            }
        });

        // Accept the confirmation dialog
        page.on('dialog', dialog => dialog.accept());

        // Select "Mark as Draft" from the action dropdown
        await page.locator('#prStatusActionSelect').selectOption('draft');

        await expect.poll(() => patchBody).toBeTruthy();
        expect(patchBody.isDraft).toBe(true);
    });

    test('abandon sends PATCH with abandoned status', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        let patchBody = null;
        await page.route(/pullRequests\/\d+\?/, async (route) => {
            if (route.request().method() === 'PATCH') {
                patchBody = JSON.parse(route.request().postData());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...singlePR, status: 'abandoned' }),
                });
            } else {
                route.fallback();
            }
        });

        page.on('dialog', dialog => dialog.accept());

        await page.locator('#prStatusActionSelect').selectOption('abandon');

        await expect.poll(() => patchBody).toBeTruthy();
        expect(patchBody.status).toBe('abandoned');
    });

    test('complete shows merge options modal', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Select "Complete" from action dropdown
        await page.locator('#prStatusActionSelect').selectOption('complete');

        // Modal should appear with merge options
        const modal = page.locator('#prActionModal');
        await expect(modal).toHaveClass(/show/, { timeout: 5000 });
        await expect(page.locator('#mergeStrategy')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#deleteSourceBranch')).toBeVisible();
        await expect(page.locator('#mergeCommitMessage')).toBeVisible();
    });

    test('completing PR sends PATCH with merge strategy', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Accept the success alert after completion
        page.on('dialog', dialog => dialog.accept());

        let patchBodies = [];
        await page.route(/pullRequests\/\d+\?/, async (route) => {
            if (route.request().method() === 'PATCH') {
                patchBodies.push(JSON.parse(route.request().postData()));
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...singlePR, status: 'completed' }),
                });
            } else {
                route.fallback();
            }
        });

        // Open complete modal
        await page.locator('#prStatusActionSelect').selectOption('complete');
        await expect(page.locator('#mergeStrategy')).toBeVisible({ timeout: 5000 });

        // Select squash merge
        await page.locator('#mergeStrategy').selectOption('squash');

        // Click Complete button in modal footer
        await page.locator('#prActionModalFooter button.btn-primary').click();

        // Two PATCHes: setCompletionOptions then completePR
        await expect.poll(() => patchBodies.length).toBeGreaterThanOrEqual(2);

        // First PATCH sets completion options
        expect(patchBodies[0].completionOptions.mergeStrategy).toBe('squash');

        // Second PATCH completes the PR
        expect(patchBodies[1].status).toBe('completed');
        expect(patchBodies[1].completionOptions.mergeStrategy).toBe('squash');
    });
});

test.describe('PR Threads – iteration selector', () => {
    test('switching to "By update" mode shows iteration panel', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Switch to Files tab first (iteration selector is in files view)
        await page.click('.view-tab[data-view="files"]');
        await expect(page.locator('#filesView')).toBeVisible();

        // Click "By update" mode button
        await page.locator('.iteration-mode-btn', { hasText: 'By update' }).click();

        // Iteration panel should be visible with iteration rows
        const panel = page.locator('#iterationPanel');
        await expect(panel).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.iteration-row')).toHaveCount(iterations.value.length);
    });

    test('clicking an iteration selects it', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Override iteration changes for the selected range
        await page.route(/iterations\/\d+\/changes/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(iterationChangesWithFiles),
            });
        });

        // Switch to Files tab
        await page.click('.view-tab[data-view="files"]');
        await expect(page.locator('#filesView')).toBeVisible();

        // Switch to "By update" mode
        await page.locator('.iteration-mode-btn', { hasText: 'By update' }).click();
        await expect(page.locator('.iteration-row').first()).toBeVisible({ timeout: 5000 });

        // Click the first iteration
        await page.locator('.iteration-row').first().click();

        // It should be marked as selected (range-edge class)
        await expect(page.locator('.iteration-row').first()).toHaveClass(/range-edge/);
    });

    test('switching back to "vs. Target" mode clears iteration selection', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.route(/iterations\/\d+\/changes/, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(iterationChangesWithFiles),
            });
        });

        // Switch to Files tab and enable "By update" mode
        await page.click('.view-tab[data-view="files"]');
        await page.locator('.iteration-mode-btn', { hasText: 'By update' }).click();
        await expect(page.locator('.iteration-row').first()).toBeVisible({ timeout: 5000 });

        // Switch back to "vs. Target"
        await page.locator('.iteration-mode-btn', { hasText: 'vs. Target' }).click();

        // Iteration rows should no longer have range-edge selection
        await expect(page.locator('.iteration-row.range-edge')).toHaveCount(0);
    });
});

test.describe('PR Threads – new thread creation', () => {
    test('clicking + New Thread shows the creation form', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('#newThreadBtn');

        await expect(page.locator('#newThreadContent')).toBeVisible();
        await expect(page.locator('#createThreadBtn')).toBeVisible();
        // Button should be hidden while form is shown
        await expect(page.locator('#newThreadBtn')).toBeHidden();
    });

    test('submitting new thread sends POST to threads endpoint', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Intercept POST to threads endpoint
        let postBody = null;
        await page.route(/threads\?/, async (route) => {
            if (route.request().method() === 'POST') {
                postBody = JSON.parse(route.request().postData());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: 99,
                        status: 'active',
                        comments: [{
                            id: 1,
                            parentCommentId: 0,
                            content: postBody.comments[0].content,
                            commentType: 1,
                            author: { displayName: 'Alice', id: 'user-1' },
                            publishedDate: '2024-06-03T10:00:00Z',
                            lastUpdatedDate: '2024-06-03T10:00:00Z',
                        }],
                        publishedDate: '2024-06-03T10:00:00Z',
                        lastUpdatedDate: '2024-06-03T10:00:00Z',
                        isDeleted: false,
                    }),
                });
            } else {
                route.fallback();
            }
        });

        // Open form and fill content
        await page.click('#newThreadBtn');
        await page.fill('#newThreadContent', 'This is a new review comment');
        await page.click('#createThreadBtn');

        // Verify POST was sent
        await expect.poll(() => postBody).toBeTruthy();
        expect(postBody.comments[0].content).toBe('This is a new review comment');
        expect(postBody.status).toBe(1); // active
    });

    test('cancelling new thread hides form and shows button', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.click('#newThreadBtn');
        await expect(page.locator('#newThreadContent')).toBeVisible();

        // Click cancel
        await page.locator('#newThreadFormContainer .btn-cancel').click();
        await expect(page.locator('#newThreadContent')).toBeHidden();
        await expect(page.locator('#newThreadBtn')).toBeVisible();
    });
});

test.describe('PR Threads – @mention autocomplete', () => {
    /** Helper: load page and mock identity search, then open reply form on thread 1 */
    async function setupMentionTest(seedConfig, mockADO, page) {
        await loadThreadsPage(seedConfig, mockADO, page);

        // Mock identity search endpoint
        await page.route(/\/identity-search/, async (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(identitySearchResults),
            });
        });

        // Open reply form to get an attached textarea
        await page.click('#reply-btn-1');
        await expect(page.locator('#reply-content-1')).toBeVisible();
    }

    test('typing @ shows "keep typing" hint', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@');

        const dropdown = page.locator('.mention-dropdown.active');
        await expect(dropdown).toBeVisible({ timeout: 3000 });
        await expect(dropdown).toContainText('Keep typing');
    });

    test('typing @Ch triggers search and shows results', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@Ch', { delay: 50 });

        // Wait for debounced search (300ms) + results
        const result = page.locator('.mention-result').first();
        await expect(result).toBeVisible({ timeout: 5000 });
        await expect(result).toContainText('Charlie');
    });

    test('clicking a mention result inserts @DisplayName into textarea', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@Ch', { delay: 50 });

        // Wait for results
        await expect(page.locator('.mention-result').first()).toBeVisible({ timeout: 5000 });

        // Click the first result
        await page.locator('.mention-result').first().click({ force: true });

        // Textarea should contain the inserted mention (format: @<DisplayName>)
        await expect(textarea).toHaveValue(/@<Charlie>/, { timeout: 3000 });
        // Dropdown should close
        await expect(page.locator('.mention-dropdown.active')).toBeHidden();
    });

    test('pressing Enter on selected result inserts mention', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@Ch', { delay: 50 });

        // Wait for results (first is auto-selected)
        await expect(page.locator('.mention-result').first()).toBeVisible({ timeout: 5000 });

        // Press Enter to select
        await textarea.press('Enter');

        await expect(textarea).toHaveValue(/@<Charlie>/, { timeout: 3000 });
        await expect(page.locator('.mention-dropdown.active')).toBeHidden();
    });

    test('pressing Escape closes the dropdown', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@Ch', { delay: 50 });

        await expect(page.locator('.mention-dropdown.active')).toBeVisible({ timeout: 5000 });

        await textarea.press('Escape');
        await expect(page.locator('.mention-dropdown.active')).toBeHidden();
    });

    test('arrow keys navigate between results', async ({ seedConfig, mockADO, page }) => {
        await setupMentionTest(seedConfig, mockADO, page);

        const textarea = page.locator('#reply-content-1');
        await textarea.pressSequentially('@Ch', { delay: 50 });

        // Wait for results (Charlie and Diana)
        await expect(page.locator('.mention-result').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.mention-result')).toHaveCount(2);

        // First result is auto-selected
        await expect(page.locator('.mention-result').first()).toHaveClass(/selected/);

        // Arrow down to select second result
        await textarea.press('ArrowDown');
        await expect(page.locator('.mention-result').nth(1)).toHaveClass(/selected/);
        await expect(page.locator('.mention-result').first()).not.toHaveClass(/selected/);

        // Arrow up back to first
        await textarea.press('ArrowUp');
        await expect(page.locator('.mention-result').first()).toHaveClass(/selected/);
    });

    test('mention autocomplete works in new thread form', async ({ seedConfig, mockADO, page }) => {
        await loadThreadsPage(seedConfig, mockADO, page);

        await page.route(/\/identity-search/, async (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(identitySearchResults),
            });
        });

        // Open new thread form
        await page.click('#newThreadBtn');
        const textarea = page.locator('#newThreadContent');
        await expect(textarea).toBeVisible();

        await textarea.pressSequentially('@Ch', { delay: 50 });

        // Should show mention dropdown with results
        const result = page.locator('.mention-result').first();
        await expect(result).toBeVisible({ timeout: 5000 });
        await expect(result).toContainText('Charlie');
    });
});
