// Comment CRUD, description/title editing, image paste/attachment for ado-pr-threads.html
// Debug logging: enable per-flow in Settings > Debug Logging, or set window._adoDebug = true in DevTools.
if (typeof window._adoOpSeq === 'undefined') window._adoOpSeq = 0;

function showReplyForm(threadId, prefix = '') {
    const container = document.getElementById(`${prefix}reply-form-${threadId}`);
    const btn = document.getElementById(`${prefix}reply-btn-${threadId}`);
    if (!container || container.querySelector('.comment-editor')) return;
    if (btn) btn.style.display = 'none';

    container.innerHTML = `
        <div class="comment-editor">
            <textarea id="${prefix}reply-content-${threadId}" placeholder="Write a reply..."></textarea>
            <div class="comment-editor-actions">
                <button class="btn-cancel" onclick="hideReplyForm(${threadId}, '${prefix}')">Cancel</button>
                <button class="btn-save" onclick="submitReply(${threadId}, '${prefix}')" id="${prefix}reply-submit-${threadId}">Reply</button>
            </div>
        </div>
    `;

    const textarea = document.getElementById(`${prefix}reply-content-${threadId}`);
    if (textarea) {
        MentionAutocomplete.attach(textarea);
        attachImagePaste(textarea);
        attachFormattingToolbar(textarea);
        attachEditPreview(textarea);
        const _k = 'reply\x00' + threadId;
        saveDraft(_k, commentDrafts.get(_k)?.content ?? ''); // mark form as open immediately
        if (commentDrafts.has(_k)) textarea.value = commentDrafts.get(_k).content || '';
        textarea.addEventListener('input', () => saveDraft(_k, textarea.value));
    }

    // Notify virtual scroller that this thread row grew, and watch for further
    // height changes as the textarea grows / preview toggles (same pattern as insertFormRow).
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByThreadId(threadId);
        const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
        if (row && threadEl) {
            row.measuredHeight = null;
            currentDiffScroller.recalcLayout();
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            replyFormObservers.get(threadId)?.disconnect();
            const obs = new ResizeObserver(() => {
                if (!currentDiffScroller) return;
                const newH = threadEl.getBoundingClientRect().height;
                if (newH > 0 && Math.abs(newH - (row.measuredHeight || 0)) > 1) {
                    row.measuredHeight = newH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
            replyFormObservers.set(threadId, obs);
            obs.observe(threadEl);
        }
    }

    // Focus after all layout ops so virtual-scroll repositioning doesn't lose focus.
    textarea?.focus();

    // Show draft indicator in file tree
    updateFileTreeDraftInfo(getFilePathForThread(threadId));
}

function hideReplyForm(threadId, prefix = '') {
    const container = document.getElementById(`${prefix}reply-form-${threadId}`);
    if (container) container.innerHTML = '';
    const btn = document.getElementById(`${prefix}reply-btn-${threadId}`);
    if (btn) btn.style.display = '';

    // Stop watching and notify scroller the thread shrank back
    const _replyFilePath = getFilePathForThread(threadId);
    replyFormObservers.get(threadId)?.disconnect();
    replyFormObservers.delete(threadId);
    clearDraft('reply\x00' + threadId);
    updateFileTreeDraftInfo(_replyFilePath);
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByThreadId(threadId);
        if (row) {
            row.measuredHeight = null;
            currentDiffScroller.recalcLayout();
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
            requestAnimationFrame(() => {
                if (!currentDiffScroller || !threadEl) return;
                const actualH = threadEl.getBoundingClientRect().height;
                if (actualH > 0 && actualH !== row.measuredHeight) {
                    row.measuredHeight = actualH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
        }
    }
}

async function submitReply(threadId, prefix = '') {
    const content = resolveMentionsForSubmit(document.getElementById(`${prefix}reply-content-${threadId}`));
    if (!content) { alert('Please enter a reply.'); return; }

    const _opId = ++window._adoOpSeq;
    if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] submitReply start threadId=${threadId} prefix="${prefix}" t=${Date.now()}`);

    const btn = document.getElementById(`${prefix}reply-submit-${threadId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
        clearDraft('reply\x00' + threadId);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] addComment API start t=${Date.now()}`);
        await ADOAPI.addComment(currentConfig, currentPRId, threadId, content);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] addComment API done t=${Date.now()}`);
        const saved = saveDiffScroll();
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] refreshThreadsFromAPI start t=${Date.now()}`);
        await refreshThreadsFromAPI();
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] refreshThreadsFromAPI done t=${Date.now()}`);
        restoreDiffScroll(saved);
    } catch (error) {
        console.error('Failed to add reply:', error);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] ERROR resetting button t=${Date.now()}`, error.message);
        alert(`Failed to add reply: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        if (btn) { btn.disabled = false; btn.textContent = 'Reply'; }
    }
}

