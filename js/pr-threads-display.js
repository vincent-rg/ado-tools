/**
 * pr-threads-display.js — Pure display helpers extracted from displayResults() in ado-pr-threads.html.
 *
 * All functions are pure (no DOM access, no global mutation) and testable.
 * Dependencies (ADOUI, ADOContent, etc.) are passed via a `deps` parameter.
 */

const PRThreadsDisplay = {
    /**
     * Count threads by status.
     * @param {Array} allThreads - All thread objects
     * @param {object} deps - { isThreadDeleted }
     * @returns {object} Map of status -> count (keys: active, fixed, closed, pending, wontFix, deleted, noStatus)
     */
    countThreadsByStatus(allThreads, deps) {
        const { isThreadDeleted } = deps;
        return allThreads.reduce((acc, thread) => {
            if (isThreadDeleted(thread)) {
                acc.deleted = (acc.deleted || 0) + 1;
            } else if (thread.status === undefined) {
                acc.noStatus = (acc.noStatus || 0) + 1;
            } else {
                const status = thread.status;
                acc[status] = (acc[status] || 0) + 1;
            }
            return acc;
        }, {});
    },

    /**
     * Build avatar HTML for a user.
     * @param {string} userId
     * @param {string} displayName
     * @param {string|null} cachedUrl - Cached avatar URL or null
     * @param {object} deps - { escapeHtml }
     * @param {object} [opts] - { extraClass, showAuthorBadge }
     * @returns {string} Avatar HTML
     */
    buildAvatarHtml(userId, displayName, cachedUrl, deps, opts = {}) {
        const { escapeHtml } = deps;
        if (!userId) return '';
        const title = escapeHtml(displayName || 'Unknown');
        const authorBadge = opts.showAuthorBadge
            ? `<span class="author-badge" title="PR Author"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#323130"/></svg></span>`
            : '';
        const wrapperClass = opts.extraClass ? `avatar-wrapper ${opts.extraClass}` : 'avatar-wrapper';
        if (cachedUrl) {
            return `<${opts.wrapperTag || 'div'} class="${wrapperClass}"><img src="${cachedUrl}" alt="${title}" title="${title}" class="avatar">${authorBadge}</${opts.wrapperTag || 'div'}>`;
        }
        return `<${opts.wrapperTag || 'div'} class="${wrapperClass}"><div class="avatar-placeholder" title="${title}"></div><img data-user-id="${userId}" alt="${title}" title="${title}" class="avatar avatar-pending">${authorBadge}</${opts.wrapperTag || 'div'}>`;
    },

    /**
     * Build the sticky title bar HTML.
     * @param {object} prData
     * @param {string} prUrl
     * @param {object} opts - { statusBadgeHtml, prAuthorAvatarHtml, voteDropdownHtml, statusActionsHtml, autoCompleteHtml, fileCount, currentView }
     * @param {object} deps - { escapeHtml }
     * @returns {string}
     */
    buildTitleBarHtml(prData, prUrl, opts, deps) {
        const { escapeHtml } = deps;
        const { statusBadgeHtml, prAuthorAvatarHtml, voteDropdownHtml, statusActionsHtml, autoCompleteHtml, fileCount, currentView, iterationCount } = opts;
        return `
                <div class="pr-title-bar">
                    <h2 style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                        <span style="display: flex; flex: 1; align-items: center; flex-wrap: wrap; gap: 6px;"><span id="prStatusBadges">${statusBadgeHtml}</span><span id="prStatusActions">${statusActionsHtml}</span>${prAuthorAvatarHtml}<span id="pr-title-display">PR #${prData.pullRequestId}: <span id="pr-title-text">${escapeHtml(prData.title)}</span><button class="pr-title-edit-btn" id="pr-title-edit-btn" onclick="startEditTitle()" title="Edit title">&#9998;</button></span></span>
                        <span style="display: inline-flex; align-items: center; gap: 12px;"><span id="voteDropdownContainer">${voteDropdownHtml}</span><span id="autoCompleteBtnContainer">${autoCompleteHtml}</span><a href="${prUrl}" target="_blank" style="font-size: 14px; color: #0078d4; text-decoration: none; white-space: nowrap;" title="Open PR in Azure DevOps">🔗 View in ADO</a></span>
                    </h2>
                </div>
                <div class="view-tabs">
                    <button class="view-tab${currentView === 'overview' ? ' active' : ''}" data-view="overview" onclick="switchView('overview')">Overview</button>
                    <button class="view-tab${currentView === 'files' ? ' active' : ''}" data-view="files" onclick="switchView('files')">Files (${fileCount})</button>
                    <button class="view-tab${currentView === 'updates' ? ' active' : ''}" data-view="updates" onclick="switchView('updates')">Updates (${iterationCount})</button>
                </div>
            `;
    },

    /**
     * Build PR header details HTML (non-sticky).
     * @param {object} prData
     * @param {object} deps - { formatDate, processContent, escapeHtml }
     * @returns {string}
     */
    buildHeaderHtml(prData, deps) {
        const { formatDate, processContent } = deps;
        const sourceBranch = prData.sourceRefName?.replace('refs/heads/', '') || 'Unknown';
        const targetBranch = prData.targetRefName?.replace('refs/heads/', '') || 'Unknown';
        const descriptionHtml = prData.description
            ? `<div class="pr-description">${processContent(prData.description)}</div>`
            : '<div class="pr-description" style="color: #a19f9d; font-style: italic;">No description</div>';
        return `
                <div class="pr-header">
                    <p><strong>Created:</strong> ${formatDate(prData.creationDate)}</p>
                    <p class="branch-info"><strong>Branches:</strong> <code>${sourceBranch}</code> → <code id="prTargetBranch">${targetBranch}</code></p>
                    <div class="description-card">
                        <div class="description-card-header">
                            <span>Description</span>
                            <button class="description-edit-btn" id="description-edit-btn" onclick="startEditDescription()" title="Edit description">&#9998;</button>
                        </div>
                        <div class="description-card-content" id="pr-description-content">
                            ${descriptionHtml}
                        </div>
                    </div>
                </div>
            `;
    },

    /**
     * Build stats sidebar HTML.
     * @param {object} statusCounts
     * @param {object|null} fileChangeStats - { added, modified, deleted } or null
     * @param {number} iterationCount
     * @param {string} lineStatsMenuHtml
     * @returns {string}
     */
    buildStatsSidebarHtml(statusCounts, fileChangeStats, iterationCount, lineStatsMenuHtml) {
        return `
                <h4>Threads</h4>
                <div id="threadStatsContainer" class="compact-stats">
                    <span title="Active"><span class="thread-status-dot active"></span> <strong>${statusCounts.active || 0}</strong></span>
                    <span title="Resolved"><span class="thread-status-dot fixed"></span> <strong>${statusCounts.fixed || 0}</strong></span>
                    <span title="Closed"><span class="thread-status-dot closed"></span> <strong>${statusCounts.closed || 0}</strong></span>
                    ${statusCounts.pending ? `<span title="Pending"><span class="thread-status-dot pending"></span> <strong>${statusCounts.pending}</strong></span>` : ''}
                    ${statusCounts.wontFix ? `<span title="Won't Fix"><span class="thread-status-dot wontFix"></span> <strong>${statusCounts.wontFix}</strong></span>` : ''}
                    ${statusCounts.deleted ? `<span title="Deleted"><span class="thread-status-dot deleted"></span> <strong>${statusCounts.deleted}</strong></span>` : ''}
                </div>
                <div id="changeStatsContainer">
                ${fileChangeStats ? `
                <h4 style="margin-top: 15px;">Change Stats</h4>
                <div id="fileStatsContainer" class="compact-stats">
                    <span>Files</span>
                    <strong style="color: #107c10;" title="Added">+${fileChangeStats.added}</strong>
                    <strong style="color: #0078d4;" title="Modified">~${fileChangeStats.modified}</strong>
                    <strong style="color: #a4262c;" title="Deleted">-${fileChangeStats.deleted}</strong>
                </div>
                <div id="lineStatsContainer" class="compact-stats">
                    <span>Lines</span>
                    <span style="color: #605e5c;">⏳</span>
                    ${lineStatsMenuHtml}
                </div>
                <div id="updatesStatsContainer" class="compact-stats">
                    <span>Updates</span>
                    <strong>${iterationCount}</strong>
                </div>
                ` : ''}
                </div>
            `;
    },

    /**
     * Build thread status control dropdown HTML.
     * @param {number} threadId
     * @param {*} status - Thread status value
     * @param {boolean} hasStatus
     * @param {object} opts - { isBulkMode, isThreadDeleted, isSystemThread }
     * @returns {string}
     */
    buildStatusControlHtml(threadId, status, hasStatus, opts) {
        const { isBulkMode, isThreadDeleted, isSystemThread } = opts;
        if (isBulkMode || isThreadDeleted || isSystemThread) return '';
        if (hasStatus) {
            return `
                <span class="thread-status-change">
                    <select onchange="changeThreadStatus('${threadId}', this.value); this.blur();">
                        <option value="">Change status...</option>
                        <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="fixed" ${status === 'fixed' ? 'selected' : ''}>Resolved</option>
                        <option value="closed" ${status === 'closed' ? 'selected' : ''}>Closed</option>
                        <option value="wontFix" ${status === 'wontFix' ? 'selected' : ''}>Won't Fix</option>
                        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="unknown" ${status === 'unknown' ? 'selected' : ''}>Unknown</option>
                    </select>
                    <button onclick="removeThreadStatus('${threadId}')" class="btn-secondary" style="margin-left: 5px; padding: 2px 8px; font-size: 12px;" title="Remove status from this thread">✕</button>
                </span>
            `;
        }
        return `
            <span class="thread-status-change">
                <select onchange="changeThreadStatus('${threadId}', this.value); this.blur();">
                    <option value="" selected>Try force status...</option>
                    <option value="active">Active</option>
                    <option value="fixed">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="wontFix">Won't Fix</option>
                    <option value="pending">Pending</option>
                    <option value="unknown">Unknown</option>
                </select>
            </span>
        `;
    },

    /**
     * Build file context preview HTML for a thread.
     * @param {object} thread - Thread object with threadContext
     * @param {number} threadId
     * @param {object} deps - { escapeHtml, escapeJs }
     * @returns {string}
     */
    buildFileContextHtml(thread, threadId, deps) {
        const { escapeHtml, escapeJs } = deps;
        const ctx = thread.threadContext;
        if (!ctx) return '';

        const useRight = !!ctx.rightFileStart;
        const fileStart = useRight ? ctx.rightFileStart : ctx.leftFileStart;
        const fileEnd = useRight ? ctx.rightFileEnd : ctx.leftFileEnd;
        const lineInfo = fileStart ? ` (Line ${fileStart.line}${fileEnd && fileEnd.line !== fileStart.line ? `-${fileEnd.line}` : ''})` : '';

        if (ctx.filePath && fileStart) {
            const firstIterationId = thread.pullRequestThreadContext?.iterationContext?.firstComparingIteration;
            const secondIterationId = thread.pullRequestThreadContext?.iterationContext?.secondComparingIteration;
            const startLine = fileStart.line;
            const endLine = fileEnd ? fileEnd.line : startLine;
            const isIterationRange = firstIterationId != null && secondIterationId != null && firstIterationId !== secondIterationId;
            const oldIterationId = isIterationRange ? firstIterationId : 0;
            const showDiff = secondIterationId && secondIterationId >= 1;
            const iterationLabel = showDiff
                ? ` <span style="color: #605e5c; font-size: 11px;">(${isIterationRange ? `iteration ${firstIterationId}` : 'base'} → iteration ${secondIterationId})</span>`
                : '';
            const onclickHandler = showDiff
                ? `toggleIterationPreview('file-preview-${threadId}', '${escapeJs(ctx.filePath)}', ${oldIterationId}, ${secondIterationId}, ${startLine}, ${endLine}, ${fileStart.offset || 0}, ${fileEnd?.offset || 0}, ${useRight})`
                : `toggleFilePreview('file-preview-${threadId}', '${escapeJs(ctx.filePath)}', ${startLine}, ${endLine}, null, ${secondIterationId !== undefined ? secondIterationId : 'null'}, ${fileStart.offset || 0}, ${fileEnd?.offset || 0}, ${useRight})`;
            return `
                <div class="file-preview">
                    <div class="file-preview-header" onclick="${onclickHandler}">
                        <span>▶</span>
                        <span><strong>File:</strong> ${escapeHtml(ctx.filePath || 'N/A')}${lineInfo}${iterationLabel}${useRight ? '' : ' <span style="color: #a4262c; font-size: 11px;">(deleted)</span>'}</span>
                    </div>
                    <div id="file-preview-${threadId}" class="file-preview-content"></div>
                </div>
            `;
        }
        return `
            <div class="thread-context">
                <strong>File:</strong> ${escapeHtml(ctx.filePath || 'N/A')}${lineInfo}
            </div>
        `;
    },

    /**
     * Classify a comment type into label, CSS class, and badge class.
     * @param {*} commentType
     * @param {boolean} isDeleted
     * @returns {{ label: string, commentClass: string, badgeClass: string }}
     */
    classifyCommentType(commentType, isDeleted) {
        if (isDeleted) {
            return { label: 'Deleted', commentClass: '', badgeClass: 'comment-type-deleted' };
        }
        switch (commentType) {
            case 'system':
            case 3:
                return { label: 'System', commentClass: 'system-comment', badgeClass: 'comment-type-system' };
            case 'codeChange':
            case 2:
                return { label: 'Code Change', commentClass: 'code-change-comment', badgeClass: 'comment-type-code-change' };
            case 'text':
            case 1:
                return { label: 'Text', commentClass: '', badgeClass: 'comment-type-text' };
            default:
                return { label: 'Unknown', commentClass: '', badgeClass: '' };
        }
    },

    /**
     * Build comment action buttons HTML (review, like, copy URL, edit, delete).
     * @param {object} comment
     * @param {object} thread
     * @param {object} opts - { threadId, currentUserId, showCommentActions, isCommentReviewed }
     * @param {object} deps - { escapeHtml }
     * @returns {string}
     */
    buildCommentActionsHtml(comment, thread, opts, deps) {
        const { escapeHtml } = deps;
        const { threadId, currentUserId, showCommentActions, isCommentReviewed } = opts;
        if (!showCommentActions) return '';

        let reviewButtonHtml = '';
        if (currentUserId && comment.author?.id !== currentUserId) {
            const pubMs = new Date(comment.publishedDate).getTime();
            if (isCommentReviewed) {
                reviewButtonHtml = `<button class="comment-action-btn review-btn reviewed" title="Mark unread" onclick="markCommentUnread(${threadId}, ${pubMs})">✓</button>`;
            } else {
                reviewButtonHtml = `<button class="comment-action-btn review-btn" title="Mark reviewed" onclick="markCommentReviewed(${threadId}, ${pubMs})">Mark reviewed</button>`;
            }
        }

        const likedUsers = comment.usersLiked || [];
        const likeCount = likedUsers.length;
        const userLiked = likedUsers.some(u => u.id === currentUserId);
        const filePath = thread.threadContext?.filePath || null;

        return `
            <span class="comment-actions">
                ${reviewButtonHtml}
                <button class="comment-like-btn${userLiked ? ' liked' : ''}" onclick="toggleCommentLike(${threadId}, ${comment.id}, ${userLiked})" title="${userLiked ? 'Unlike' : 'Like'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="${userLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>${likeCount > 0 ? `<span>${likeCount}</span>` : ''}</button>
                <button class="comment-action-btn comment-copy-url-btn" data-thread-id="${threadId}" onclick="copyCommentUrl(${threadId}, ${escapeHtml(JSON.stringify(filePath))})" title="Copy link"><svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg></button>
                <button class="comment-action-btn" onclick="startEditComment(${threadId}, ${comment.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                <button class="comment-action-btn delete" onclick="deleteComment(${threadId}, ${comment.id})" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
            </span>
        `;
    },

    /**
     * Build thread controls HTML (unread dot, links, status badge, status dropdown).
     * @param {object} threadHeaderData
     * @param {boolean} hasUnread
     * @returns {string}
     */
    buildThreadControlsHtml(threadHeaderData, hasUnread) {
        const unreadDot = hasUnread
            ? `<span class="thread-unread-dot" title="Has unread comments">✉</span>`
            : '';
        return `
            <span class="thread-controls">
                ${unreadDot}
                <a href="${threadHeaderData.threadUrl}" target="_blank" class="thread-link" title="Open thread in Azure DevOps (${threadHeaderData.hasFileContext ? 'files tab' : 'overview tab'})">🔗</a>
                <a href="${threadHeaderData.apiEndpoint}" target="_blank" class="thread-link" title="Open REST API response (requires authentication)">📡</a>
                ${threadHeaderData.hasStatus ? `<span class="badge ${threadHeaderData.statusClass}">${threadHeaderData.statusText}</span>` : ''}
                ${threadHeaderData.statusControl}
            </span>
        `;
    },

    /**
     * Build a single comment's header HTML.
     * @param {object} comment
     * @param {object} opts - { isFirstComment, threadHeaderData, commentAvatarHtml, iterationLinks, filePath, commentTypeInfo, editDeleteButtons, threadControls }
     * @param {object} deps - { formatDate, escapeJs }
     * @returns {string}
     */
    buildCommentHeaderHtml(comment, opts, deps) {
        const { formatDate, escapeJs } = deps;
        const { isFirstComment, threadHeaderData, commentAvatarHtml, iterationLinks, filePath, commentTypeInfo, editDeleteButtons, threadControls } = opts;

        const iterationLinksHtml = iterationLinks.completeLink ? `
            <span class="code-links">
                ${iterationLinks.beforeLink ? `<span class="iteration-range">${iterationLinks.beforeRange}</span><button type="button" class="comment-link" title="Open file view: updates 1–${iterationLinks.beforeIterEnd}" onclick="openCommentInFilesView('${escapeJs(filePath || '')}', ${threadHeaderData.threadId}, ${iterationLinks.beforeIterStart}, ${iterationLinks.beforeIterEnd})"><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>` : ''}
                ${iterationLinks.afterLink ? `<button type="button" class="comment-link" title="Open file view: updates ${iterationLinks.afterIterStart}–${iterationLinks.afterIterEnd}" onclick="openCommentInFilesView('${escapeJs(filePath || '')}', ${threadHeaderData.threadId}, ${iterationLinks.afterIterStart}, ${iterationLinks.afterIterEnd})"><svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg></button><span class="iteration-range">${iterationLinks.afterRange}</span>` : ''}
                <button type="button" class="comment-link" title="Open file view: all updates" onclick="openCommentInFilesView('${escapeJs(filePath || '')}', ${threadHeaderData.threadId}, ${iterationLinks.completeIterStart}, ${iterationLinks.completeIterEnd})"><svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg></button><span class="iteration-range">${iterationLinks.completeRange}</span>
            </span>
            ` : '';

        const typeBadge = commentTypeInfo.label !== 'Text'
            ? `<span class="comment-type-badge ${commentTypeInfo.badgeClass}">${commentTypeInfo.label}</span>`
            : '';
        // Show type badge for deleted or non-Text
        const showTypeBadge = comment.isDeleted || commentTypeInfo.label !== 'Text';

        return `
            <div class="comment-header">
                <span class="comment-author-info">
                    ${isFirstComment && threadHeaderData.isBulkMode ? `<input type="checkbox" class="thread-checkbox" id="thread-checkbox-${threadHeaderData.threadId}" data-thread-id="${threadHeaderData.threadId}" ${threadHeaderData.isChecked} onchange="toggleThreadSelection('${threadHeaderData.threadId}')" style="margin-right: 8px;">` : ''}
                    ${commentAvatarHtml}
                    <span class="comment-date">${formatDate(comment.publishedDate)}</span>
                    ${iterationLinksHtml}
                    ${showTypeBadge ? `<span class="comment-type-badge ${commentTypeInfo.badgeClass}">${commentTypeInfo.label}</span>` : ''}
                </span>
                ${editDeleteButtons}
                ${threadControls}
            </div>`;
    },

    /**
     * Build iteration change divider HTML (inserted between comments when the file changed).
     * @param {string} filePath
     * @param {number} threadId
     * @param {number} commentIdx
     * @param {number} prevIterationId
     * @param {number} currentIterationId
     * @param {object} fileStart - { line }
     * @param {object|null} fileEnd - { line } or null
     * @param {boolean} useRight
     * @param {object} deps - { escapeHtml, escapeJs }
     * @returns {string}
     */
    buildIterationDividerHtml(filePath, threadId, commentIdx, prevIterationId, currentIterationId, fileStart, fileEnd, useRight, deps) {
        const { escapeHtml, escapeJs } = deps;
        const previewId = `iteration-preview-${threadId}-${commentIdx}`;
        const startLine = fileStart.line;
        const endLine = fileEnd ? fileEnd.line : startLine;
        const iterLineInfo = ` (Line ${startLine}${endLine !== startLine ? `-${endLine}` : ''})`;

        return `
            <div class="file-preview" style="margin: 12px 0;">
                <div class="file-preview-header" onclick="toggleIterationPreview('${previewId}', '${escapeJs(filePath)}', ${prevIterationId}, ${currentIterationId}, ${startLine}, ${endLine}, 0, 0, ${useRight})">
                    <span>▶</span>
                    <span><strong>File changed:</strong> ${escapeHtml(filePath)}${iterLineInfo} <span style="color: #605e5c; font-size: 11px;">(iteration ${prevIterationId} → ${currentIterationId})</span></span>
                </div>
                <div id="${previewId}" class="file-preview-content"></div>
            </div>
        `;
    },

    /**
     * Build a single comment HTML block.
     * @param {object} comment
     * @param {number} commentIdx
     * @param {object} thread
     * @param {object} opts - { threadId, isFirstComment, threadHeaderData, filePath, currentUserId, reviewTimestamps }
     * @param {object} deps - { escapeHtml, escapeJs, formatDate, processContent, getCachedAvatar, isCommentReviewed, threadHasUnread, getIterationLinksForComment }
     * @returns {{ html: string, isCodeSuggestion: boolean }}
     */
    buildCommentHtml(comment, commentIdx, thread, opts, deps) {
        const { threadId, isFirstComment, threadHeaderData, filePath, currentUserId, reviewTimestamps, iterations } = opts;
        const { escapeHtml, escapeJs, formatDate, processContent, getCachedAvatar, isCommentReviewed, threadHasUnread, getIterationLinksForComment } = deps;

        // Code suggestion detection and content sanitization
        const isCodeSuggestion = comment.content?.includes('```suggestion');
        let contentToProcess = comment.content;
        if (isCodeSuggestion) {
            contentToProcess = contentToProcess.replace(/```suggestion\n[\s\S]*?\n```/g, '');
        }
        let resolvedContent = processContent(contentToProcess);
        const contentStripped = resolvedContent.replace(/<pre><code><\/code><\/pre>/g, '').trim();
        const hasRealContent = contentStripped.length > 0;

        // Iteration links
        const iterationLinks = getIterationLinksForComment(comment, thread, iterations, isFirstComment);

        // Comment type classification
        const isDeleted = comment.isDeleted === true;
        const commentTypeInfo = PRThreadsDisplay.classifyCommentType(comment.commentType || 'unknown', isDeleted);
        const isSystemComment = (comment.commentType === 'system' || comment.commentType === 3);
        const showCommentActions = !isDeleted && !isSystemComment;

        // Avatar
        const isPRAuthor = comment.author?.id === threadHeaderData.prAuthorId;
        const commentAvatarHtml = PRThreadsDisplay.buildAvatarHtml(
            comment.author?.id,
            comment.author?.displayName,
            getCachedAvatar(comment.author?.id),
            { escapeHtml },
            { showAuthorBadge: isPRAuthor }
        );

        // Action buttons
        const isReviewed = isCommentReviewed(comment, threadId, reviewTimestamps);
        const editDeleteButtons = PRThreadsDisplay.buildCommentActionsHtml(comment, thread, {
            threadId, currentUserId, showCommentActions, isCommentReviewed: isReviewed
        }, { escapeHtml });

        // Thread controls (first comment only)
        let threadControls = '';
        if (isFirstComment) {
            const hasUnread = threadHasUnread(thread, reviewTimestamps, currentUserId);
            threadControls = PRThreadsDisplay.buildThreadControlsHtml(threadHeaderData, hasUnread);
        }

        // Escaped content for data attribute
        const escapedContent = (comment.content || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Comment header
        const commentHeaderHtml = PRThreadsDisplay.buildCommentHeaderHtml(comment, {
            isFirstComment,
            threadHeaderData,
            commentAvatarHtml,
            iterationLinks,
            filePath,
            commentTypeInfo,
            editDeleteButtons,
            threadControls
        }, { formatDate, escapeJs });

        const html = `
            <div class="comment ${commentTypeInfo.commentClass}" data-thread-id="${threadId}" data-comment-id="${comment.id}" data-comment-content="${escapedContent}">
                ${commentHeaderHtml}
                <div class="comment-content-wrapper" id="comment-content-${threadId}-${comment.id}">
                    ${hasRealContent ? `<div class="comment-content">${resolvedContent}</div>` : ''}
                </div>

                ${isCodeSuggestion ? `<div id="code-suggestion-${threadId}-${commentIdx}" data-thread-id="${threadId}" data-comment-idx="${commentIdx}"><div style="padding: 12px; color: #858585;">Loading code suggestion...</div></div>` : ''}
            </div>
        `;

        return { html, isCodeSuggestion };
    },

    /**
     * Build the full thread list HTML from an array of filtered threads.
     * @param {Array} threads - Filtered threads to display
     * @param {object} opts - { isBulkMode, selectedThreadIds, currentUserId, reviewTimestamps, iterations, prData, config }
     * @param {object} deps - { escapeHtml, escapeJs, formatDate, processContent, getCachedAvatar, isCommentReviewed, threadHasUnread, getIterationLinksForComment, getLastIterationBeforeTime, isThreadDeleted, getStatusBadgeClass, getStatusText, buildThreadUrl }
     * @returns {string}
     */
    buildThreadListHtml(threads, opts, deps) {
        const { isBulkMode, selectedThreadIds, currentUserId, reviewTimestamps, iterations, prData, config } = opts;
        const { escapeHtml, escapeJs, isThreadDeleted, getStatusBadgeClass, getStatusText, buildThreadUrl, getLastIterationBeforeTime, getIterationLinksForComment } = deps;

        if (threads.length === 0) {
            return '<div class="info">No threads found for this Pull Request.</div>';
        }

        let html = '<div class="thread-container">';
        const sortedIterations = iterations.length > 0
            ? [...iterations].sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate))
            : [];

        threads.forEach((thread) => {
            const hasStatus = thread.status !== undefined;
            const status = thread.status;
            const threadDeleted = isThreadDeleted(thread);
            const statusClass = getStatusBadgeClass(status, threadDeleted);
            const statusText = getStatusText(status, threadDeleted);
            const threadId = thread.id;
            const threadUrl = buildThreadUrl(config, prData.pullRequestId, threadId, thread.threadContext?.filePath);
            const apiEndpoint = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prData.pullRequestId}/threads/${threadId}?api-version=6.0`;
            const isChecked = selectedThreadIds.has(threadId) ? 'checked' : '';
            const firstComment = thread.comments && thread.comments[0];
            const isSystemThread = firstComment && (firstComment.commentType === 'system' || firstComment.commentType === 3);

            const statusControl = PRThreadsDisplay.buildStatusControlHtml(threadId, status, hasStatus, {
                isBulkMode, isThreadDeleted: threadDeleted, isSystemThread
            });

            const threadHeaderData = {
                isBulkMode,
                isChecked,
                threadUrl,
                apiEndpoint,
                threadId,
                hasFileContext: !!thread.threadContext,
                hasStatus,
                statusClass,
                statusText,
                statusControl,
                prAuthorId: prData.createdBy?.id
            };

            html += '<div class="thread">';
            html += PRThreadsDisplay.buildFileContextHtml(thread, threadId, { escapeHtml, escapeJs });

            // Comments
            if (thread.comments && thread.comments.length > 0) {
                let prevCommentIterationId = null;
                const filePath = thread.threadContext?.filePath || null;
                const ctx = thread.threadContext;
                const fileStart = ctx?.rightFileStart || ctx?.leftFileStart;
                const fileEnd = ctx?.rightFileEnd || ctx?.leftFileEnd;
                const useRight = !!ctx?.rightFileStart;

                thread.comments.forEach((comment, commentIdx) => {
                    const isFirstComment = commentIdx === 0;

                    // Iteration change divider
                    if (filePath && fileStart && sortedIterations.length > 0) {
                        const commentTime = new Date(comment.publishedDate);
                        const lastIterBefore = getLastIterationBeforeTime(sortedIterations, commentTime);
                        const currentIterationId = lastIterBefore ? lastIterBefore.id : sortedIterations[0].id;

                        if (prevCommentIterationId !== null && currentIterationId !== prevCommentIterationId) {
                            html += PRThreadsDisplay.buildIterationDividerHtml(
                                filePath, threadId, commentIdx, prevCommentIterationId, currentIterationId,
                                fileStart, fileEnd, useRight, { escapeHtml, escapeJs }
                            );
                        }
                        prevCommentIterationId = currentIterationId;
                    }

                    const result = PRThreadsDisplay.buildCommentHtml(comment, commentIdx, thread, {
                        threadId, isFirstComment, threadHeaderData, filePath, currentUserId, reviewTimestamps, iterations
                    }, deps);
                    html += result.html;
                });
            }

            // Reply button
            if (!threadDeleted && !isSystemThread) {
                html += `
                    <div class="thread-reply-container">
                        <button class="thread-reply-btn" onclick="showReplyForm(${threadId})" id="reply-btn-${threadId}">Reply</button>
                        <div id="reply-form-${threadId}"></div>
                    </div>
                `;
            }

            html += '</div>';
        });

        html += '</div>';
        return html;
    }
};

// Browser
if (typeof window !== 'undefined') {
    window.PRThreadsDisplay = PRThreadsDisplay;
}

// Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PRThreadsDisplay };
}
