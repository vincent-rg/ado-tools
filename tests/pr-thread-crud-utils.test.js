import { describe, it, expect, beforeEach } from 'vitest';
import PRThreadCrudUtils from '../js/pr-thread-crud-utils.js';
import { MentionUtils } from '../js/mention-utils.js';

describe('PRThreadCrudUtils', () => {
    // ==================== Draft Management ====================

    describe('Draft Management', () => {
        let drafts;

        beforeEach(() => {
            drafts = new Map();
        });

        describe('saveDraft', () => {
            it('creates a new draft entry', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'hello');
                expect(drafts.get('reply\x00123')).toEqual({ content: 'hello' });
            });

            it('updates existing draft content', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'first');
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'updated');
                expect(drafts.get('reply\x00123').content).toBe('updated');
            });

            it('merges metadata with existing entry', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/file.js\x0010\x00right', 'text', { lineLen: 42 });
                expect(drafts.get('line\x001\x00/file.js\x0010\x00right')).toEqual({ content: 'text', lineLen: 42 });
            });

            it('preserves existing metadata when updating content', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/file.js\x0010\x00right', 'first', { lineLen: 42 });
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/file.js\x0010\x00right', 'updated');
                const draft = drafts.get('line\x001\x00/file.js\x0010\x00right');
                expect(draft.content).toBe('updated');
                expect(draft.lineLen).toBe(42);
            });

            it('saves empty content (marks form as open)', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', '');
                expect(drafts.has('reply\x00123')).toBe(true);
                expect(drafts.get('reply\x00123').content).toBe('');
            });
        });

        describe('clearDraft', () => {
            it('removes existing draft', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'text');
                PRThreadCrudUtils.clearDraft(drafts, 'reply\x00123');
                expect(drafts.has('reply\x00123')).toBe(false);
            });

            it('is a no-op for non-existent key', () => {
                PRThreadCrudUtils.clearDraft(drafts, 'nonexistent');
                expect(drafts.size).toBe(0);
            });
        });

        describe('Draft Key Builders', () => {
            it('replyDraftKey builds correct key', () => {
                expect(PRThreadCrudUtils.replyDraftKey(123)).toBe('reply\x00123');
            });

            it('editDraftKey builds correct key', () => {
                expect(PRThreadCrudUtils.editDraftKey(123, 456)).toBe('edit\x00123\x00456');
            });

            it('lineDraftKey builds correct key', () => {
                expect(PRThreadCrudUtils.lineDraftKey(1, '/src/file.js', 42, 'right'))
                    .toBe('line\x001\x00/src/file.js\x0042\x00right');
            });

            it('fileDraftKey builds correct key', () => {
                expect(PRThreadCrudUtils.fileDraftKey('/src/file.js')).toBe('file\x00/src/file.js');
            });

            it('selectionDraftKey builds correct key', () => {
                expect(PRThreadCrudUtils.selectionDraftKey(1, '/src/file.js', 10, 15, 0, 20, 'right'))
                    .toBe('sel\x001\x00/src/file.js\x0010\x0015\x000\x0020\x00right');
            });
        });

        describe('parseDraftKey', () => {
            it('parses reply key', () => {
                const result = PRThreadCrudUtils.parseDraftKey('reply\x00123');
                expect(result.type).toBe('reply');
                expect(result.parts).toEqual(['reply', '123']);
            });

            it('parses edit key', () => {
                const result = PRThreadCrudUtils.parseDraftKey('edit\x00123\x00456');
                expect(result.type).toBe('edit');
                expect(result.parts).toEqual(['edit', '123', '456']);
            });

            it('parses line key', () => {
                const result = PRThreadCrudUtils.parseDraftKey('line\x001\x00/src/file.js\x0042\x00right');
                expect(result.type).toBe('line');
                expect(result.parts[2]).toBe('/src/file.js');
                expect(result.parts[3]).toBe('42');
                expect(result.parts[4]).toBe('right');
            });

            it('parses selection key', () => {
                const result = PRThreadCrudUtils.parseDraftKey('sel\x001\x00/src/file.js\x0010\x0015\x000\x0020\x00right');
                expect(result.type).toBe('sel');
                expect(result.parts[2]).toBe('/src/file.js');
                expect(result.parts[3]).toBe('10');
                expect(result.parts[4]).toBe('15');
            });

            it('parses file key', () => {
                const result = PRThreadCrudUtils.parseDraftKey('file\x00/src/file.js');
                expect(result.type).toBe('file');
                expect(result.parts[1]).toBe('/src/file.js');
            });
        });

        describe('getDraftsForFile', () => {
            it('returns line drafts for a file', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/src/file.js\x0042\x00right', 'line comment');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toEqual([{
                    type: 'line', lineNum: 42, side: 'right',
                    key: 'line\x001\x00/src/file.js\x0042\x00right', content: 'line comment'
                }]);
            });

            it('returns selection drafts for a file', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'sel\x001\x00/src/file.js\x0010\x0015\x000\x0020\x00right', 'sel comment');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toEqual([{
                    type: 'sel', startLine: 10, endLine: 15,
                    key: 'sel\x001\x00/src/file.js\x0010\x0015\x000\x0020\x00right', content: 'sel comment'
                }]);
            });

            it('returns file-level drafts', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'file\x00/src/file.js', 'file comment');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toEqual([{
                    type: 'file', key: 'file\x00/src/file.js', content: 'file comment'
                }]);
            });

            it('returns all draft types for a file', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/src/file.js\x005\x00left', 'line');
                PRThreadCrudUtils.saveDraft(drafts, 'sel\x002\x00/src/file.js\x0010\x0012\x000\x005\x00right', 'sel');
                PRThreadCrudUtils.saveDraft(drafts, 'file\x00/src/file.js', 'file');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toHaveLength(3);
                expect(result.map(d => d.type)).toEqual(['line', 'sel', 'file']);
            });

            it('excludes drafts for other files', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'line\x001\x00/src/other.js\x005\x00left', 'other');
                PRThreadCrudUtils.saveDraft(drafts, 'line\x002\x00/src/file.js\x005\x00left', 'this');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toHaveLength(1);
                expect(result[0].content).toBe('this');
            });

            it('ignores reply and edit drafts (they belong to threads not files)', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'reply text');
                PRThreadCrudUtils.saveDraft(drafts, 'edit\x00123\x00456', 'edit text');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result).toHaveLength(0);
            });

            it('returns empty array when no drafts exist', () => {
                expect(PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js')).toEqual([]);
            });

            it('returns empty content for drafts with no content', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'file\x00/src/file.js', '');
                const result = PRThreadCrudUtils.getDraftsForFile(drafts, '/src/file.js');
                expect(result[0].content).toBe('');
            });
        });

        describe('hasReplyDraft', () => {
            it('returns true when reply draft exists', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', '');
                expect(PRThreadCrudUtils.hasReplyDraft(drafts, 123)).toBe(true);
            });

            it('returns false when no reply draft exists', () => {
                expect(PRThreadCrudUtils.hasReplyDraft(drafts, 123)).toBe(false);
            });

            it('handles string thread IDs', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'text');
                // Key is built with string concat, so '123' matches
                expect(PRThreadCrudUtils.hasReplyDraft(drafts, '123')).toBe(true);
            });
        });

        describe('hasEditDraft', () => {
            it('returns true when edit draft exists', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'edit\x00123\x00456', 'text');
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 123)).toBe(true);
            });

            it('returns false when no edit draft exists', () => {
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 123)).toBe(false);
            });

            it('finds edit draft among multiple drafts', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'reply');
                PRThreadCrudUtils.saveDraft(drafts, 'edit\x00123\x00789', 'edit');
                PRThreadCrudUtils.saveDraft(drafts, 'edit\x00999\x00111', 'other edit');
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 123)).toBe(true);
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 999)).toBe(true);
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 555)).toBe(false);
            });

            it('does not match reply drafts', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'reply');
                expect(PRThreadCrudUtils.hasEditDraft(drafts, 123)).toBe(false);
            });
        });

        describe('getReplyDraftContent', () => {
            it('returns draft content', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', 'hello world');
                expect(PRThreadCrudUtils.getReplyDraftContent(drafts, 123)).toBe('hello world');
            });

            it('returns empty string for empty draft', () => {
                PRThreadCrudUtils.saveDraft(drafts, 'reply\x00123', '');
                expect(PRThreadCrudUtils.getReplyDraftContent(drafts, 123)).toBe('');
            });

            it('returns null when no draft exists', () => {
                expect(PRThreadCrudUtils.getReplyDraftContent(drafts, 123)).toBeNull();
            });
        });
    });

    // ==================== Mention Resolution ====================

    describe('resolveMentionsForSubmit', () => {
        it('resolves display mentions to IDs', () => {
            const mentionMap = new Map([['John Doe', 'abc-123']]);
            const result = PRThreadCrudUtils.resolveMentionsForSubmit(
                'hello @<John Doe>',
                mentionMap,
                MentionUtils
            );
            expect(result).toBe('hello @<abc-123>');
        });

        it('returns empty string for empty text', () => {
            expect(PRThreadCrudUtils.resolveMentionsForSubmit('', null, MentionUtils)).toBe('');
        });

        it('returns empty string for null text', () => {
            expect(PRThreadCrudUtils.resolveMentionsForSubmit(null, null, MentionUtils)).toBe('');
        });

        it('returns text unchanged when no mentionMap', () => {
            expect(PRThreadCrudUtils.resolveMentionsForSubmit('hello @<John>', null, MentionUtils)).toBe('hello @<John>');
        });

        it('handles multiple mentions', () => {
            const mentionMap = new Map([['Alice', 'id-1'], ['Bob', 'id-2']]);
            const result = PRThreadCrudUtils.resolveMentionsForSubmit(
                '@<Alice> please review with @<Bob>',
                mentionMap,
                MentionUtils
            );
            expect(result).toBe('@<id-1> please review with @<id-2>');
        });

        it('round-trips with resolveIdsToNames', () => {
            const cache = {
                'aaaa1111-2222-3333-4444-555566667777': 'John Doe',
                'bbbb1111-2222-3333-4444-555566667777': 'Jane Smith'
            };
            const original = 'cc @<aaaa1111-2222-3333-4444-555566667777> and @<bbbb1111-2222-3333-4444-555566667777>';
            const { text, mentionMap } = MentionUtils.resolveIdsToNames(original, cache);
            expect(text).toBe('cc @<John Doe> and @<Jane Smith>');

            const submitted = PRThreadCrudUtils.resolveMentionsForSubmit(text, mentionMap, MentionUtils);
            expect(submitted).toBe(original);
        });
    });

    // ==================== Attachment URL Detection ====================

    describe('isADOAttachmentUrl', () => {
        const serverUrl = 'https://dev.azure.com/myorg';

        it('returns true for attachment URLs', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(
                'https://dev.azure.com/myorg/project/_apis/git/repositories/repo/pullRequests/1/attachments/image.png',
                serverUrl
            )).toBe(true);
        });

        it('returns false for non-attachment URLs on same server', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(
                'https://dev.azure.com/myorg/project/_apis/git/repositories/repo/items',
                serverUrl
            )).toBe(false);
        });

        it('returns false for attachment URLs on different server', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(
                'https://other-server.com/attachments/image.png',
                serverUrl
            )).toBe(false);
        });

        it('returns false when serverUrl is null', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(
                'https://dev.azure.com/myorg/attachments/image.png',
                null
            )).toBe(false);
        });

        it('returns false when src is empty', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl('', serverUrl)).toBe(false);
        });

        it('returns false when src is null', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(null, serverUrl)).toBe(false);
        });

        it('works with on-premise ADO server URLs', () => {
            expect(PRThreadCrudUtils.isADOAttachmentUrl(
                'https://ado.mycompany.com/attachments/file.png',
                'https://ado.mycompany.com'
            )).toBe(true);
        });
    });

    // ==================== Title Display ====================

    describe('titleDisplayHtml', () => {
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        it('renders PR ID and title', () => {
            const html = PRThreadCrudUtils.titleDisplayHtml(42, 'Fix bug', escapeHtml);
            expect(html).toContain('PR #42:');
            expect(html).toContain('Fix bug');
        });

        it('escapes HTML in title', () => {
            const html = PRThreadCrudUtils.titleDisplayHtml(1, '<script>alert("xss")</script>', escapeHtml);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('includes edit button', () => {
            const html = PRThreadCrudUtils.titleDisplayHtml(1, 'Title', escapeHtml);
            expect(html).toContain('pr-title-edit-btn');
            expect(html).toContain('onclick="startEditTitle()"');
        });

        it('includes title text span for later replacement', () => {
            const html = PRThreadCrudUtils.titleDisplayHtml(1, 'My Title', escapeHtml);
            expect(html).toContain('id="pr-title-text"');
            expect(html).toContain('>My Title</span>');
        });
    });

    // ==================== File Path Lookup ====================

    describe('getFilePathForThread', () => {
        it('finds file path for a thread', () => {
            const map = new Map([
                ['/src/a.js', [{ id: 1 }, { id: 2 }]],
                ['/src/b.js', [{ id: 3 }]]
            ]);
            expect(PRThreadCrudUtils.getFilePathForThread(map, 3)).toBe('/src/b.js');
        });

        it('returns first matching path', () => {
            const map = new Map([
                ['/src/a.js', [{ id: 1 }]],
                ['/src/b.js', [{ id: 1 }]]  // same thread in renamed file
            ]);
            expect(PRThreadCrudUtils.getFilePathForThread(map, 1)).toBe('/src/a.js');
        });

        it('returns null when thread not found', () => {
            const map = new Map([['/src/a.js', [{ id: 1 }]]]);
            expect(PRThreadCrudUtils.getFilePathForThread(map, 999)).toBeNull();
        });

        it('returns null for empty map', () => {
            expect(PRThreadCrudUtils.getFilePathForThread(new Map(), 1)).toBeNull();
        });

        it('matches by strict equality (number vs string)', () => {
            const map = new Map([['/src/a.js', [{ id: 123 }]]]);
            // id is a number, lookup with number
            expect(PRThreadCrudUtils.getFilePathForThread(map, 123)).toBe('/src/a.js');
            // id is a number, lookup with string — uses ===, so no match
            expect(PRThreadCrudUtils.getFilePathForThread(map, '123')).toBeNull();
        });
    });

    // ==================== Image Paste Helpers ====================

    describe('Image Paste Helpers', () => {
        describe('pastedImageFilename', () => {
            it('generates filename from mime type', () => {
                const name = PRThreadCrudUtils.pastedImageFilename('image/png', 1234567890);
                expect(name).toBe('image-1234567890.png');
            });

            it('handles jpeg', () => {
                const name = PRThreadCrudUtils.pastedImageFilename('image/jpeg', 1000);
                expect(name).toBe('image-1000.jpeg');
            });

            it('defaults to png for unknown mime', () => {
                const name = PRThreadCrudUtils.pastedImageFilename('image/', 1000);
                expect(name).toBe('image-1000.png');
            });
        });

        describe('insertAtCursor', () => {
            it('inserts text at cursor position', () => {
                const result = PRThreadCrudUtils.insertAtCursor('hello world', 5, 5, ' there');
                expect(result.text).toBe('hello there world');
                expect(result.cursorPos).toBe(11);
            });

            it('replaces selected text', () => {
                const result = PRThreadCrudUtils.insertAtCursor('hello world', 0, 5, 'goodbye');
                expect(result.text).toBe('goodbye world');
                expect(result.cursorPos).toBe(7);
            });

            it('appends at end', () => {
                const result = PRThreadCrudUtils.insertAtCursor('hello', 5, 5, '!');
                expect(result.text).toBe('hello!');
                expect(result.cursorPos).toBe(6);
            });

            it('inserts at beginning', () => {
                const result = PRThreadCrudUtils.insertAtCursor('world', 0, 0, 'hello ');
                expect(result.text).toBe('hello world');
                expect(result.cursorPos).toBe(6);
            });

            it('handles empty text', () => {
                const result = PRThreadCrudUtils.insertAtCursor('', 0, 0, 'new');
                expect(result.text).toBe('new');
            });
        });

        describe('replacePlaceholder', () => {
            it('replaces placeholder with final content', () => {
                const text = 'before ![uploading…]() after';
                const result = PRThreadCrudUtils.replacePlaceholder(
                    text, '![uploading…]()', '![image.png](https://example.com/img.png)'
                );
                expect(result).toBe('before ![image.png](https://example.com/img.png) after');
            });

            it('removes placeholder on error', () => {
                const text = 'before ![uploading…]() after';
                const result = PRThreadCrudUtils.replacePlaceholder(text, '![uploading…]()', '');
                expect(result).toBe('before  after');
            });

            it('only replaces first occurrence', () => {
                const text = '![uploading…]() and ![uploading…]()';
                const result = PRThreadCrudUtils.replacePlaceholder(text, '![uploading…]()', '![done]()');
                expect(result).toBe('![done]() and ![uploading…]()');
            });
        });

        describe('markdownImage', () => {
            it('builds markdown image syntax', () => {
                expect(PRThreadCrudUtils.markdownImage('photo.png', 'https://example.com/photo.png'))
                    .toBe('![photo.png](https://example.com/photo.png)');
            });
        });

        describe('imageUploadPlaceholder', () => {
            it('returns the upload placeholder', () => {
                expect(PRThreadCrudUtils.imageUploadPlaceholder()).toBe('![uploading…]()');
            });
        });
    });

    // ==================== Line Comment Context ====================

    describe('addLinePosition', () => {
        it('adds right-side position', () => {
            const ctx = { filePath: '/src/file.js' };
            PRThreadCrudUtils.addLinePosition(ctx, 42, 'right', 80);
            expect(ctx.rightFileStart).toEqual({ line: 42, offset: 1 });
            expect(ctx.rightFileEnd).toEqual({ line: 42, offset: 80 });
            expect(ctx.leftFileStart).toBeUndefined();
        });

        it('adds left-side position', () => {
            const ctx = { filePath: '/src/file.js' };
            PRThreadCrudUtils.addLinePosition(ctx, 10, 'left', 55);
            expect(ctx.leftFileStart).toEqual({ line: 10, offset: 1 });
            expect(ctx.leftFileEnd).toEqual({ line: 10, offset: 55 });
            expect(ctx.rightFileStart).toBeUndefined();
        });

        it('returns the mutated context', () => {
            const ctx = { filePath: '/src/file.js' };
            const result = PRThreadCrudUtils.addLinePosition(ctx, 1, 'right', 10);
            expect(result).toBe(ctx);
        });

        it('offset 1 for empty line (endOffset = lineLen + 1 where lineLen = 0)', () => {
            const ctx = {};
            PRThreadCrudUtils.addLinePosition(ctx, 5, 'right', 1);
            expect(ctx.rightFileEnd).toEqual({ line: 5, offset: 1 });
        });
    });

    // ==================== Content Validation ====================

    describe('isValidCommentContent', () => {
        it('returns true for non-empty content', () => {
            expect(PRThreadCrudUtils.isValidCommentContent('hello')).toBe(true);
        });

        it('returns false for empty string', () => {
            expect(PRThreadCrudUtils.isValidCommentContent('')).toBe(false);
        });

        it('returns false for whitespace-only string', () => {
            expect(PRThreadCrudUtils.isValidCommentContent('   ')).toBe(false);
            expect(PRThreadCrudUtils.isValidCommentContent('\n\t')).toBe(false);
        });

        it('returns false for null', () => {
            expect(PRThreadCrudUtils.isValidCommentContent(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(PRThreadCrudUtils.isValidCommentContent(undefined)).toBe(false);
        });

        it('returns false for non-string types', () => {
            expect(PRThreadCrudUtils.isValidCommentContent(123)).toBe(false);
        });

        it('returns true for content with only whitespace around real text', () => {
            expect(PRThreadCrudUtils.isValidCommentContent('  hello  ')).toBe(true);
        });
    });

    // ==================== Integration Scenarios ====================

    describe('Integration: Draft lifecycle', () => {
        let drafts;

        beforeEach(() => {
            drafts = new Map();
        });

        it('full reply draft lifecycle: open form → type → submit → clear', () => {
            const threadId = 42;
            // 1. Open reply form — mark as open with empty content
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.replyDraftKey(threadId), '');
            expect(PRThreadCrudUtils.hasReplyDraft(drafts, threadId)).toBe(true);
            expect(PRThreadCrudUtils.getReplyDraftContent(drafts, threadId)).toBe('');

            // 2. User types
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.replyDraftKey(threadId), 'looks good!');
            expect(PRThreadCrudUtils.getReplyDraftContent(drafts, threadId)).toBe('looks good!');

            // 3. Submit — clear draft
            PRThreadCrudUtils.clearDraft(drafts, PRThreadCrudUtils.replyDraftKey(threadId));
            expect(PRThreadCrudUtils.hasReplyDraft(drafts, threadId)).toBe(false);
            expect(PRThreadCrudUtils.getReplyDraftContent(drafts, threadId)).toBeNull();
        });

        it('full edit draft lifecycle: start edit → modify → save → clear', () => {
            const threadId = 42;
            const commentId = 101;

            // 1. Start edit — mark form as open
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.editDraftKey(threadId, commentId), '');
            expect(PRThreadCrudUtils.hasEditDraft(drafts, threadId)).toBe(true);

            // 2. User modifies text
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.editDraftKey(threadId, commentId), 'updated text');

            // 3. Save — clear draft
            PRThreadCrudUtils.clearDraft(drafts, PRThreadCrudUtils.editDraftKey(threadId, commentId));
            expect(PRThreadCrudUtils.hasEditDraft(drafts, threadId)).toBe(false);
        });

        it('line comment lifecycle with mentions', () => {
            const filePath = '/src/main.js';
            const formId = 1;
            const lineNum = 25;
            const side = 'right';

            // 1. Open line comment form
            PRThreadCrudUtils.saveDraft(drafts,
                PRThreadCrudUtils.lineDraftKey(formId, filePath, lineNum, side),
                '', { lineLen: 80 }
            );

            // 2. User types comment with mention
            const userText = 'Hey @<John Doe> can you check this?';
            PRThreadCrudUtils.saveDraft(drafts,
                PRThreadCrudUtils.lineDraftKey(formId, filePath, lineNum, side),
                userText
            );

            // 3. Verify it shows in file drafts
            const fileDrafts = PRThreadCrudUtils.getDraftsForFile(drafts, filePath);
            expect(fileDrafts).toHaveLength(1);
            expect(fileDrafts[0].content).toBe(userText);
            expect(fileDrafts[0].lineNum).toBe(25);

            // 4. On submit, resolve mentions
            const mentionMap = new Map([['John Doe', 'abc-123-def']]);
            const resolved = PRThreadCrudUtils.resolveMentionsForSubmit(userText, mentionMap, MentionUtils);
            expect(resolved).toBe('Hey @<abc-123-def> can you check this?');

            // 5. Validate before submit
            expect(PRThreadCrudUtils.isValidCommentContent(resolved)).toBe(true);

            // 6. Build thread context
            const threadContext = { filePath };
            PRThreadCrudUtils.addLinePosition(threadContext, lineNum, side, 81);
            expect(threadContext.rightFileStart).toEqual({ line: 25, offset: 1 });
            expect(threadContext.rightFileEnd).toEqual({ line: 25, offset: 81 });

            // 7. Clear draft after successful submit
            PRThreadCrudUtils.clearDraft(drafts,
                PRThreadCrudUtils.lineDraftKey(formId, filePath, lineNum, side)
            );
            expect(PRThreadCrudUtils.getDraftsForFile(drafts, filePath)).toHaveLength(0);
        });

        it('multiple concurrent drafts on different files', () => {
            // User has drafts open on multiple files simultaneously
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.lineDraftKey(1, '/src/a.js', 10, 'right'), 'fix a');
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.lineDraftKey(2, '/src/b.js', 20, 'left'), 'fix b');
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.fileDraftKey('/src/a.js'), 'general note on a');
            PRThreadCrudUtils.saveDraft(drafts, PRThreadCrudUtils.replyDraftKey(42), 'replying');

            expect(PRThreadCrudUtils.getDraftsForFile(drafts, '/src/a.js')).toHaveLength(2);
            expect(PRThreadCrudUtils.getDraftsForFile(drafts, '/src/b.js')).toHaveLength(1);
            expect(PRThreadCrudUtils.hasReplyDraft(drafts, 42)).toBe(true);

            // Clear one file's drafts
            PRThreadCrudUtils.clearDraft(drafts, PRThreadCrudUtils.lineDraftKey(1, '/src/a.js', 10, 'right'));
            expect(PRThreadCrudUtils.getDraftsForFile(drafts, '/src/a.js')).toHaveLength(1); // file draft remains
        });

        it('image paste flow: insert placeholder → upload → replace', () => {
            const text = 'some existing text';
            const placeholder = PRThreadCrudUtils.imageUploadPlaceholder();

            // 1. Insert placeholder at cursor
            const after = PRThreadCrudUtils.insertAtCursor(text, text.length, text.length, placeholder);
            expect(after.text).toBe('some existing text![uploading…]()');

            // 2. Upload succeeds — replace placeholder
            const fileName = PRThreadCrudUtils.pastedImageFilename('image/png', 1234567890);
            const imgMd = PRThreadCrudUtils.markdownImage(fileName, 'https://ado.com/attachments/image-1234567890.png');
            const final = PRThreadCrudUtils.replacePlaceholder(after.text, placeholder, imgMd);
            expect(final).toBe('some existing text![image-1234567890.png](https://ado.com/attachments/image-1234567890.png)');
        });

        it('image paste failure: remove placeholder', () => {
            const text = 'before ';
            const placeholder = PRThreadCrudUtils.imageUploadPlaceholder();
            const withPlaceholder = PRThreadCrudUtils.insertAtCursor(text, text.length, text.length, placeholder);
            const cleaned = PRThreadCrudUtils.replacePlaceholder(withPlaceholder.text, placeholder, '');
            expect(cleaned).toBe('before ');
        });
    });
});