function startEditComment(threadId, commentId, prefix = '') {
    const contentWrapper = document.getElementById(`${prefix}comment-content-${threadId}-${commentId}`);
    if (!contentWrapper) return;
    const commentDiv = contentWrapper.closest('.comment');
    const originalContent = commentDiv?.dataset.commentContent || '';
    const resolved = MentionUtils.resolveIdsToNames(originalContent, identityCache);
    const escapedContent = resolved.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    contentWrapper.dataset.originalHtml = contentWrapper.innerHTML;

    contentWrapper.innerHTML = `
        <div class="comment-editor">
            <textarea id="${prefix}edit-content-${threadId}-${commentId}">${escapedContent}</textarea>
            <div class="comment-editor-actions">
                <button class="btn-cancel" onclick="cancelEditComment(${threadId}, ${commentId}, '${prefix}')">Cancel</button>
                <button class="btn-save" onclick="saveEditComment(${threadId}, ${commentId}, '${prefix}')" id="${prefix}edit-save-${threadId}-${commentId}">Save</button>
            </div>
        </div>
    `;

    const textarea = document.getElementById(`${prefix}edit-content-${threadId}-${commentId}`);
    if (textarea) {
        textarea._mentionMap = resolved.mentionMap;
        MentionAutocomplete.attach(textarea);
        attachImagePaste(textarea);
        attachFormattingToolbar(textarea);
        const { update } = attachEditPreview(textarea);
        update();
        const _k = 'edit\x00' + threadId + '\x00' + commentId;
        const existingDraft = commentDrafts.get(_k);
        saveDraft(_k, existingDraft?.content ?? ''); // mark form as open immediately
        if (existingDraft?.content) textarea.value = existingDraft.content;
        textarea.addEventListener('input', () => saveDraft(_k, textarea.value));
    }

    const actions = commentDiv?.querySelector('.comment-actions');
    if (actions) actions.style.display = 'none';

    // Watch for height changes while the editor is open (textarea grow, preview toggle)
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByThreadId(threadId);
        const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
        if (row && threadEl) {
            row.measuredHeight = null;
            currentDiffScroller.recalcLayout();
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            const obsKey = threadId + '-' + commentId;
            editCommentObservers.get(obsKey)?.disconnect();
            const obs = new ResizeObserver(() => {
                if (!currentDiffScroller) return;
                const newH = threadEl.getBoundingClientRect().height;
                if (newH > 0 && Math.abs(newH - (row.measuredHeight || 0)) > 1) {
                    row.measuredHeight = newH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
            editCommentObservers.set(obsKey, obs);
            obs.observe(threadEl);
        }
    }

    // Focus after all layout ops, with cursor at end of existing content.
    if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    updateFileTreeDraftInfo(getFilePathForThread(threadId));
}

function cancelEditComment(threadId, commentId, prefix = '') {
    const contentWrapper = document.getElementById(`${prefix}comment-content-${threadId}-${commentId}`);
    if (!contentWrapper) return;
    const commentDiv = contentWrapper.closest('.comment');

    contentWrapper.innerHTML = contentWrapper.dataset.originalHtml || '';

    const actions = commentDiv?.querySelector('.comment-actions');
    if (actions) actions.style.display = '';

    // Stop watching and notify scroller the thread shrank back
    const _obsKey = threadId + '-' + commentId;
    const _editFilePath = getFilePathForThread(threadId);
    editCommentObservers.get(_obsKey)?.disconnect();
    editCommentObservers.delete(_obsKey);
    clearDraft('edit\x00' + threadId + '\x00' + commentId);
    updateFileTreeDraftInfo(_editFilePath);
    if (currentDiffScroller) {
        const row = currentDiffScroller.getRowByThreadId(threadId);
        if (row) {
            row.measuredHeight = null;
            currentDiffScroller.recalcLayout();
            diffMinimapInvalidate?.();
            diffMinimapDraw?.();
            const threadEl = document.querySelector(`.inline-thread[data-thread-id="${threadId}"]`);
            requestAnimationFrame(() => {
                if (!currentDiffScroller || !threadEl) return;
                const actualH = threadEl.getBoundingClientRect().height;
                if (actualH > 0 && actualH !== row.measuredHeight) {
                    row.measuredHeight = actualH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
        }
    }
}

async function saveEditComment(threadId, commentId, prefix = '') {
    const content = resolveMentionsForSubmit(document.getElementById(`${prefix}edit-content-${threadId}-${commentId}`));
    if (!content) { alert('Comment cannot be empty.'); return; }

    const _opId = ++window._adoOpSeq;
    if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] saveEditComment start threadId=${threadId} commentId=${commentId} t=${Date.now()}`);

    const btn = document.getElementById(`${prefix}edit-save-${threadId}-${commentId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        clearDraft('edit\x00' + threadId + '\x00' + commentId);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] updateComment start t=${Date.now()}`);
        await ADOAPI.updateComment(currentConfig, currentPRId, threadId, commentId, content);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] updateComment done, refreshThreadsFromAPI start t=${Date.now()}`);
        await refreshThreadsFromAPI();
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] refreshThreadsFromAPI done t=${Date.now()}`);
    } catch (error) {
        console.error('Failed to update comment:', error);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] ERROR resetting button t=${Date.now()}`, error.message);
        alert(`Failed to update comment: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}

function startEditDescription() {
    const contentEl = document.getElementById('pr-description-content');
    const editBtn = document.getElementById('description-edit-btn');
    if (!contentEl) return;

    contentEl.dataset.originalHtml = contentEl.innerHTML;
    const resolved = MentionUtils.resolveIdsToNames(currentPRData.description || '', identityCache);
    const escapedDescription = resolved.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    contentEl.innerHTML = `
        <div class="comment-editor">
            <textarea id="edit-description-textarea">${escapedDescription}</textarea>
            <div class="comment-editor-actions">
                <button class="btn-cancel" onclick="cancelEditDescription()">Cancel</button>
                <button class="btn-save" id="edit-description-save" onclick="saveEditDescription()">Save</button>
            </div>
        </div>
    `;

    if (editBtn) editBtn.style.display = 'none';
    const textarea = document.getElementById('edit-description-textarea');
    if (textarea) {
        textarea._mentionMap = resolved.mentionMap;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        MentionAutocomplete.attach(textarea);
        attachImagePaste(textarea);
        attachFormattingToolbar(textarea);
        const { update } = attachEditPreview(textarea);
        update();
    }
}

let editPreviewCounter = 0;

function attachEditPreview(textarea) {
    if (!textarea) return;
    const previewId = `edit-preview-${++editPreviewCounter}`;
    const previewDiv = document.createElement('div');
    previewDiv.className = 'edit-preview';
    previewDiv.innerHTML = `
        <div class="edit-preview-header">Preview</div>
        <div class="edit-preview-content comment-content" id="${previewId}">
            <span style="color: #a19f9d; font-style: italic;">Nothing to preview</span>
        </div>
    `;
    const editor = textarea.closest('.comment-editor');
    if (editor) {
        editor.insertAdjacentElement('afterend', previewDiv);
    }
    const update = () => {
        const previewEl = document.getElementById(previewId);
        if (!previewEl) return;
        const text = MentionUtils.resolveDisplayMentions(textarea.value, textarea._mentionMap);
        previewEl.innerHTML = text
            ? ADOContent.processContent(text)
            : '<span style="color: #a19f9d; font-style: italic;">Nothing to preview</span>';
    };
    textarea.addEventListener('input', update);
    return { previewId, update };
}


// One global mousedown listener to close heading dropdowns when clicking outside.
if (!window._mdHeadingDropdownListenerAttached) {
    window._mdHeadingDropdownListenerAttached = true;
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.md-heading-wrap')) {
            document.querySelectorAll('.md-heading-dropdown').forEach(d => { d.style.display = 'none'; });
        }
    }, true);
}

function attachFormattingToolbar(textarea) {
    const editor = textarea.closest('.comment-editor');
    if (!editor || editor.querySelector('.md-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'md-toolbar';
    toolbar.innerHTML = `
        <button type="button" class="md-btn" title="Bold" data-action="bold">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <text x="2" y="13" font-family="Georgia,serif" font-size="14" font-weight="900" fill="currentColor">B</text>
            </svg>
        </button>
        <button type="button" class="md-btn" title="Italic" data-action="italic">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <text x="4" y="13" font-family="Georgia,serif" font-size="14" font-style="italic" fill="currentColor">I</text>
            </svg>
        </button>
        <button type="button" class="md-btn" title="Inline code" data-action="code">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M5 4.5L1.5 8 5 11.5M11 4.5L14.5 8 11 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <button type="button" class="md-btn" title="Code block" data-action="codeblock">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5.5 6.5L3.5 8.5 5.5 10.5M10.5 6.5L12.5 8.5 10.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <span class="md-toolbar-sep"></span>
        <button type="button" class="md-btn" title="Link" data-action="link">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6.5 9.5a3.54 3.54 0 0 0 5 .12l1.5-1.5a3.54 3.54 0 0 0-5-5L7 4.17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M9.5 6.5a3.54 3.54 0 0 0-5-.12L3 7.88a3.54 3.54 0 0 0 5 5L9 11.83" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
        <button type="button" class="md-btn" title="Image" data-action="image">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="6" r="1.2" fill="currentColor"/>
                <path d="M1.5 11.5l3.5-3.5 2.5 2.5 2-2 4.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <span class="md-toolbar-sep"></span>
        <button type="button" class="md-btn" title="Blockquote" data-action="quote">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="2" height="11" rx="1" fill="currentColor"/>
                <path d="M5.5 5h8M5.5 8h6M5.5 11h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
        <div class="md-heading-wrap">
            <button type="button" class="md-btn md-heading-btn" title="Heading">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 3.5v9M13.5 3.5v9M2.5 8h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <svg width="7" height="7" viewBox="0 0 8 8" fill="none" class="md-chevron" aria-hidden="true">
                    <path d="M1.5 2.5l2.5 3 2.5-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div class="md-heading-dropdown" style="display:none;">
                <button type="button" class="md-heading-item" data-heading="1">H1</button>
                <button type="button" class="md-heading-item" data-heading="2">H2</button>
                <button type="button" class="md-heading-item" data-heading="3">H3</button>
                <button type="button" class="md-heading-item" data-heading="4">H4</button>
                <button type="button" class="md-heading-item" data-heading="5">H5</button>
                <button type="button" class="md-heading-item" data-heading="6">H6</button>
                <div class="md-heading-sep"></div>
                <button type="button" class="md-heading-item" data-heading="0">None</button>
            </div>
        </div>
    `;

    toolbar.addEventListener('mousedown', (e) => {
        // Prevent textarea from losing focus
        e.preventDefault();
    });

    toolbar.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            applyFormattingAction(textarea, actionBtn.dataset.action);
            return;
        }
        if (e.target.closest('.md-heading-btn')) {
            const dropdown = toolbar.querySelector('.md-heading-dropdown');
            dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
            return;
        }
        const headingItem = e.target.closest('.md-heading-item');
        if (headingItem) {
            applyHeadingLevel(textarea, parseInt(headingItem.dataset.heading, 10));
            toolbar.querySelector('.md-heading-dropdown').style.display = 'none';
        }
    });

    // Insert toolbar between textarea and action buttons
    const actions = editor.querySelector('.comment-editor-actions');
    if (actions) {
        editor.insertBefore(toolbar, actions);
    } else {
        editor.appendChild(toolbar);
    }
}

// Replace textarea[replaceFrom..replaceTo] with text, then position cursor.
// Uses execCommand('insertText') so the edit lands on the browser undo/redo stack.
function mdInsert(textarea, replaceFrom, replaceTo, text, newSelStart, newSelEnd) {
    textarea.focus();
    textarea.setSelectionRange(replaceFrom, replaceTo);
    if (!document.execCommand('insertText', false, text)) {
        // Fallback (execCommand not supported in this context)
        const v = textarea.value;
        textarea.value = v.substring(0, replaceFrom) + text + v.substring(replaceTo);
    }
    textarea.setSelectionRange(Math.max(0, newSelStart), Math.max(0, newSelEnd));
    textarea.dispatchEvent(new Event('input'));
}

function applyHeadingLevel(textarea, level) {
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const before = textarea.value.substring(0, s);

    const lineStart = before.lastIndexOf('\n') + 1;
    const linePrefix = before.substring(lineStart);
    const headingMatch = linePrefix.match(/^(#{1,6}) /);
    const currentLen = headingMatch ? headingMatch[1].length + 1 : 0;

    if (level === 0) {
        mdInsert(textarea, lineStart, s, linePrefix.substring(currentLen),
            Math.max(lineStart, s - currentLen), Math.max(lineStart, e - currentLen));
    } else {
        const newPrefix = '#'.repeat(level) + ' ';
        const delta = newPrefix.length - currentLen;
        mdInsert(textarea, lineStart, s, newPrefix + linePrefix.substring(currentLen),
            s + delta, e + delta);
    }
}

function applyFormattingAction(textarea, action) {
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const sel = textarea.value.substring(s, e);
    const before = textarea.value.substring(0, s);
    const after = textarea.value.substring(e);

    switch (action) {
        case 'bold':
            if (sel) mdInsert(textarea, s, e, `**${sel}**`, e + 4, e + 4);
            else     mdInsert(textarea, s, s, `****`,       s + 2, s + 2);
            break;
        case 'italic':
            if (sel) mdInsert(textarea, s, e, `*${sel}*`, e + 2, e + 2);
            else     mdInsert(textarea, s, s, `**`,       s + 1, s + 1);
            break;
        case 'code':
            if (sel) mdInsert(textarea, s, e, `\`${sel}\``, e + 2, e + 2);
            else     mdInsert(textarea, s, s, `\`\``,       s + 1, s + 1);
            break;
        case 'codeblock': {
            const pre = (before === '' || before.endsWith('\n')) ? '' : '\n';
            const suf = (after === '' || after.startsWith('\n')) ? '' : '\n';
            if (sel) mdInsert(textarea, s, e, `${pre}\`\`\`\n${sel}\n\`\`\`${suf}`,
                s + pre.length + 4 + sel.length + 1, s + pre.length + 4 + sel.length + 1);
            else     mdInsert(textarea, s, s, `${pre}\`\`\`\n\n\`\`\`${suf}`,
                s + pre.length + 4, s + pre.length + 4);
            break;
        }
        case 'link':
            if (sel) mdInsert(textarea, s, e, `[${sel}](url)`,  s + sel.length + 3, s + sel.length + 6);
            else     mdInsert(textarea, s, s, `[text](url)`,    s + 1, s + 5);
            break;
        case 'image':
            if (sel) mdInsert(textarea, s, e, `![${sel}](url)`, s + sel.length + 4, s + sel.length + 7);
            else     mdInsert(textarea, s, s, `![alt](url)`,    s + 2, s + 5);
            break;
        case 'quote': {
            const lineStart = before.lastIndexOf('\n') + 1;
            const linePrefix = before.substring(lineStart);
            if (linePrefix.startsWith('> '))
                mdInsert(textarea, lineStart, s, linePrefix.substring(2), s - 2, e - 2);
            else
                mdInsert(textarea, lineStart, s, `> ${linePrefix}`,       s + 2, e + 2);
            break;
        }
        default:
            return;
    }
}

