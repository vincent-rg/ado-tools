import { test as base } from '@playwright/test';
import * as mocks from './mock-responses.js';

const { testConfig } = mocks;

/**
 * Escape string for use in a RegExp.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extended Playwright test with ADO-specific fixtures.
 *
 * - `seedConfig`: seeds localStorage with a valid adoConfig before navigation
 * - `mockADO`: sets up page.route() interceptors for common ADO API endpoints
 */
export const test = base.extend({
    /**
     * Seeds localStorage with test config. Call before navigating to any page.
     * Usage: await seedConfig(page);
     */
    seedConfig: async ({}, use) => {
        const seed = async (page) => {
            await page.goto('/');
            await page.evaluate((config) => {
                localStorage.setItem('adoConfig', JSON.stringify(config));
            }, testConfig);
        };
        await use(seed);
    },

    /**
     * Registers page.route() handlers for ADO API endpoints using regex patterns.
     * Pass a map of endpoint keys to response objects to override defaults.
     */
    mockADO: async ({}, use) => {
        const setup = async (page, overrides = {}) => {
            const base = escapeRegex(`${testConfig.serverUrl}/${testConfig.organization}`);

            // Using regex for precise URL matching.
            // Order matters: more specific patterns must come first.
            const routes = [
                // Projects list
                {
                    pattern: new RegExp(`${base}/_apis/projects`),
                    response: overrides.projects ?? mocks.projects,
                },
                // Connection data
                {
                    pattern: new RegExp(`${base}/_apis/connectionData`),
                    response: overrides.connectionData ?? mocks.connectionData,
                },
                // Repositories list (ends at /repositories with no further path)
                {
                    pattern: new RegExp(`${base}/.+/_apis/git/repositories\\?`),
                    response: overrides.repositories ?? mocks.repositories,
                },
                // Thread sub-resources on a PR
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/threads`),
                    response: overrides.threads ?? mocks.threads,
                },
                // Iteration changes (must be before iterations)
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/iterations/\\d+/changes`),
                    response: overrides.iterationChanges ?? mocks.emptyResponse,
                },
                // Iterations
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/iterations`),
                    response: overrides.iterations ?? mocks.iterations,
                },
                // Statuses
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/statuses`),
                    response: overrides.statuses ?? mocks.prStatuses,
                },
                // Commits
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/commits`),
                    response: overrides.commits ?? mocks.prCommits,
                },
                // Work items
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/workitems`),
                    response: overrides.workitems ?? mocks.workItemRefs,
                },
                // Conflicts
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+/conflicts`),
                    response: overrides.conflicts ?? mocks.emptyResponse,
                },
                // PR list (pullRequests with no numeric ID after it)
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests\\?`),
                    response: overrides.pullrequests ?? mocks.pullRequests,
                },
                // Single PR (pullRequests/{id})
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/pullRequests/\\d+\\?`),
                    response: overrides.singlePR ?? mocks.singlePR,
                },
                // Merge bases
                {
                    pattern: new RegExp(`/_apis/git/repositories/[^/]+/mergebases/`),
                    response: overrides.mergebases ?? mocks.mergeBases,
                },
                // Policy evaluations
                {
                    pattern: new RegExp(`/_apis/policy/evaluations`),
                    response: overrides.policies ?? mocks.policyEvaluations,
                },
                // Review timestamps (local server endpoint)
                {
                    pattern: /\/review-timestamps/,
                    response: overrides.reviewTimestamps ?? {},
                },
                // Avatar proxy (local server endpoint)
                {
                    pattern: /\/avatar\?/,
                    response: overrides.avatar ?? '',
                },
            ];

            for (const { pattern, response } of routes) {
                await page.route(pattern, (route) => {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: typeof response === 'string' ? response : JSON.stringify(response),
                    });
                });
            }
        };

        await use(setup);
    },
});

export { expect } from '@playwright/test';
