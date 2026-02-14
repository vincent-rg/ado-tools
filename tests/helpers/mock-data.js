/**
 * Shared test fixtures for ADO tools tests
 */

/** Three iterations simulating pushes to a PR branch */
export const iterations = [
    { id: 1, createdDate: '2024-01-01T00:00:00Z', sourceRefCommit: { commitId: 'aaa111' } },
    { id: 2, createdDate: '2024-01-02T00:00:00Z', sourceRefCommit: { commitId: 'bbb222' } },
    { id: 3, createdDate: '2024-01-03T00:00:00Z', sourceRefCommit: { commitId: 'ccc333' } },
];

/**
 * Change entries per iteration.
 * Iteration 2 renames /src/old.js -> /src/new.js
 */
export const changesByIteration = {
    1: [
        { item: { path: '/src/old.js' }, changeType: 'edit' },
    ],
    2: [
        { item: { path: '/src/new.js' }, changeType: 'rename, edit', sourceServerItem: '/src/old.js' },
    ],
    3: [
        { item: { path: '/src/new.js' }, changeType: 'edit' },
    ],
};

/** A thread on the right side of a file (new code), iteration 2 */
export function makeRightThread(startLine, endLine, startOffset = 0, endOffset = 0, iterationId = 2) {
    return {
        id: 100,
        threadContext: {
            filePath: '/src/new.js',
            rightFileStart: { line: startLine, offset: startOffset },
            rightFileEnd: { line: endLine, offset: endOffset },
        },
        pullRequestThreadContext: {
            iterationContext: { secondComparingIteration: iterationId },
        },
        comments: [{ id: 1, content: 'Fix this', commentType: 'text' }],
    };
}

/** A thread on the left side of a file (old code) */
export function makeLeftThread(startLine, endLine, startOffset = 0, endOffset = 0, iterationId = 2) {
    return {
        id: 101,
        threadContext: {
            filePath: '/src/new.js',
            leftFileStart: { line: startLine, offset: startOffset },
            leftFileEnd: { line: endLine, offset: endOffset },
        },
        pullRequestThreadContext: {
            iterationContext: { secondComparingIteration: iterationId },
        },
        comments: [{ id: 1, content: 'Old code issue', commentType: 'text' }],
    };
}