function attachImagePaste(textarea) {
    textarea.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
        if (!imageItem) return;

        e.preventDefault();

        const blob = imageItem.getAsFile();
        if (!blob) return;

        const ext = blob.type.split('/')[1] || 'png';
        const fileName = `image-${Date.now()}.${ext}`;
        const placeholder = `![uploading…]()`;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + placeholder + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
        textarea.dispatchEvent(new Event('input'));

        try {
            const prId = currentPRData?.pullRequestId;
            if (!prId || !currentConfig) throw new Error('PR not loaded');

            const attachment = await ADOAPI.uploadAttachment(currentConfig, prId, fileName, blob);
            const markdownImg = `![${fileName}](${attachment.url})`;
            textarea.value = textarea.value.replace(placeholder, markdownImg);
            textarea.dispatchEvent(new Event('input'));
        } catch (err) {
            textarea.value = textarea.value.replace(placeholder, '');
            textarea.dispatchEvent(new Event('input'));
            alert(`Failed to upload image: ${err.message}`);
        }
    });
}

// Proxy ADO attachment images through the local server (they require PAT auth)
const attachmentBlobCache = new Map();

function isADOAttachmentUrl(src) {
    const serverUrl = currentConfig?.serverUrl || ADOConfig.get()?.serverUrl;
    return PRThreadCrudUtils.isADOAttachmentUrl(src, serverUrl);
}

