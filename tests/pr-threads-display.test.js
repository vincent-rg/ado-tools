import { describe, it, expect } from 'vitest';
import { PRThreadsDisplay } from '../js/pr-threads-display.js';

// Shared test helpers
const escapeHtml = (s) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
const escapeJs = (s) => s ? s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
const formatDate = (d) => d || 'unknown';
const processContent = (c) => c || '';

describe('PRThreadsDisplay', () => {

    // --- countThreadsByStatus ---
    describe('countThreadsByStatus', () => {
        const deps = { isThreadDeleted: (t) => t.isDeleted === true };

        it('returns empty object for no threads', () => {
            expect(PRThreadsDisplay.countThreadsByStatus([], deps)).toEqual({});
        });

        it('counts active and fixed threads', () => {
            const threads = [
                { status: 'active' },
                { status: 'active' },
                { status: 'fixed' }
            ];
            const counts = PRThreadsDisplay.countThreadsByStatus(threads, deps);
            expect(counts.active).toBe(2);
            expect(counts.fixed).toBe(1);
        });

        it('counts deleted threads separately', () => {
            const threads = [
                { status: 'active', isDeleted: true },
                { status: 'active' }
            ];
            const counts = PRThreadsDisplay.countThreadsByStatus(threads, deps);
            expect(counts.deleted).toBe(1);
            expect(counts.active).toBe(1);
        });

        it('counts threads with no status as noStatus', () => {
            const threads = [{ /* no status */ }, { status: 'active' }];
            const counts = PRThreadsDisplay.countThreadsByStatus(threads, deps);
            expect(counts.noStatus).toBe(1);
            expect(counts.active).toBe(1);
        });

        it('counts all status types', () => {
            const threads = [
                { status: 'active' },
                { status: 'fixed' },
                { status: 'closed' },
                { status: 'pending' },
                { status: 'wontFix' },
                { status: 'unknown' }
            ];
            const counts = PRThreadsDisplay.countThreadsByStatus(threads, deps);
            expect(counts.active).toBe(1);
            expect(counts.fixed).toBe(1);
            expect(counts.closed).toBe(1);
            expect(counts.pending).toBe(1);
            expect(counts.wontFix).toBe(1);
            expect(counts.unknown).toBe(1);
        });
    });

    // --- buildAvatarHtml ---
    describe('buildAvatarHtml', () => {
        const deps = { escapeHtml };

        it('returns empty string for no userId', () => {
            expect(PRThreadsDisplay.buildAvatarHtml(null, 'User', null, deps)).toBe('');
            expect(PRThreadsDisplay.buildAvatarHtml(undefined, 'User', null, deps)).toBe('');
        });

        it('returns cached avatar img when URL available', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'Alice', 'http://avatar.jpg', deps);
            expect(html).toContain('src="http://avatar.jpg"');
            expect(html).toContain('alt="Alice"');
            expect(html).toContain('avatar-wrapper');
            expect(html).not.toContain('avatar-pending');
        });

        it('returns placeholder when no cached URL', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'Bob', null, deps);
            expect(html).toContain('avatar-placeholder');
            expect(html).toContain('avatar-pending');
            expect(html).toContain('data-user-id="u1"');
        });

        it('uses custom wrapper tag', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'Alice', 'http://a.jpg', deps, { wrapperTag: 'span' });
            expect(html).toMatch(/^<span class="avatar-wrapper"/);
            expect(html).toMatch(/<\/span>$/);
        });

        it('adds extra CSS class', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'A', null, deps, { extraClass: 'pr-title-avatar' });
            expect(html).toContain('avatar-wrapper pr-title-avatar');
        });

        it('shows author badge when requested', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'A', 'http://a.jpg', deps, { showAuthorBadge: true });
            expect(html).toContain('author-badge');
            expect(html).toContain('PR Author');
        });

        it('omits author badge by default', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', 'A', 'http://a.jpg', deps);
            expect(html).not.toContain('author-badge');
        });

        it('escapes displayName', () => {
            const html = PRThreadsDisplay.buildAvatarHtml('u1', '<script>xss</script>', null, deps);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });

    // --- buildTitleBarHtml ---
    describe('buildTitleBarHtml', () => {
        const prData = { pullRequestId: 42, title: 'Fix stuff' };
        const prUrl = 'https://dev.azure.com/org/proj/_git/repo/pullrequest/42';
        const opts = {
            statusBadgeHtml: '<span>Active</span>',
            prAuthorAvatarHtml: '<div class="avatar">A</div>',
            voteDropdownHtml: '<select></select>',
            statusActionsHtml: '<button>Approve</button>',
            autoCompleteHtml: '<button>AC</button>',
            fileCount: 5,
            currentView: 'overview',
            iterationCount: 3
        };
        const deps = { escapeHtml };

        it('includes PR number and title', () => {
            const html = PRThreadsDisplay.buildTitleBarHtml(prData, prUrl, opts, deps);
            expect(html).toContain('PR #42:');
            expect(html).toContain('Fix stuff');
        });

        it('includes view tabs with correct file count', () => {
            const html = PRThreadsDisplay.buildTitleBarHtml(prData, prUrl, opts, deps);
            expect(html).toContain('Files (5)');
            expect(html).toContain('Updates (3)');
        });

        it('marks active view tab', () => {
            const html = PRThreadsDisplay.buildTitleBarHtml(prData, prUrl, opts, deps);
            expect(html).toContain('view-tab active" data-view="overview"');
        });

        it('marks files tab active when currentView is files', () => {
            const html = PRThreadsDisplay.buildTitleBarHtml(prData, prUrl, { ...opts, currentView: 'files' }, deps);
            expect(html).toContain('view-tab active" data-view="files"');
            expect(html).not.toContain('view-tab active" data-view="overview"');
        });

        it('includes ADO link', () => {
            const html = PRThreadsDisplay.buildTitleBarHtml(prData, prUrl, opts, deps);
            expect(html).toContain(`href="${prUrl}"`);
            expect(html).toContain('View in ADO');
        });

        it('escapes PR title', () => {
            const xssPR = { pullRequestId: 1, title: '<img onerror=alert(1)>' };
            const html = PRThreadsDisplay.buildTitleBarHtml(xssPR, prUrl, opts, deps);
            expect(html).not.toContain('<img onerror');
        });
    });

    // --- buildHeaderHtml ---
    describe('buildHeaderHtml', () => {
        const deps = { formatDate, processContent };

        it('shows creation date', () => {
            const prData = { creationDate: '2024-01-15', sourceRefName: 'refs/heads/main', targetRefName: 'refs/heads/dev' };
            const html = PRThreadsDisplay.buildHeaderHtml(prData, deps);
            expect(html).toContain('2024-01-15');
        });

        it('strips refs/heads/ from branch names', () => {
            const prData = { sourceRefName: 'refs/heads/feature', targetRefName: 'refs/heads/main' };
            const html = PRThreadsDisplay.buildHeaderHtml(prData, deps);
            expect(html).toContain('<code>feature</code>');
            expect(html).toContain('<code id="prTargetBranch">main</code>');
        });

        it('shows Unknown for missing branches', () => {
            const html = PRThreadsDisplay.buildHeaderHtml({}, deps);
            expect(html).toContain('Unknown');
        });

        it('shows description when present', () => {
            const prData = { description: 'This fixes a bug' };
            const html = PRThreadsDisplay.buildHeaderHtml(prData, deps);
            expect(html).toContain('This fixes a bug');
        });

        it('shows placeholder when no description', () => {
            const html = PRThreadsDisplay.buildHeaderHtml({}, deps);
            expect(html).toContain('No description');
        });
    });

    // --- buildStatsSidebarHtml ---
    describe('buildStatsSidebarHtml', () => {
        it('shows thread status counts', () => {
            const counts = { active: 3, fixed: 1, closed: 2 };
            const html = PRThreadsDisplay.buildStatsSidebarHtml(counts, null, 0, '');
            expect(html).toContain('<strong>3</strong>');
            expect(html).toContain('<strong>1</strong>');
            expect(html).toContain('<strong>2</strong>');
        });

        it('shows pending and wontFix only when present', () => {
            const html1 = PRThreadsDisplay.buildStatsSidebarHtml({ active: 1 }, null, 0, '');
            expect(html1).not.toContain('Pending');
            expect(html1).not.toContain("Won't Fix");

            const html2 = PRThreadsDisplay.buildStatsSidebarHtml({ pending: 2, wontFix: 1 }, null, 0, '');
            expect(html2).toContain('Pending');
            expect(html2).toContain("Won't Fix");
        });

        it('shows file change stats when provided', () => {
            const stats = { added: 5, modified: 3, deleted: 1 };
            const html = PRThreadsDisplay.buildStatsSidebarHtml({}, stats, 7, '<button>Menu</button>');
            expect(html).toContain('+5');
            expect(html).toContain('~3');
            expect(html).toContain('-1');
            expect(html).toContain('<strong>7</strong>');
            expect(html).toContain('<button>Menu</button>');
        });

        it('omits file stats when null', () => {
            const html = PRThreadsDisplay.buildStatsSidebarHtml({}, null, 0, '');
            expect(html).not.toContain('Change Stats');
        });
    });

    // --- buildStatusControlHtml ---
    describe('buildStatusControlHtml', () => {
        it('returns empty when in bulk mode', () => {
            expect(PRThreadsDisplay.buildStatusControlHtml(1, 'active', true, { isBulkMode: true, isThreadDeleted: false, isSystemThread: false })).toBe('');
        });

        it('returns empty when thread is deleted', () => {
            expect(PRThreadsDisplay.buildStatusControlHtml(1, 'active', true, { isBulkMode: false, isThreadDeleted: true, isSystemThread: false })).toBe('');
        });

        it('returns empty when system thread', () => {
            expect(PRThreadsDisplay.buildStatusControlHtml(1, 'active', true, { isBulkMode: false, isThreadDeleted: false, isSystemThread: true })).toBe('');
        });

        it('shows "Change status" dropdown with current selection when thread has status', () => {
            const html = PRThreadsDisplay.buildStatusControlHtml(42, 'fixed', true, { isBulkMode: false, isThreadDeleted: false, isSystemThread: false });
            expect(html).toContain('Change status...');
            expect(html).toContain('value="fixed" selected');
            expect(html).toContain("removeThreadStatus('42')");
        });

        it('shows "Try force status" dropdown when thread has no status', () => {
            const html = PRThreadsDisplay.buildStatusControlHtml(42, undefined, false, { isBulkMode: false, isThreadDeleted: false, isSystemThread: false });
            expect(html).toContain('Try force status...');
            expect(html).not.toContain('removeThreadStatus');
        });

        it('includes all six status options', () => {
            const html = PRThreadsDisplay.buildStatusControlHtml(1, 'active', true, { isBulkMode: false, isThreadDeleted: false, isSystemThread: false });
            expect(html).toContain('Active');
            expect(html).toContain('Resolved');
            expect(html).toContain('Closed');
            expect(html).toContain("Won't Fix");
            expect(html).toContain('Pending');
            expect(html).toContain('Unknown');
        });
    });

    // --- classifyCommentType ---
    describe('classifyCommentType', () => {
        it('returns Deleted for deleted comments', () => {
            const info = PRThreadsDisplay.classifyCommentType('text', true);
            expect(info.label).toBe('Deleted');
            expect(info.badgeClass).toBe('comment-type-deleted');
        });

        it('classifies system comment (string)', () => {
            const info = PRThreadsDisplay.classifyCommentType('system', false);
            expect(info.label).toBe('System');
            expect(info.commentClass).toBe('system-comment');
            expect(info.badgeClass).toBe('comment-type-system');
        });

        it('classifies system comment (number 3)', () => {
            expect(PRThreadsDisplay.classifyCommentType(3, false).label).toBe('System');
        });

        it('classifies codeChange comment', () => {
            const info = PRThreadsDisplay.classifyCommentType('codeChange', false);
            expect(info.label).toBe('Code Change');
            expect(info.commentClass).toBe('code-change-comment');
        });

        it('classifies codeChange by number 2', () => {
            expect(PRThreadsDisplay.classifyCommentType(2, false).label).toBe('Code Change');
        });

        it('classifies text comment (string)', () => {
            const info = PRThreadsDisplay.classifyCommentType('text', false);
            expect(info.label).toBe('Text');
            expect(info.commentClass).toBe('');
            expect(info.badgeClass).toBe('comment-type-text');
        });

        it('classifies text comment (number 1)', () => {
            expect(PRThreadsDisplay.classifyCommentType(1, false).label).toBe('Text');
        });

        it('returns Unknown for unrecognized type', () => {
            expect(PRThreadsDisplay.classifyCommentType('other', false).label).toBe('Unknown');
        });
    });

    // --- buildFileContextHtml ---
    describe('buildFileContextHtml', () => {
        const deps = { escapeHtml, escapeJs };

        it('returns empty for thread without threadContext', () => {
            expect(PRThreadsDisplay.buildFileContextHtml({}, 1, deps)).toBe('');
        });

        it('shows simple context when no line info', () => {
            const thread = { threadContext: { filePath: '/src/app.js' } };
            const html = PRThreadsDisplay.buildFileContextHtml(thread, 1, deps);
            expect(html).toContain('thread-context');
            expect(html).toContain('/src/app.js');
        });

        it('shows collapsible preview when line info present', () => {
            const thread = {
                threadContext: { filePath: '/src/app.js', rightFileStart: { line: 10 }, rightFileEnd: { line: 15 } },
                pullRequestThreadContext: { iterationContext: { firstComparingIteration: 0, secondComparingIteration: 2 } }
            };
            const html = PRThreadsDisplay.buildFileContextHtml(thread, 42, deps);
            expect(html).toContain('file-preview');
            expect(html).toContain('file-preview-42');
            expect(html).toContain('Line 10-15');
            expect(html).toContain('/src/app.js');
        });

        it('shows (deleted) label when using left file', () => {
            const thread = {
                threadContext: { filePath: '/src/old.js', leftFileStart: { line: 5 }, leftFileEnd: { line: 5 } },
                pullRequestThreadContext: { iterationContext: { secondComparingIteration: 1 } }
            };
            const html = PRThreadsDisplay.buildFileContextHtml(thread, 1, deps);
            expect(html).toContain('(deleted)');
        });

        it('uses toggleIterationPreview for iteration ranges', () => {
            const thread = {
                threadContext: { filePath: '/a.js', rightFileStart: { line: 1 }, rightFileEnd: { line: 1 } },
                pullRequestThreadContext: { iterationContext: { firstComparingIteration: 2, secondComparingIteration: 5 } }
            };
            const html = PRThreadsDisplay.buildFileContextHtml(thread, 1, deps);
            expect(html).toContain('toggleIterationPreview');
            expect(html).toContain('iteration 2');
        });
    });

    // --- buildCommentActionsHtml ---
    describe('buildCommentActionsHtml', () => {
        const deps = { escapeHtml };
        const thread = { threadContext: { filePath: '/a.js' } };
        const comment = { id: 10, publishedDate: '2024-01-01', author: { id: 'u2' }, usersLiked: [] };

        it('returns empty when showCommentActions is false', () => {
            const html = PRThreadsDisplay.buildCommentActionsHtml(comment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: false, isCommentReviewed: false
            }, deps);
            expect(html).toBe('');
        });

        it('shows edit/delete/like buttons', () => {
            const html = PRThreadsDisplay.buildCommentActionsHtml(comment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: true, isCommentReviewed: false
            }, deps);
            expect(html).toContain('startEditComment(1, 10)');
            expect(html).toContain('deleteComment(1, 10)');
            expect(html).toContain('toggleCommentLike');
        });

        it('shows "Mark reviewed" for other users comments', () => {
            const html = PRThreadsDisplay.buildCommentActionsHtml(comment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: true, isCommentReviewed: false
            }, deps);
            expect(html).toContain('Mark reviewed');
        });

        it('shows checkmark for already reviewed comments', () => {
            const html = PRThreadsDisplay.buildCommentActionsHtml(comment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: true, isCommentReviewed: true
            }, deps);
            expect(html).toContain('reviewed');
            expect(html).toContain('Mark unread');
        });

        it('omits review button for own comments', () => {
            const ownComment = { ...comment, author: { id: 'u1' } };
            const html = PRThreadsDisplay.buildCommentActionsHtml(ownComment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: true, isCommentReviewed: false
            }, deps);
            expect(html).not.toContain('Mark reviewed');
        });

        it('shows like count when users have liked', () => {
            const likedComment = { ...comment, usersLiked: [{ id: 'u3' }, { id: 'u4' }] };
            const html = PRThreadsDisplay.buildCommentActionsHtml(likedComment, thread, {
                threadId: 1, currentUserId: 'u1', showCommentActions: true, isCommentReviewed: false
            }, deps);
            expect(html).toContain('<span>2</span>');
        });
    });

    // --- buildThreadControlsHtml ---
    describe('buildThreadControlsHtml', () => {
        const headerData = {
            threadUrl: 'https://ado/thread/1',
            apiEndpoint: 'https://ado/api/1',
            hasFileContext: true,
            hasStatus: true,
            statusClass: 'badge-active',
            statusText: 'Active',
            statusControl: '<select></select>'
        };

        it('shows unread dot when hasUnread is true', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml(headerData, true);
            expect(html).toContain('thread-unread-dot');
            expect(html).toContain('Has unread comments');
        });

        it('omits unread dot when hasUnread is false', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml(headerData, false);
            expect(html).not.toContain('thread-unread-dot');
        });

        it('shows status badge when hasStatus is true', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml(headerData, false);
            expect(html).toContain('badge-active');
            expect(html).toContain('Active');
        });

        it('omits status badge when hasStatus is false', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml({ ...headerData, hasStatus: false }, false);
            expect(html).not.toContain('badge-active');
        });

        it('shows files tab hint for threads with file context', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml(headerData, false);
            expect(html).toContain('files tab');
        });

        it('shows overview tab hint for threads without file context', () => {
            const html = PRThreadsDisplay.buildThreadControlsHtml({ ...headerData, hasFileContext: false }, false);
            expect(html).toContain('overview tab');
        });
    });

    // --- buildIterationDividerHtml ---
    describe('buildIterationDividerHtml', () => {
        const deps = { escapeHtml, escapeJs };

        it('shows file changed divider with iteration range', () => {
            const html = PRThreadsDisplay.buildIterationDividerHtml(
                '/src/app.js', 42, 3, 1, 2, { line: 10 }, { line: 20 }, true, deps
            );
            expect(html).toContain('File changed:');
            expect(html).toContain('/src/app.js');
            expect(html).toContain('Line 10-20');
            expect(html).toContain('iteration 1 →');
            expect(html).toContain('→ 2)');
            expect(html).toContain('iteration-preview-42-3');
        });

        it('shows single line when start equals end', () => {
            const html = PRThreadsDisplay.buildIterationDividerHtml(
                '/a.js', 1, 0, 1, 2, { line: 5 }, { line: 5 }, true, deps
            );
            expect(html).toContain('Line 5)');
            expect(html).not.toContain('Line 5-5');
        });
    });

    // --- buildThreadListHtml ---
    describe('buildThreadListHtml', () => {
        const baseDeps = {
            escapeHtml,
            escapeJs,
            formatDate,
            processContent,
            getCachedAvatar: () => null,
            isCommentReviewed: () => false,
            threadHasUnread: () => false,
            getIterationLinksForComment: () => ({ beforeLink: null, afterLink: null, completeLink: null }),
            getLastIterationBeforeTime: () => null,
            isThreadDeleted: (t) => t.isDeleted === true,
            getStatusBadgeClass: (s) => `badge-${s || 'none'}`,
            getStatusText: (s) => s || 'No Status',
            buildThreadUrl: () => 'https://ado/thread'
        };
        const baseOpts = {
            isBulkMode: false,
            selectedThreadIds: new Set(),
            currentUserId: 'u1',
            reviewTimestamps: new Map(),
            iterations: [],
            prData: { pullRequestId: 1, createdBy: { id: 'author1' } },
            config: { serverUrl: 'https://ado', organization: 'org', project: 'proj', repository: 'repo' }
        };

        it('returns info message for empty threads', () => {
            const html = PRThreadsDisplay.buildThreadListHtml([], baseOpts, baseDeps);
            expect(html).toContain('No threads found');
        });

        it('renders thread container with threads', () => {
            const threads = [{
                id: 10,
                status: 'active',
                comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'Hello', author: { id: 'u2', displayName: 'Bob' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).toContain('thread-container');
            expect(html).toContain('Hello');
            expect(html).toContain('data-thread-id="10"');
        });

        it('includes reply button for non-system non-deleted threads', () => {
            const threads = [{
                id: 10,
                status: 'active',
                comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'X', author: { id: 'u2', displayName: 'B' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).toContain('showReplyForm(10)');
            expect(html).toContain('Reply');
        });

        it('omits reply button for deleted threads', () => {
            const threads = [{
                id: 10,
                isDeleted: true,
                status: 'active',
                comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'X', author: { id: 'u2', displayName: 'B' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).not.toContain('showReplyForm');
        });

        it('omits reply button for system threads', () => {
            const threads = [{
                id: 10,
                status: 'active',
                comments: [{ id: 1, commentType: 'system', publishedDate: '2024-01-01', content: 'Auto', author: { id: 'sys' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).not.toContain('showReplyForm');
        });

        it('renders file context for code threads', () => {
            const threads = [{
                id: 10,
                status: 'active',
                threadContext: { filePath: '/src/main.js' },
                comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'Fix', author: { id: 'u2', displayName: 'B' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).toContain('/src/main.js');
        });

        it('renders multiple threads', () => {
            const threads = [
                { id: 1, status: 'active', comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'First', author: { id: 'u2', displayName: 'A' } }] },
                { id: 2, status: 'fixed', comments: [{ id: 2, commentType: 'text', publishedDate: '2024-01-02', content: 'Second', author: { id: 'u3', displayName: 'B' } }] }
            ];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, baseOpts, baseDeps);
            expect(html).toContain('First');
            expect(html).toContain('Second');
            expect(html).toContain('data-thread-id="1"');
            expect(html).toContain('data-thread-id="2"');
        });

        it('shows bulk mode checkboxes when enabled', () => {
            const threads = [{
                id: 10,
                status: 'active',
                comments: [{ id: 1, commentType: 'text', publishedDate: '2024-01-01', content: 'X', author: { id: 'u2', displayName: 'B' } }]
            }];
            const html = PRThreadsDisplay.buildThreadListHtml(threads, { ...baseOpts, isBulkMode: true }, baseDeps);
            expect(html).toContain('thread-checkbox');
            expect(html).toContain('toggleThreadSelection');
        });
    });

    // --- buildCommentHeaderHtml ---
    describe('buildCommentHeaderHtml', () => {
        const deps = { formatDate, escapeJs };
        const baseOpts = {
            isFirstComment: true,
            threadHeaderData: {
                isBulkMode: false,
                isChecked: '',
                threadUrl: 'https://ado/thread/1',
                apiEndpoint: 'https://ado/api/1',
                threadId: 42,
                hasFileContext: true,
                hasStatus: true,
                statusClass: 'badge-active',
                statusText: 'Active',
                statusControl: ''
            },
            commentAvatarHtml: '<div class="avatar">A</div>',
            iterationLinks: { completeLink: null },
            filePath: '/src/app.js',
            commentTypeInfo: { label: 'Text', badgeClass: 'comment-type-text', commentClass: '' },
            editDeleteButtons: '<span class="comment-actions"></span>',
            threadControls: '<span class="thread-controls"></span>'
        };
        const comment = { publishedDate: '2024-01-15', isDeleted: false };

        it('includes comment date', () => {
            const html = PRThreadsDisplay.buildCommentHeaderHtml(comment, baseOpts, deps);
            expect(html).toContain('2024-01-15');
        });

        it('hides Text type badge for non-deleted text comments', () => {
            const html = PRThreadsDisplay.buildCommentHeaderHtml(comment, baseOpts, deps);
            expect(html).not.toContain('comment-type-text');
        });

        it('shows type badge for system comments', () => {
            const opts = { ...baseOpts, commentTypeInfo: { label: 'System', badgeClass: 'comment-type-system', commentClass: 'system-comment' } };
            const html = PRThreadsDisplay.buildCommentHeaderHtml(comment, opts, deps);
            expect(html).toContain('comment-type-system');
            expect(html).toContain('System');
        });

        it('shows type badge for deleted comments', () => {
            const deletedComment = { ...comment, isDeleted: true };
            const opts = { ...baseOpts, commentTypeInfo: { label: 'Deleted', badgeClass: 'comment-type-deleted', commentClass: '' } };
            const html = PRThreadsDisplay.buildCommentHeaderHtml(deletedComment, opts, deps);
            expect(html).toContain('comment-type-deleted');
        });

        it('includes iteration links when completeLink is available', () => {
            const opts = {
                ...baseOpts,
                iterationLinks: {
                    beforeLink: true, beforeRange: '1..2', beforeIterStart: 1, beforeIterEnd: 2,
                    afterLink: true, afterRange: '3..5', afterIterStart: 3, afterIterEnd: 5,
                    completeLink: true, completeRange: '1..5', completeIterStart: null, completeIterEnd: null
                }
            };
            const html = PRThreadsDisplay.buildCommentHeaderHtml(comment, opts, deps);
            expect(html).toContain('code-links');
            expect(html).toContain('1..2');
            expect(html).toContain('3..5');
            expect(html).toContain('1..5');
            expect(html).toContain('openCommentInFilesView');
        });

        it('shows bulk checkbox on first comment when bulk mode enabled', () => {
            const opts = { ...baseOpts, threadHeaderData: { ...baseOpts.threadHeaderData, isBulkMode: true, threadId: 99 } };
            const html = PRThreadsDisplay.buildCommentHeaderHtml(comment, opts, deps);
            expect(html).toContain('thread-checkbox');
            expect(html).toContain('thread-checkbox-99');
        });
    });
});
