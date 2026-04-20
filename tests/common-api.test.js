import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock globals needed by common.js
globalThis.btoa = (s) => Buffer.from(s).toString('base64');
globalThis.window = globalThis.window || {};
globalThis.localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const { ADOAPI } = await import('../js/common.js');

const config = {
    serverUrl: 'https://dev.azure.com',
    organization: 'myorg',
    project: 'myproj',
    repository: 'myrepo',
    pat: 'test-pat-token',
};

function jsonResponse(data, ok = true) {
    return {
        ok,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    };
}

function capturedUrl() { return mockFetch.mock.calls[0][0]; }
function capturedOptions() { return mockFetch.mock.calls[0][1]; }
function capturedBody() { return JSON.parse(capturedOptions().body); }

describe('ADOAPI', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    // --- fetchWithAuth ---

    describe('fetchWithAuth', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(jsonResponse({}));
        });

        it('sets Authorization header with Basic base64 of :pat', async () => {
            await ADOAPI.fetchWithAuth('https://example.com/api', 'my-secret-pat');
            const headers = capturedOptions().headers;
            const expected = 'Basic ' + Buffer.from(':my-secret-pat').toString('base64');
            expect(headers.Authorization).toBe(expected);
        });

        it('sets default Content-Type to application/json', async () => {
            await ADOAPI.fetchWithAuth('https://example.com/api', 'pat');
            expect(capturedOptions().headers['Content-Type']).toBe('application/json');
        });

        it('merges custom headers with defaults (custom wins)', async () => {
            await ADOAPI.fetchWithAuth('https://example.com/api', 'pat', {
                headers: { 'X-Custom': 'value', 'Content-Type': 'text/plain' }
            });
            const headers = capturedOptions().headers;
            expect(headers['X-Custom']).toBe('value');
            // Custom Content-Type overrides default via spread order
            expect(headers['Content-Type']).toBe('text/plain');
        });

        it('passes through method and body options', async () => {
            await ADOAPI.fetchWithAuth('https://example.com/api', 'pat', {
                method: 'POST',
                body: '{"key":"val"}'
            });
            expect(capturedOptions().method).toBe('POST');
            expect(capturedOptions().body).toBe('{"key":"val"}');
        });
    });

    // --- updateThreadStatus ---

    describe('updateThreadStatus', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(jsonResponse({ status: 2 }));
        });

        it('maps string "active" to status integer 1', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'active');
            expect(capturedBody().status).toBe(1);
        });

        it('maps string "fixed" to status integer 2', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'fixed');
            expect(capturedBody().status).toBe(2);
        });

        it('maps string "wontFix" to status integer 3', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'wontFix');
            expect(capturedBody().status).toBe(3);
        });

        it('maps string "closed" to status integer 4', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'closed');
            expect(capturedBody().status).toBe(4);
        });

        it('maps string "pending" to status integer 6', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'pending');
            expect(capturedBody().status).toBe(6);
        });

        it('passes integer status through unchanged', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 5);
            expect(capturedBody().status).toBe(5);
        });

        it('uses PATCH method', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'fixed');
            expect(capturedOptions().method).toBe('PATCH');
        });

        it('URL includes thread path with threadId', async () => {
            await ADOAPI.updateThreadStatus(config, 42, 10, 'fixed');
            expect(capturedUrl()).toContain('/pullRequests/42/threads/10');
        });
    });

    // --- getPRs pagination ---

    describe('getPRs', () => {
        // getPRs fetches 5 pages in parallel; mock must provide responses for all 5
        function mockParallelPages(...pageResults) {
            pageResults.forEach(prs => mockFetch.mockResolvedValueOnce(jsonResponse({ value: prs })));
            // Fill remaining parallel slots with empty responses
            const remaining = 5 - (pageResults.length % 5);
            if (remaining < 5) {
                for (let i = 0; i < remaining; i++) {
                    mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));
                }
            }
        }

        it('returns all PRs from a single page', async () => {
            mockParallelPages([{ id: 1 }, { id: 2 }]);
            const result = await ADOAPI.getPRs(config, 'proj', 'repo');
            expect(result.value).toHaveLength(2);
        });

        it('paginates when first page returns exactly 100 results', async () => {
            const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
            const page2 = [{ id: 100 }, { id: 101 }];
            // First batch: page1 is full, pages 2-5 are empty (but page2 has 2 items)
            mockParallelPages(page1, page2);

            const result = await ADOAPI.getPRs(config, 'proj', 'repo');
            expect(result.value).toHaveLength(102);
        });

        it('URL includes status=all by default', async () => {
            mockParallelPages([]);
            await ADOAPI.getPRs(config, 'proj', 'repo');
            expect(capturedUrl()).toContain('searchCriteria.status=all');
        });

        it('URL includes custom status parameter', async () => {
            mockParallelPages([]);
            await ADOAPI.getPRs(config, 'proj', 'repo', 'active');
            expect(capturedUrl()).toContain('searchCriteria.status=active');
        });

        it('URL includes $top=100 and $skip=0 on first request', async () => {
            mockParallelPages([]);
            await ADOAPI.getPRs(config, 'proj', 'repo');
            expect(capturedUrl()).toContain('$top=100');
            expect(capturedUrl()).toContain('$skip=0');
        });

        it('fetches pages in parallel with correct skip values', async () => {
            const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
            const page2 = Array.from({ length: 100 }, (_, i) => ({ id: 100 + i }));
            const page3 = [{ id: 200 }];
            // First 5 parallel pages: page1 (full), page2 (full) → needs second round
            // But since pages 1-2 are full and 3 is partial, all in first batch of 5
            mockParallelPages(page1, page2, page3);

            const result = await ADOAPI.getPRs(config, 'proj', 'repo');
            expect(result.value).toHaveLength(201);

            // Verify parallel skip values in first batch
            const urls = mockFetch.mock.calls.map(c => c[0]);
            expect(urls[0]).toContain('$skip=0');
            expect(urls[1]).toContain('$skip=100');
            expect(urls[2]).toContain('$skip=200');
        });
    });

    // --- createThread ---

    describe('createThread', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(jsonResponse({ id: 99 }));
        });

        it('sends correct base payload structure', async () => {
            await ADOAPI.createThread(config, 42, 'Hello world');
            const body = capturedBody();
            expect(body.comments).toHaveLength(1);
            expect(body.comments[0].content).toBe('Hello world');
            expect(body.comments[0].commentType).toBe(1);
            expect(body.status).toBe(1); // default status
        });

        it('includes threadContext when provided', async () => {
            const ctx = { filePath: '/src/foo.js', rightFileStart: { line: 10, offset: 1 } };
            await ADOAPI.createThread(config, 42, 'Comment', 1, ctx);
            expect(capturedBody().threadContext).toEqual(ctx);
        });

        it('omits threadContext when null', async () => {
            await ADOAPI.createThread(config, 42, 'Comment', 1, null);
            expect(capturedBody().threadContext).toBeUndefined();
        });

        it('includes pullRequestThreadContext when provided', async () => {
            const prCtx = { iterationContext: { firstComparingIteration: 1 } };
            await ADOAPI.createThread(config, 42, 'Comment', 1, null, prCtx);
            expect(capturedBody().pullRequestThreadContext).toEqual(prCtx);
        });

        it('uses POST method', async () => {
            await ADOAPI.createThread(config, 42, 'Comment');
            expect(capturedOptions().method).toBe('POST');
        });
    });

    // --- getPRIterationChanges ---

    describe('getPRIterationChanges', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(jsonResponse({ changeEntries: [] }));
        });

        it('URL includes iteration path', async () => {
            await ADOAPI.getPRIterationChanges(config, 42, 3);
            expect(capturedUrl()).toContain('/iterations/3/changes');
        });

        it('omits $compareTo when compareTo is undefined', async () => {
            await ADOAPI.getPRIterationChanges(config, 42, 3);
            expect(capturedUrl()).not.toContain('$compareTo');
        });

        it('includes $compareTo=0 when compareTo is 0', async () => {
            await ADOAPI.getPRIterationChanges(config, 42, 3, 0);
            expect(capturedUrl()).toContain('$compareTo=0');
        });

        it('includes $compareTo=2 when compareTo is 2', async () => {
            await ADOAPI.getPRIterationChanges(config, 42, 3, 2);
            expect(capturedUrl()).toContain('$compareTo=2');
        });
    });

    // --- getFileContent ---

    describe('getFileContent', () => {
        it('URL-encodes the file path', async () => {
            mockFetch.mockResolvedValue(jsonResponse('file content'));
            await ADOAPI.getFileContent(config, '/src/my file.js');
            expect(capturedUrl()).toContain('path=%2Fsrc%2Fmy%20file.js');
        });

        it('appends version descriptor params when provided', async () => {
            mockFetch.mockResolvedValue(jsonResponse('content'));
            await ADOAPI.getFileContent(config, '/foo.js', { version: 'abc123', versionType: 'commit' });
            expect(capturedUrl()).toContain('versionDescriptor.version=abc123');
            expect(capturedUrl()).toContain('versionDescriptor.versionType=commit');
        });

        it('omits version params when no descriptor', async () => {
            mockFetch.mockResolvedValue(jsonResponse('content'));
            await ADOAPI.getFileContent(config, '/foo.js');
            expect(capturedUrl()).not.toContain('versionDescriptor');
        });

        it('returns text content (not JSON)', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ should: 'not be called' }),
                text: () => Promise.resolve('raw file content here'),
            });
            const result = await ADOAPI.getFileContent(config, '/foo.js');
            expect(result).toBe('raw file content here');
        });
    });

    // --- setAutoComplete ---

    describe('setAutoComplete', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(jsonResponse({}));
        });

        it('defaults mergeStrategy to squash and deleteSourceBranch to true', async () => {
            await ADOAPI.setAutoComplete(config, 42, { id: 'user-1' });
            const body = capturedBody();
            expect(body.completionOptions.mergeStrategy).toBe('squash');
            expect(body.completionOptions.deleteSourceBranch).toBe(true);
        });

        it('uses custom completionOptions when provided', async () => {
            await ADOAPI.setAutoComplete(config, 42, { id: 'user-1' }, {
                mergeStrategy: 'rebase',
                deleteSourceBranch: false,
            });
            const body = capturedBody();
            expect(body.completionOptions.mergeStrategy).toBe('rebase');
            expect(body.completionOptions.deleteSourceBranch).toBe(false);
        });

        it('includes autoCompleteSetBy in payload', async () => {
            await ADOAPI.setAutoComplete(config, 42, { id: 'user-1' });
            expect(capturedBody().autoCompleteSetBy).toEqual({ id: 'user-1' });
        });
    });

    // --- removeAutoComplete ---

    describe('removeAutoComplete', () => {
        it('uses zeroed GUID to clear autoCompleteSetBy', async () => {
            mockFetch.mockResolvedValue(jsonResponse({}));
            await ADOAPI.removeAutoComplete(config, 42);
            expect(capturedBody().autoCompleteSetBy.id).toBe('00000000-0000-0000-0000-000000000000');
        });

        it('uses PATCH method', async () => {
            mockFetch.mockResolvedValue(jsonResponse({}));
            await ADOAPI.removeAutoComplete(config, 42);
            expect(capturedOptions().method).toBe('PATCH');
        });
    });

    // --- completePR ---

    describe('completePR', () => {
        it('sets status to completed with lastMergeSourceCommit', async () => {
            mockFetch.mockResolvedValue(jsonResponse({}));
            await ADOAPI.completePR(config, 42, 'commit-abc', { mergeStrategy: 'squash' });
            const body = capturedBody();
            expect(body.status).toBe('completed');
            expect(body.lastMergeSourceCommit).toEqual({ commitId: 'commit-abc' });
            expect(body.completionOptions).toEqual({ mergeStrategy: 'squash' });
        });
    });

    // --- getPolicyEvaluations ---

    describe('getPolicyEvaluations', () => {
        it('builds correct artifact ID with projectId and prId', async () => {
            mockFetch.mockResolvedValue(jsonResponse({ value: [] }));
            await ADOAPI.getPolicyEvaluations(config, 'myproj', 'proj-guid-123', 42);
            expect(capturedUrl()).toContain('artifactId=vstfs:///CodeReview/CodeReviewId/proj-guid-123/42');
        });

        it('uses preview API version', async () => {
            mockFetch.mockResolvedValue(jsonResponse({ value: [] }));
            await ADOAPI.getPolicyEvaluations(config, 'myproj', 'proj-guid', 1);
            expect(capturedUrl()).toContain('api-version=6.0-preview.1');
        });
    });

    // --- error handling ---

    describe('error handling', () => {
        it('throws with API error message on non-ok response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                json: () => Promise.resolve({ message: 'Access denied' }),
            });
            await expect(ADOAPI.getPR(config, 42)).rejects.toThrow('Access denied');
        });

        it('falls back to status text when no message in response', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: () => Promise.reject(new Error('not json')),
            });
            await expect(ADOAPI.getPR(config, 42)).rejects.toThrow('500 Internal Server Error');
        });
    });
});