async function loadAttachmentImage(img) {
    const src = img.getAttribute('src');
    if (!src || !isADOAttachmentUrl(src)) return;

    if (attachmentBlobCache.has(src)) {
        img.src = attachmentBlobCache.get(src);
        return;
    }

    try {
        const config = currentConfig || ADOConfig.get();
        if (!config?.pat) return;

        const response = await fetch(`/attachment?url=${encodeURIComponent(src)}`, {
            headers: { 'X-ADO-PAT': config.pat }
        });

        if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            attachmentBlobCache.set(src, blobUrl);
            img.src = blobUrl;
        }
    } catch (e) {
        console.warn('Failed to load attachment image:', e);
    }
}

const attachmentImageObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.tagName === 'IMG') {
                loadAttachmentImage(node);
            } else {
                node.querySelectorAll('img').forEach(loadAttachmentImage);
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    attachmentImageObserver.observe(document.body, { childList: true, subtree: true });
    applyDiffFontSize();
});

function cancelEditDescription() {
    const contentEl = document.getElementById('pr-description-content');
    const editBtn = document.getElementById('description-edit-btn');
    if (!contentEl) return;

    contentEl.innerHTML = contentEl.dataset.originalHtml || '';
    if (editBtn) editBtn.style.display = '';
}

async function saveEditDescription() {
    const textarea = document.getElementById('edit-description-textarea');
    const btn = document.getElementById('edit-description-save');
    if (!textarea) return;

    const description = resolveMentionsForSubmit(textarea);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        await ADOAPI.updatePRDescription(currentConfig, currentPRId, description);
        currentPRData.description = description;

        const contentEl = document.getElementById('pr-description-content');
        const editBtn = document.getElementById('description-edit-btn');
        if (contentEl) {
            contentEl.innerHTML = description
                ? `<div class="pr-description">${ADOContent.processContent(description)}</div>`
                : '<div class="pr-description" style="color: #a19f9d; font-style: italic;">No description</div>';
        }
        if (editBtn) editBtn.style.display = '';
    } catch (error) {
        console.error('Failed to update description:', error);
        alert(`Failed to update description: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}

function titleDisplayHtml(prId, title) {
    return PRThreadCrudUtils.titleDisplayHtml(prId, title, ADOContent.escapeHtml);
}

function startEditTitle() {
    const titleDisplay = document.getElementById('pr-title-display');
    if (!titleDisplay) return;

    titleDisplay.innerHTML = `
        PR #${currentPRData.pullRequestId}:&nbsp;<input type="text" id="pr-title-input" /><button class="pr-title-action-btn save" id="pr-title-save-btn" onclick="saveEditTitle()" title="Save"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="pr-title-action-btn cancel" onclick="cancelEditTitle()" title="Cancel"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    `;
    const input = document.getElementById('pr-title-input');
    if (input) {
        input.value = currentPRData.title || '';
        input.focus();
        input.select();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveEditTitle();
            if (e.key === 'Escape') cancelEditTitle();
        });
    }
}

