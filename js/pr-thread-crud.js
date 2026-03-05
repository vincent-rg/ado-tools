// Comment CRUD, description/title editing, image paste/attachment for ado-pr-threads.html

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
        attachEditPreview(textarea);
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
            if (replyFormThreadObserver) replyFormThreadObserver.disconnect();
            replyFormThreadObserver = new ResizeObserver(() => {
                if (!currentDiffScroller) return;
                const newH = threadEl.getBoundingClientRect().height;
                if (newH > 0 && Math.abs(newH - (row.measuredHeight || 0)) > 1) {
                    row.measuredHeight = newH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
            replyFormThreadObserver.observe(threadEl);
        }
    }

    // Focus after all layout ops so virtual-scroll repositioning doesn't lose focus.
    textarea?.focus();
}

function hideReplyForm(threadId, prefix = '') {
    const container = document.getElementById(`${prefix}reply-form-${threadId}`);
    if (container) container.innerHTML = '';
    const btn = document.getElementById(`${prefix}reply-btn-${threadId}`);
    if (btn) btn.style.display = '';

    // Stop watching and notify scroller the thread shrank back
    if (replyFormThreadObserver) {
        replyFormThreadObserver.disconnect();
        replyFormThreadObserver = null;
    }
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

    const btn = document.getElementById(`${prefix}reply-submit-${threadId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
        await ADOAPI.addComment(currentConfig, currentPRId, threadId, content);
        const saved = saveDiffScroll();
        await refreshThreadsFromAPI();
        restoreDiffScroll(saved);
    } catch (error) {
        console.error('Failed to add reply:', error);
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
        const { update } = attachEditPreview(textarea);
        update();
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
            if (editCommentThreadObserver) editCommentThreadObserver.disconnect();
            editCommentThreadObserver = new ResizeObserver(() => {
                if (!currentDiffScroller) return;
                const newH = threadEl.getBoundingClientRect().height;
                if (newH > 0 && Math.abs(newH - (row.measuredHeight || 0)) > 1) {
                    row.measuredHeight = newH;
                    currentDiffScroller.recalcLayout();
                    diffMinimapInvalidate?.();
                    diffMinimapDraw?.();
                }
            });
            editCommentThreadObserver.observe(threadEl);
        }
    }

    // Focus after all layout ops, with cursor at end of existing content.
    if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
}

function cancelEditComment(threadId, commentId, prefix = '') {
    const contentWrapper = document.getElementById(`${prefix}comment-content-${threadId}-${commentId}`);
    if (!contentWrapper) return;
    const commentDiv = contentWrapper.closest('.comment');

    contentWrapper.innerHTML = contentWrapper.dataset.originalHtml || '';

    const actions = commentDiv?.querySelector('.comment-actions');
    if (actions) actions.style.display = '';

    // Stop watching and notify scroller the thread shrank back
    if (editCommentThreadObserver) {
        editCommentThreadObserver.disconnect();
        editCommentThreadObserver = null;
    }
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

    const btn = document.getElementById(`${prefix}edit-save-${threadId}-${commentId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        await ADOAPI.updateComment(currentConfig, currentPRId, threadId, commentId, content);
        await refreshThreadsFromAPI();
    } catch (error) {
        console.error('Failed to update comment:', error);
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
    return serverUrl && src.startsWith(serverUrl) && src.includes('/attachments/');
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
    return `PR #${prId}: <span id="pr-title-text">${ADOContent.escapeHtml(title)}</span><button class="pr-title-edit-btn" id="pr-title-edit-btn" onclick="startEditTitle()" title="Edit title">&#9998;</button>`;
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

    try {
        await ADOAPI.deleteComment(currentConfig, currentPRId, threadId, commentId);
        const saved = saveDiffScroll();
        await refreshThreadsFromAPI();
        restoreDiffScroll(saved);
    } catch (error) {
        console.error('Failed to delete comment:', error);
        alert(`Failed to delete comment: ${error.message}\n\nNote: This requires a PAT with "Code (Write)" permissions.`);
    }
}

async function toggleCommentLike(threadId, commentId, currentlyLiked) {
    const btn = document.querySelector(
        `.comment[data-thread-id="${threadId}"][data-comment-id="${commentId}"] .comment-like-btn`
    );
    if (btn) btn.disabled = true;
    try {
        if (currentlyLiked) {
            await ADOAPI.unlikeComment(currentConfig, currentPRId, threadId, commentId);
        } else {
            await ADOAPI.likeComment(currentConfig, currentPRId, threadId, commentId);
        }
        const saved = saveDiffScroll();
        await refreshThreadsFromAPI();
        restoreDiffScroll(saved);
    } catch (e) {
        ADOUI.showError('Failed to update like: ' + e.message);
        if (btn) btn.disabled = false;
    }
}

// Convenience aliases for inline view (kept for backward compat with existing onclick handlers)
function showInlineReplyForm(threadId) { showReplyForm(threadId, 'inline-'); }
function hideInlineReplyForm(threadId) { hideReplyForm(threadId, 'inline-'); }
function submitInlineReply(threadId) { return submitReply(threadId, 'inline-'); }
function startInlineEditComment(threadId, commentId) { startEditComment(threadId, commentId, 'inline-'); }
function cancelInlineEditComment(threadId, commentId) { cancelEditComment(threadId, commentId, 'inline-'); }
function saveInlineEditComment(threadId, commentId) { return saveEditComment(threadId, commentId, 'inline-'); }
function deleteInlineComment(threadId, commentId) { return deleteComment(threadId, commentId); }
