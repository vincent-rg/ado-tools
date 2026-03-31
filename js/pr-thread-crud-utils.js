/**
 * PR Thread CRUD Utilities
 * Pure functions extracted from pr-thread-crud.js and ado-pr-threads.html for testability.
 * Covers: draft management, mention resolution for submit, comment payload building,
 * attachment URL detection, title rendering, draft key parsing.
 */

const PRThreadCrudUtils = {
    // ==================== Draft Management ====================

    /**
     * Save a draft entry into the drafts map. Merges with existing entry if present.
     * @param {Map} drafts - The drafts Map
     * @param {string} key - Draft key (e.g. 'reply\x00123', 'edit\x00123\x00456', 'line\x001\x00/file.js\x0042\x00right')
     * @param {string} content - Draft text content
     * @param {object} [meta] - Optional metadata to merge (e.g. { lineLen })
     */
    saveDraft(drafts, key, content, meta) {
        const existing = drafts.get(key) || {};
        drafts.set(key, { ...existing, ...meta, content });
    },

    /**
     * Clear a draft entry from the drafts map.
     * @param {Map} drafts - The drafts Map
     * @param {string} key - Draft key to remove
     */
    clearDraft(drafts, key) {
        drafts.delete(key);
    },

    /**
     * Build a draft key for a reply form.
     * @param {number|string} threadId
     * @returns {string}
     */
    replyDraftKey(threadId) {
        return 'reply\x00' + threadId;
    },

    /**
     * Build a draft key for an edit form.
     * @param {number|string} threadId
     * @param {number|string} commentId
     * @returns {string}
     */
    editDraftKey(threadId, commentId) {
        return 'edit\x00' + threadId + '\x00' + commentId;
    },

    /**
     * Build a draft key for a line comment form.
     * @param {number|string} formId
     * @param {string} filePath
     * @param {number|string} lineNum
     * @param {string} side - 'left' or 'right'
     * @returns {string}
     */
    lineDraftKey(formId, filePath, lineNum, side) {
        return 'line\x00' + formId + '\x00' + filePath + '\x00' + lineNum + '\x00' + side;
    },

    /**
     * Build a draft key for a file-level comment.
     * @param {string} filePath
     * @returns {string}
     */
    fileDraftKey(filePath) {
        return 'file\x00' + filePath;
    },

    /**
     * Build a draft key for a selection comment form.
     * @param {number|string} formId
     * @param {string} filePath
     * @param {number} startLine
     * @param {number} endLine
     * @param {number} startOffset
     * @param {number} endOffset
     * @param {string} side
     * @returns {string}
     */
    selectionDraftKey(formId, filePath, startLine, endLine, startOffset, endOffset, side) {
        return 'sel\x00' + formId + '\x00' + filePath + '\x00' + startLine + '\x00' + endLine + '\x00' + startOffset + '\x00' + endOffset + '\x00' + side;
    },

    /**
     * Parse a draft key into its components.
     * @param {string} key
     * @returns {{ type: string, parts: string[] }}
     */
    parseDraftKey(key) {
        const parts = key.split('\x00');
        return { type: parts[0], parts };
    },

    /**
     * Get all drafts for a given file path from the drafts map.
     * Returns an array of { type, key, content, ...extra } objects.
     * @param {Map} drafts - The drafts Map
     * @param {string} filePath
     * @returns {Array<{type: string, key: string, content: string}>}
     */
    getDraftsForFile(drafts, filePath) {
        const result = [];
        for (const [key, val] of drafts) {
            const parts = key.split('\x00');
            const content = val.content || '';
            if (parts[0] === 'line' && parts[2] === filePath) {
                result.push({ type: 'line', lineNum: parseInt(parts[3]), side: parts[4], key, content });
            } else if (parts[0] === 'sel' && parts[2] === filePath) {
                result.push({ type: 'sel', startLine: parseInt(parts[3]), endLine: parseInt(parts[4]), key, content });
            } else if (parts[0] === 'file' && parts[1] === filePath) {
                result.push({ type: 'file', key, content });
            }
        }
        return result;
    },

    /**
     * Check if a thread has an open reply draft.
     * @param {Map} drafts - The drafts Map
     * @param {number|string} threadId
     * @returns {boolean}
     */
    hasReplyDraft(drafts, threadId) {
        return drafts.has('reply\x00' + threadId);
    },

    /**
     * Check if a thread has any open edit draft.
     * @param {Map} drafts - The drafts Map
     * @param {number|string} threadId
     * @returns {boolean}
     */
    hasEditDraft(drafts, threadId) {
        const prefix = 'edit\x00' + threadId + '\x00';
        for (const key of drafts.keys()) {
            if (key.startsWith(prefix)) return true;
        }
        return false;
    },

    /**
     * Get reply draft content for a thread.
     * @param {Map} drafts - The drafts Map
     * @param {number|string} threadId
     * @returns {string|null} Draft content or null if no draft exists
     */
    getReplyDraftContent(drafts, threadId) {
        const draft = drafts.get('reply\x00' + threadId);
        return draft ? (draft.content || '') : null;
    },

    // ==================== Mention Resolution ====================

    /**
     * Resolve @<DisplayName> mentions in text to @<id> format for API submission.
     * This is the pure logic behind resolveMentionsForSubmit.
     * @param {string} text - The textarea content (trimmed)
     * @param {Map|null} mentionMap - Map<displayName, id> from textarea._mentionMap
     * @param {object} MentionUtils - The MentionUtils module
     * @returns {string} Resolved text ready for API
     */
    resolveMentionsForSubmit(text, mentionMap, MentionUtils) {
        if (!text) return '';
        return MentionUtils.resolveDisplayMentions(text, mentionMap);
    },

    // ==================== Attachment URL Detection ====================

    /**
     * Check if a URL is an ADO attachment URL that needs proxying.
     * @param {string} src - The image src URL
     * @param {string|null} serverUrl - The configured ADO server URL
     * @returns {boolean}
     */
    isADOAttachmentUrl(src, serverUrl) {
        return !!(serverUrl && src && src.startsWith(serverUrl) && src.includes('/attachments/'));
    },

    // ==================== Title Display ====================

    /**
     * Build the HTML for the PR title display (with edit button).
     * @param {number} prId
     * @param {string} title
     * @param {function} escapeHtml - HTML escaping function
     * @returns {string} HTML string
     */
    titleDisplayHtml(prId, title, escapeHtml) {
        return `PR #${prId}: <span id="pr-title-text">${escapeHtml(title)}</span><button class="pr-title-edit-btn" id="pr-title-edit-btn" onclick="startEditTitle()" title="Edit title">&#9998;</button>`;
    },

    // ==================== File Path Lookup ====================

    /**
     * Find the file path for a given thread ID by looking up threadsByFilePath.
     * @param {Map} threadsByFilePath - Map<filePath, thread[]>
     * @param {number|string} threadId
     * @returns {string|null}
     */
    getFilePathForThread(threadsByFilePath, threadId) {
        for (const [fp, threads] of threadsByFilePath) {
            if (threads.some(t => t.id === threadId)) return fp;
        }
        return null;
    },

    // ==================== Image Paste Helpers ====================

    /**
     * Build the placeholder text for an image being uploaded.
     * @returns {string}
     */
    imageUploadPlaceholder() {
        return '![uploading…]()';
    },

    /**
     * Build markdown image text from a file name and URL.
     * @param {string} fileName
     * @param {string} url
     * @returns {string}
     */
    markdownImage(fileName, url) {
        return `![${fileName}](${url})`;
    },

    /**
     * Insert text at cursor position, replacing selection.
     * Returns the new text and cursor position.
     * @param {string} text - Current textarea value
     * @param {number} selectionStart
     * @param {number} selectionEnd
     * @param {string} insertText - Text to insert
     * @returns {{ text: string, cursorPos: number }}
     */
    insertAtCursor(text, selectionStart, selectionEnd, insertText) {
        const newText = text.substring(0, selectionStart) + insertText + text.substring(selectionEnd);
        return { text: newText, cursorPos: selectionStart + insertText.length };
    },

    /**
     * Replace a placeholder string in text with a replacement.
     * @param {string} text
     * @param {string} placeholder
     * @param {string} replacement
     * @returns {string}
     */
    replacePlaceholder(text, placeholder, replacement) {
        return text.replace(placeholder, replacement);
    },

    /**
     * Generate a filename for a pasted image.
     * @param {string} mimeType - e.g. 'image/png'
     * @param {number} timestamp - Date.now() value
     * @returns {string}
     */
    pastedImageFilename(mimeType, timestamp) {
        const ext = mimeType.split('/')[1] || 'png';
        return `image-${timestamp}.${ext}`;
    },

    // ==================== Line Comment Context ====================

    /**
     * Build the threadContext position fields for a line comment.
     * Sets either rightFileStart/End or leftFileStart/End depending on side.
     * @param {object} threadContext - Base threadContext from buildFileCommentContext
     * @param {number} lineNum - 1-based line number
     * @param {string} side - 'left' or 'right'
     * @param {number} endOffset - End character offset (lineLen + 1)
     * @returns {object} Modified threadContext (mutated in place and returned)
     */
    addLinePosition(threadContext, lineNum, side, endOffset) {
        if (side === 'right') {
            threadContext.rightFileStart = { line: lineNum, offset: 1 };
            threadContext.rightFileEnd = { line: lineNum, offset: endOffset };
        } else {
            threadContext.leftFileStart = { line: lineNum, offset: 1 };
            threadContext.leftFileEnd = { line: lineNum, offset: endOffset };
        }
        return threadContext;
    },

    /**
     * Validate comment content is non-empty.
     * @param {string} content - Trimmed content
     * @returns {boolean}
     */
    isValidCommentContent(content) {
        return typeof content === 'string' && content.trim().length > 0;
    }
};

// Browser
if (typeof window !== 'undefined') {
    window.PRThreadCrudUtils = PRThreadCrudUtils;
}

// Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PRThreadCrudUtils;
}