function cancelEditTitle() {
    const titleDisplay = document.getElementById('pr-title-display');
    if (!titleDisplay) return;
    titleDisplay.innerHTML = titleDisplayHtml(currentPRData.pullRequestId, currentPRData.title);
}

async function saveEditTitle() {
    const input = document.getElementById('pr-title-input');
    const btn = document.getElementById('pr-title-save-btn');
    if (!input) return;

    const newTitle = input.value.trim();
    if (!newTitle) { alert('Title cannot be empty.'); input.focus(); return; }
    if (newTitle === currentPRData.title) { cancelEditTitle(); return; }

    if (btn) btn.disabled = true;

    try {
        await ADOAPI.updatePRTitle(currentConfig, currentPRId, newTitle);
        currentPRData.title = newTitle;
        document.title = `PR #${currentPRData.pullRequestId}: ${newTitle}`;
        const titleDisplay = document.getElementById('pr-title-display');
        if (titleDisplay) titleDisplay.innerHTML = titleDisplayHtml(currentPRData.pullRequestId, newTitle);
    } catch (error) {
        console.error('Failed to update title:', error);
        alert(`Failed to update title: ${error.message}`);
        if (btn) btn.disabled = false;
    }
}

async function deleteComment(threadId, commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    const _opId = ++window._adoOpSeq;
    if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] deleteComment start threadId=${threadId} commentId=${commentId} t=${Date.now()}`);

    try {
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] deleteComment API start t=${Date.now()}`);
        await ADOAPI.deleteComment(currentConfig, currentPRId, threadId, commentId);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] deleteComment API done, refreshThreadsFromAPI start t=${Date.now()}`);
        const saved = saveDiffScroll();
        await refreshThreadsFromAPI();
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] refreshThreadsFromAPI done t=${Date.now()}`);
        restoreDiffScroll(saved);
    } catch (error) {
        console.error('Failed to delete comment:', error);
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] ERROR t=${Date.now()}`, error.message);
        alert(`Failed to delete comment: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    }
}

