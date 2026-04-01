/**
 * Canned ADO API responses for Playwright E2E tests.
 * These match the shape returned by Azure DevOps REST API 6.0.
 */

export const testConfig = {
    serverUrl: 'https://ado.example.com',
    organization: 'TestOrg',
    project: 'TestProject',
    repository: 'TestRepo',
    pat: 'fake-pat-token',
};

export const repositories = {
    value: [
        { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
        { id: 'repo-2', name: 'OtherRepo', project: { name: 'TestProject' } },
    ],
    count: 2,
};

export const projects = {
    value: [
        { id: 'proj-1', name: 'TestProject', state: 'wellFormed' },
        { id: 'proj-2', name: 'OtherProject', state: 'wellFormed' },
    ],
    count: 2,
};

export const pullRequests = {
    value: [
        {
            pullRequestId: 101,
            title: 'Add feature X',
            status: 'active',
            createdBy: { displayName: 'Alice', id: 'user-1', uniqueName: 'alice@example.com' },
            creationDate: '2024-06-01T10:00:00Z',
            sourceRefName: 'refs/heads/feature-x',
            targetRefName: 'refs/heads/main',
            reviewers: [
                { displayName: 'Bob', id: 'user-2', vote: 0, isRequired: true },
            ],
            repository: { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
            isDraft: false,
        },
        {
            pullRequestId: 102,
            title: 'Fix bug in parser',
            status: 'active',
            createdBy: { displayName: 'Bob', id: 'user-2', uniqueName: 'bob@example.com' },
            creationDate: '2024-06-02T14:00:00Z',
            sourceRefName: 'refs/heads/fix-parser',
            targetRefName: 'refs/heads/main',
            reviewers: [
                { displayName: 'Alice', id: 'user-1', vote: 10, isRequired: false },
            ],
            repository: { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
            isDraft: false,
        },
        {
            pullRequestId: 103,
            title: 'Refactor utils',
            status: 'completed',
            createdBy: { displayName: 'Charlie', id: 'user-3', uniqueName: 'charlie@example.com' },
            creationDate: '2024-05-28T09:00:00Z',
            closedDate: '2024-06-01T16:00:00Z',
            sourceRefName: 'refs/heads/refactor-utils',
            targetRefName: 'refs/heads/main',
            reviewers: [],
            repository: { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
            isDraft: false,
        },
    ],
    count: 3,
};

export const threads = {
    value: [
        {
            id: 1,
            status: 'active',
            threadContext: {
                filePath: '/src/feature.js',
                rightFileStart: { line: 10, offset: 1 },
                rightFileEnd: { line: 10, offset: 1 },
            },
            comments: [
                {
                    id: 1,
                    parentCommentId: 0,
                    content: 'Should we add error handling here?',
                    commentType: 'text',
                    author: { displayName: 'Bob', id: 'user-2' },
                    publishedDate: '2024-06-01T12:00:00Z',
                    lastUpdatedDate: '2024-06-01T12:00:00Z',
                },
            ],
            publishedDate: '2024-06-01T12:00:00Z',
            lastUpdatedDate: '2024-06-01T12:00:00Z',
            isDeleted: false,
        },
        {
            id: 2,
            status: 'fixed',
            threadContext: {
                filePath: '/src/feature.js',
                rightFileStart: { line: 25, offset: 1 },
                rightFileEnd: { line: 25, offset: 1 },
            },
            comments: [
                {
                    id: 1,
                    parentCommentId: 0,
                    content: 'Typo in variable name',
                    commentType: 'text',
                    author: { displayName: 'Alice', id: 'user-1' },
                    publishedDate: '2024-06-01T11:00:00Z',
                    lastUpdatedDate: '2024-06-01T13:00:00Z',
                },
            ],
            publishedDate: '2024-06-01T11:00:00Z',
            lastUpdatedDate: '2024-06-01T13:00:00Z',
            isDeleted: false,
        },
    ],
    count: 2,
};

export const iterations = {
    value: [
        { id: 1, createdDate: '2024-06-01T10:00:00Z', sourceRefCommit: { commitId: 'aaa111' }, description: 'Initial push' },
        { id: 2, createdDate: '2024-06-02T10:00:00Z', sourceRefCommit: { commitId: 'bbb222' }, description: 'Address review' },
    ],
    count: 2,
};

export const singlePR = {
    pullRequestId: 101,
    title: 'Add feature X',
    description: 'This PR adds feature X with tests.',
    status: 'active',
    createdBy: { displayName: 'Alice', id: 'user-1', uniqueName: 'alice@example.com' },
    creationDate: '2024-06-01T10:00:00Z',
    sourceRefName: 'refs/heads/feature-x',
    targetRefName: 'refs/heads/main',
    reviewers: [
        { displayName: 'Bob', id: 'user-2', vote: 0, isRequired: true },
    ],
    repository: { id: 'repo-1', name: 'TestRepo', project: { name: 'TestProject' } },
    isDraft: false,
    mergeStatus: 'succeeded',
    supportsIterations: true,
    lastMergeSourceCommit: { commitId: 'bbb222' },
    lastMergeTargetCommit: { commitId: 'target111' },
};

export const emptyResponse = { value: [], count: 0 };

export const connectionData = {
    authenticatedUser: { id: 'user-1', providerDisplayName: 'Alice' },
};

export const policyEvaluations = { value: [], count: 0 };

export const prStatuses = { value: [], count: 0 };

export const prCommits = { value: [], count: 0 };

export const workItemRefs = { value: [], count: 0 };

export const mergeBases = { value: [{ commitId: 'mergebase111' }], count: 1 };

export const identitySearchResults = {
    results: [{
        identities: [
            { localId: 'user-3', displayName: 'Charlie', mail: 'charlie@example.com' },
            { localId: 'user-4', displayName: 'Diana', mail: 'diana@example.com' },
        ],
    }],
};

export const iterationChangesWithFiles = {
    changeEntries: [
        {
            changeTrackingId: 1,
            changeType: 'edit',
            item: { objectId: 'newobj1', path: '/src/feature.js' },
            originalPath: '/src/feature.js',
        },
    ],
};

export const fileContentOld = `function hello() {
    console.log("Hello world");
}

function add(a, b) {
    return a + b;
}`;

export const fileContentNew = `function hello() {
    console.log("Hello world!");
}

function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}`;