async function toggleCommentLike(threadId, commentId, currentlyLiked) {
    const btn = document.querySelector(
        `.comment[data-thread-id="${threadId}"][data-comment-id="${commentId}"] .comment-like-btn`
    );
    if (btn) btn.disabled = true;
    const _opId = ++window._adoOpSeq;
    if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] toggleCommentLike threadId=${threadId} commentId=${commentId} liked=${currentlyLiked} t=${Date.now()}`);
    try {
        if (currentlyLiked) {
            await ADOAPI.unlikeComment(currentConfig, currentPRId, threadId, commentId);
        } else {
            await ADOAPI.likeComment(currentConfig, currentPRId, threadId, commentId);
        }
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] like API done, refreshThreadsFromAPI start t=${Date.now()}`);
        const saved = saveDiffScroll();
        await refreshThreadsFromAPI();
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] refreshThreadsFromAPI done t=${Date.now()}`);
        restoreDiffScroll(saved);
    } catch (e) {
        if (window._adoDebugReply) console.log(`[REPLY op#${_opId}] ERROR t=${Date.now()}`, e.message);
        ADOUI.showError('Failed to update like: ' + e.message);
        if (btn) btn.disabled = false;
    }
}

function copyCommentUrl(threadId, filePath) {
    const url = ADOURL.buildThreadUrl(currentConfig, currentPRData.pullRequestId, threadId, filePath || null);
    navigator.clipboard.writeText(url).then(() => {
        const btns = document.querySelectorAll(`.comment-copy-url-btn[data-thread-id="${threadId}"]`);
        btns.forEach(btn => {
            btn.title = 'Copied!';
            btn.classList.add('copied');
            const bubble = document.createElement('span');
            bubble.className = 'copied-bubble';
            bubble.textContent = 'Copied!';
            btn.style.position = 'relative';
            btn.appendChild(bubble);
            setTimeout(() => {
                btn.title = 'Copy link';
                btn.classList.remove('copied');
                bubble.remove();
            }, 1500);
        });
    }).catch(() => {});
}

/**
 * Toggle the nth markdown checkbox (0-based) within a markdown string.
 */
function toggleNthCheckbox(markdown, n) {
    let count = 0;
    return markdown.replace(/^([ \t]*- \[)([ xX])(\] .*)$/gm, (match, prefix, state, suffix) => {
        if (count++ === n) {
            return `${prefix}${state === ' ' ? 'x' : ' '}${suffix}`;
        }
        return match;
    });
}

/**
 * Called when a markdown task-list checkbox is clicked.
 * Persists the toggle via the API and re-renders the content on success.
 */
async function toggleMarkdownCheckbox(checkbox) {
    const checkboxIndex = parseInt(checkbox.dataset.checkboxIndex);
    const isChecked = checkbox.checked;

    checkbox.disabled = true;

    const commentEl = checkbox.closest('.comment[data-comment-id]');
    if (commentEl) {
        if (commentEl.querySelector('.comment-editor')) {
            checkbox.checked = !isChecked;
            checkbox.disabled = false;
            return;
        }
        const threadId = parseInt(commentEl.dataset.threadId);
        const commentId = parseInt(commentEl.dataset.commentId);
        const rawContent = commentEl.dataset.commentContent || '';
        const newContent = toggleNthCheckbox(rawContent, checkboxIndex);
        try {
            await ADOAPI.updateComment(currentConfig, currentPRId, threadId, commentId, newContent);
            commentEl.dataset.commentContent = newContent;
            const wrapper = document.getElementById(`comment-content-${threadId}-${commentId}`);
            if (wrapper) {
                wrapper.innerHTML = ADOContent.processContent(newContent);
            }
        } catch (error) {
            console.error('Failed to update checkbox:', error);
            checkbox.checked = !isChecked;
            checkbox.disabled = false;
        }
        return;
    }

    const descEl = checkbox.closest('#pr-description-content');
    if (descEl) {
        if (descEl.querySelector('.comment-editor')) {
            checkbox.checked = !isChecked;
            checkbox.disabled = false;
            return;
        }
        const rawContent = (typeof currentPRData !== 'undefined' && currentPRData?.description) || '';
        const newContent = toggleNthCheckbox(rawContent, checkboxIndex);
        try {
            await ADOAPI.updatePRDescription(currentConfig, currentPRId, newContent);
            if (typeof currentPRData !== 'undefined') currentPRData.description = newContent;
            const contentEl = document.getElementById('pr-description-content');
            if (contentEl) {
                contentEl.innerHTML = newContent
                    ? `<div class="pr-description">${ADOContent.processContent(newContent)}</div>`
                    : '<div class="pr-description" style="color: #a19f9d; font-style: italic;">No description</div>';
            }
        } catch (error) {
            console.error('Failed to update checkbox:', error);
            checkbox.checked = !isChecked;
            checkbox.disabled = false;
        }
        return;
    }

    // Not in an editable context — revert
    checkbox.checked = !isChecked;
    checkbox.disabled = true;
}

// Convenience aliases for inline view (kept for backward compat with existing onclick handlers)
function showInlineReplyForm(threadId) { showReplyForm(threadId, 'inline-'); }
function hideInlineReplyForm(threadId) { hideReplyForm(threadId, 'inline-'); }
function submitInlineReply(threadId) { return submitReply(threadId, 'inline-'); }
function startInlineEditComment(threadId, commentId) { startEditComment(threadId, commentId, 'inline-'); }
function cancelInlineEditComment(threadId, commentId) { cancelEditComment(threadId, commentId, 'inline-'); }
function saveInlineEditComment(threadId, commentId) { return saveEditComment(threadId, commentId, 'inline-'); }
function deleteInlineComment(threadId, commentId) { return deleteComment(threadId, commentId); }
