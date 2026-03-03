// Reviewer rendering and management for ado-pr-threads.html

// ==================== Reviewer Rendering ====================

function getActiveThreadCounts(threads) {
    return PRThreadsUtils.getActiveThreadCounts(threads);
}

function renderAvatarWithBadges(user, vote, threadCount, isPRAuthor = false) {
    const initials = user.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const displayName = ADOContent.escapeHtml(user.displayName);

    // Vote info
    let voteClass = '';
    let voteText = '';
    let voteIcon = '';
    const svgSize = 10;
    const svgAttrs = `xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="white"`;
    if (vote !== undefined) {
        switch (vote) {
            case 10:
                voteClass = 'vote-approved';
                voteText = 'Approved';
                voteIcon = `<svg ${svgAttrs}><path d="M13.5 2.5l-7.5 9-3.5-3.5-2 2 5.5 5.5 9.5-11.5z"/></svg>`;
                break;
            case 5:
                voteClass = 'vote-approved-suggestions';
                voteText = 'Approved with suggestions';
                voteIcon = `<svg ${svgAttrs}><path d="M9 2h-2v7h2zM9 11h-2v2h2z"/></svg>`;
                break;
            case -5:
                voteClass = 'vote-wait';
                voteText = 'Waiting for author';
                voteIcon = `<svg ${svgAttrs}><path d="M8 4v4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M8 8l2.5 3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
                break;
            case -10:
                voteClass = 'vote-rejected';
                voteText = 'Rejected';
                voteIcon = `<svg ${svgAttrs}><path d="M3 3l10 10M13 3l-10 10" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
                break;
            default:
                voteClass = 'vote-no-vote';
                voteText = 'No vote';
        }
    }

    const title = vote !== undefined ? `${displayName} - ${voteText}` : displayName;

    let avatarHtml;
    if (user.id) {
        const cachedUrl = AvatarLoader.getCached(user.id);
        if (cachedUrl) {
            avatarHtml = `<img src="${cachedUrl}" alt="${title}" title="${title}" class="avatar">`;
        } else {
            avatarHtml = `<div class="avatar-placeholder" title="${title}"></div><img data-user-id="${user.id}" alt="${title}" title="${title}" class="avatar avatar-pending">`;
        }
    } else {
        avatarHtml = `<div class="avatar-fallback" title="${title}">${initials}</div>`;
    }

    // Vote badge (bottom-left)
    let voteBadgeHtml = '';
    if (voteIcon) {
        voteBadgeHtml = `<span class="vote-badge ${voteClass}">${voteIcon}</span>`;
    }

    // Thread count badge (top-right)
    let threadBadgeHtml = '';
    if (threadCount && threadCount > 0) {
        threadBadgeHtml = `<span class="thread-badge" title="${threadCount} active thread${threadCount > 1 ? 's' : ''}">${threadCount}</span>`;
    }

    // PR Author badge (top-left)
    let authorBadgeHtml = '';
    if (isPRAuthor) {
        authorBadgeHtml = `<span class="author-badge" title="PR Author"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#323130"/></svg></span>`;
    }

    return `<div class="avatar-wrapper" data-user-id="${user.id || ''}">${avatarHtml}${voteBadgeHtml}${threadBadgeHtml}${authorBadgeHtml}</div>`;
}

function renderReviewerWithDropdown(reviewer, vote, threadCount, isPRAuthor, isRequired) {
    const avatarHtml = renderAvatarWithBadges(reviewer, vote, threadCount, isPRAuthor);
    const reviewerId = reviewer.id;
    const displayName = ADOContent.escapeHtml(reviewer.displayName);
    const toggleText = isRequired ? 'Make Optional' : 'Make Required';
    const toggleRequired = !isRequired;

    return `
        <div class="reviewer-avatar-wrapper" onclick="toggleReviewerDropdown(event, this)">
            ${avatarHtml}
            <div class="reviewer-dropdown">
                <button class="reviewer-dropdown-item" onclick="event.stopPropagation(); toggleReviewerRequired('${reviewerId}', ${toggleRequired})">${toggleText}</button>
                <button class="reviewer-dropdown-item danger" onclick="event.stopPropagation(); removeReviewer('${reviewerId}', '${displayName}')">Remove</button>
            </div>
        </div>
    `;
}

function renderReviewersSection(reviewers, threadCounts, prAuthorId) {
    let html = '';

    // Separate required and optional reviewers
    const requiredReviewers = (reviewers || []).filter(r => r.isRequired);
    const optionalReviewers = (reviewers || []).filter(r => !r.isRequired);

    // Always show Required Reviewers section with inline add
    const requiredAvatarsHtml = requiredReviewers.map(r => {
        const count = threadCounts[r.id] || 0;
        return renderReviewerWithDropdown(r, r.vote, count, r.id === prAuthorId, true);
    }).join('');

    html += `
        <div class="avatars-section">
            <h4><span>Required Reviewers</span> <button class="add-reviewer-inline-btn" onclick="toggleInlineReviewerSearch('required')" title="Add required reviewer">+</button></h4>
            <div id="reviewerSearchRequired" class="inline-reviewer-search" style="display: none;">
                <input type="text" placeholder="Search by name or email..." oninput="searchReviewersInline(this.value, 'required')">
                <div class="inline-search-results"></div>
            </div>
            <div id="requiredReviewersAvatars" class="avatars-container">${requiredAvatarsHtml || '<span class="no-reviewers">None</span>'}</div>
        </div>
    `;

    // Always show Optional Reviewers section with inline add
    const optionalAvatarsHtml = optionalReviewers.map(r => {
        const count = threadCounts[r.id] || 0;
        return renderReviewerWithDropdown(r, r.vote, count, r.id === prAuthorId, false);
    }).join('');

    html += `
        <div class="avatars-section">
            <h4><span>Optional Reviewers</span> <button class="add-reviewer-inline-btn" onclick="toggleInlineReviewerSearch('optional')" title="Add optional reviewer">+</button></h4>
            <div id="reviewerSearchOptional" class="inline-reviewer-search" style="display: none;">
                <input type="text" placeholder="Search by name or email..." oninput="searchReviewersInline(this.value, 'optional')">
                <div class="inline-search-results"></div>
            </div>
            <div id="optionalReviewersAvatars" class="avatars-container">${optionalAvatarsHtml || '<span class="no-reviewers">None</span>'}</div>
        </div>
    `;

    return html;
}

function renderOtherAuthorsSection(threads, reviewers, threadCounts, prAuthorId) {
    // Get all unique thread authors who are not reviewers
    // Only include authors with at least one "real" comment (not system/codeChange)
    const reviewerIds = new Set((reviewers || []).map(r => r.id));
    const otherAuthors = new Map();

    threads.forEach(thread => {
        if (PRThreadsUtils.isThreadDeleted(thread)) return;
        const firstComment = thread.comments && thread.comments[0];
        const author = firstComment?.author;
        const commentType = firstComment?.commentType;

        // Skip system (3/'system') and codeChange (2/'codeChange') comments
        const isRealComment = commentType === 1 || commentType === 'text';

        if (author && author.id && isRealComment && !reviewerIds.has(author.id) && !otherAuthors.has(author.id)) {
            otherAuthors.set(author.id, author);
        }
    });

    if (otherAuthors.size === 0) {
        return '';
    }

    const avatarsHtml = Array.from(otherAuthors.values()).map(author => {
        const count = threadCounts[author.id] || 0;
        return renderAvatarWithBadges(author, undefined, count, author.id === prAuthorId);
    }).join('');

    return `
        <div class="avatars-section">
            <h4>Other Thread Authors</h4>
            <div class="avatars-container">${avatarsHtml}</div>
        </div>
    `;
}

// ==================== Reviewer Management ====================

let reviewerSearchTimeout = null;
let currentSearchType = null; // 'required' or 'optional'
let reviewerDropdownOpen = false;

function toggleReviewerDropdown(event, wrapper) {
    event.stopPropagation();
    const dropdown = wrapper.querySelector('.reviewer-dropdown');
    const wasOpen = dropdown.classList.contains('open');

    // Close all other dropdowns
    closeAllReviewerDropdowns();

    if (!wasOpen) {
        dropdown.classList.add('open');
        reviewerDropdownOpen = true;
    }
}

function closeAllReviewerDropdowns() {
    document.querySelectorAll('.reviewer-dropdown.open').forEach(d => d.classList.remove('open'));
    reviewerDropdownOpen = false;
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.reviewer-avatar-wrapper')) {
        closeAllReviewerDropdowns();
    }
});

function toggleInlineReviewerSearch(type) {
    const requiredSearch = document.getElementById('reviewerSearchRequired');
    const optionalSearch = document.getElementById('reviewerSearchOptional');

    // Close the other search if open
    if (type === 'required' && optionalSearch) {
        optionalSearch.style.display = 'none';
        optionalSearch.querySelector('input').value = '';
        optionalSearch.querySelector('.inline-search-results').innerHTML = '';
    } else if (type === 'optional' && requiredSearch) {
        requiredSearch.style.display = 'none';
        requiredSearch.querySelector('input').value = '';
        requiredSearch.querySelector('.inline-search-results').innerHTML = '';
    }

    // Toggle current search
    const searchDiv = type === 'required' ? requiredSearch : optionalSearch;
    if (searchDiv) {
        const isVisible = searchDiv.style.display !== 'none';
        searchDiv.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            searchDiv.querySelector('input').focus();
            currentSearchType = type;
        } else {
            searchDiv.querySelector('input').value = '';
            searchDiv.querySelector('.inline-search-results').innerHTML = '';
            currentSearchType = null;
        }
    }
}

function hideInlineReviewerSearch() {
    const requiredSearch = document.getElementById('reviewerSearchRequired');
    const optionalSearch = document.getElementById('reviewerSearchOptional');

    [requiredSearch, optionalSearch].forEach(div => {
        if (div) {
            div.style.display = 'none';
            div.querySelector('input').value = '';
            div.querySelector('.inline-search-results').innerHTML = '';
        }
    });
    currentSearchType = null;
}

function searchReviewersInline(query, type) {
    clearTimeout(reviewerSearchTimeout);

    const searchDiv = document.getElementById(type === 'required' ? 'reviewerSearchRequired' : 'reviewerSearchOptional');
    const resultsDiv = searchDiv?.querySelector('.inline-search-results');
    if (!resultsDiv) return;

    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    resultsDiv.innerHTML = '<div style="padding: 4px; color: #605e5c; font-size: 11px;">Searching...</div>';

    reviewerSearchTimeout = setTimeout(async () => {
        try {
            const identities = await ADOAPI.searchIdentities(currentConfig, query);

            if (identities.length === 0) {
                resultsDiv.innerHTML = '<div style="padding: 4px; color: #605e5c; font-size: 11px;">No users found</div>';
                return;
            }

            // Filter out users already in reviewers list
            const existingReviewerIds = new Set((currentPRData.reviewers || []).map(r => r.id));
            const filteredIdentities = identities.filter(i => !existingReviewerIds.has(i.localId));

            if (filteredIdentities.length === 0) {
                resultsDiv.innerHTML = '<div style="padding: 4px; color: #605e5c; font-size: 11px;">All matching users are already reviewers</div>';
                return;
            }

            const isRequired = type === 'required';
            resultsDiv.innerHTML = filteredIdentities.map(identity => {
                const name = ADOContent.escapeHtml(identity.displayName || 'Unknown');
                const email = ADOContent.escapeHtml(identity.mail || '');
                const id = (identity.localId || '').replace(/'/g, "\\'");
                const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                return `
                    <div class="inline-search-result" onclick="addReviewer('${id}', ${isRequired})">
                        <div class="avatar-fallback" style="width: 24px; height: 24px; font-size: 9px;">${initials}</div>
                        <div>
                            <div class="result-name">${name}</div>
                            ${email ? `<div class="result-email">${email}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Failed to search identities:', error);
            resultsDiv.innerHTML = `<div style="padding: 4px; color: #a4262c; font-size: 11px;">Search failed: ${ADOContent.escapeHtml(error.message)}</div>`;
        }
    }, 300);
}

async function addReviewer(reviewerId, isRequired) {
    try {
        await ADOAPI.addReviewer(currentConfig, currentPRId, reviewerId, isRequired);

        // Refresh PR data to get updated reviewers list
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);

        // Update reviewers display
        updateReviewersDisplay();

        // Hide the inline search
        hideInlineReviewerSearch();

    } catch (error) {
        alert(`Failed to add reviewer: ${error.message}\n\nNote: This requires a PAT with appropriate permissions.`);
    }
}

async function removeReviewer(reviewerId, displayName) {
    const confirmed = confirm(`Are you sure you want to remove ${displayName} as a reviewer?`);
    if (!confirmed) return;

    try {
        await ADOAPI.removeReviewer(currentConfig, currentPRId, reviewerId);

        // Refresh PR data to get updated reviewers list
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);

        // Update reviewers display and vote dropdown (removing self resets vote)
        updateReviewersDisplay();
        updateVoteDropdown();

    } catch (error) {
        alert(`Failed to remove reviewer: ${error.message}\n\nNote: This requires a PAT with appropriate permissions.`);
    }
}

function isCurrentUserReviewer() {
    if (!currentUserId || !currentPRData?.reviewers) return false;
    return currentPRData.reviewers.some(r => r.id === currentUserId);
}

function renderVoteDropdown(currentVote) {
    if (!currentUserId) return '';

    const voteOptions = [
        { value: 0, label: 'No vote', cls: '' },
        { value: 10, label: 'Approve', cls: 'vote-active-approved' },
        { value: 5, label: 'Approve with suggestions', cls: 'vote-active-suggestions' },
        { value: -5, label: 'Wait for author', cls: 'vote-active-waiting' },
        { value: -10, label: 'Reject', cls: 'vote-active-rejected' },
    ];

    const activeOption = voteOptions.find(o => o.value === currentVote) || voteOptions[0];
    const selectClass = activeOption.cls ? ` ${activeOption.cls}` : '';
    const notReviewer = !isCurrentUserReviewer();
    const notReviewerClass = notReviewer ? ' vote-not-reviewer' : '';
    const notReviewerTitle = notReviewer ? ' title="Voting will add you as an optional reviewer"' : '';

    const optionsHtml = voteOptions.map(opt => {
        const selected = opt.value === currentVote ? ' selected' : '';
        return `<option value="${opt.value}"${selected}>${opt.label}</option>`;
    }).join('');

    return `<select id="voteDropdown" class="vote-select${selectClass}${notReviewerClass}"${notReviewerTitle} onchange="setOwnVote(parseInt(this.value))">${optionsHtml}</select>`;
}

function getCurrentUserVote() {
    if (!currentUserId || !currentPRData?.reviewers) return 0;
    const self = currentPRData.reviewers.find(r => r.id === currentUserId);
    return self ? (self.vote || 0) : 0;
}

function updateVoteDropdown() {
    const container = document.getElementById('voteDropdownContainer');
    if (!container) return;
    container.innerHTML = renderVoteDropdown(getCurrentUserVote());
}

async function setOwnVote(vote) {
    if (!currentUserId) return;
    // If the user isn't a reviewer yet and selects "No vote", there's nothing to do
    if (vote === 0 && !isCurrentUserReviewer()) return;
    const select = document.getElementById('voteDropdown');
    if (select) select.disabled = true;
    try {
        const selfReviewer = currentPRData?.reviewers?.find(r => r.id === currentUserId);
        const isRequired = selfReviewer?.isRequired || false;
        await ADOAPI.setReviewerVote(currentConfig, currentPRId, currentUserId, vote, isRequired);

        // Refresh PR data to get updated reviewers list
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);

        // Update vote dropdown styling and reviewers display
        updateVoteDropdown();
        updateReviewersDisplay();
    } catch (error) {
        alert(`Failed to set vote: ${error.message}\n\nNote: This requires a PAT with appropriate permissions.`);
        // Revert select to previous value
        if (select) select.value = getCurrentUserVote();
    } finally {
        if (select) select.disabled = false;
    }
}

async function toggleReviewerRequired(reviewerId, isRequired) {
    try {
        await ADOAPI.updateReviewerRequired(currentConfig, currentPRId, reviewerId, isRequired);

        // Refresh PR data to get updated reviewers list
        currentPRData = await ADOAPI.getPR(currentConfig, currentPRId);

        // Update reviewers display
        updateReviewersDisplay();

    } catch (error) {
        alert(`Failed to update reviewer: ${error.message}\n\nNote: This requires a PAT with appropriate permissions.`);
    }
}

function updateReviewersDisplay() {
    // Recalculate thread counts (reuse canonical logic from getActiveThreadCounts)
    const threadCounts = getActiveThreadCounts(allThreads);

    // Check if avatar containers exist (structure already rendered)
    const requiredAvatarsContainer = document.getElementById('requiredReviewersAvatars');
    const optionalAvatarsContainer = document.getElementById('optionalReviewersAvatars');

    if (requiredAvatarsContainer && optionalAvatarsContainer) {
        // Only update the avatar containers, preserving search forms
        const reviewers = currentPRData.reviewers || [];
        const requiredReviewers = reviewers.filter(r => r.isRequired);
        const optionalReviewers = reviewers.filter(r => !r.isRequired);

        const requiredAvatarsHtml = requiredReviewers.map(r => {
            const count = threadCounts[r.id] || 0;
            return renderReviewerWithDropdown(r, r.vote, count, r.id === currentPRData.createdBy?.id, true);
        }).join('');

        const optionalAvatarsHtml = optionalReviewers.map(r => {
            const count = threadCounts[r.id] || 0;
            return renderReviewerWithDropdown(r, r.vote, count, r.id === currentPRData.createdBy?.id, false);
        }).join('');

        requiredAvatarsContainer.innerHTML = requiredAvatarsHtml || '<span class="no-reviewers">None</span>';
        optionalAvatarsContainer.innerHTML = optionalAvatarsHtml || '<span class="no-reviewers">None</span>';

        // Also update Other Thread Authors section
        const reviewersContainer = document.getElementById('rightSidebarReviewers');
        const otherAuthorsHtml = renderOtherAuthorsSection(allThreads, reviewers, threadCounts, currentPRData.createdBy?.id);
        // Find and update or append the other authors section
        let otherAuthorsSection = reviewersContainer?.querySelector('.avatars-section:last-child h4');
        if (otherAuthorsSection?.textContent === 'Other Thread Authors') {
            otherAuthorsSection.closest('.avatars-section').outerHTML = otherAuthorsHtml || '';
        } else if (otherAuthorsHtml && reviewersContainer) {
            // Append if it doesn't exist but should
            reviewersContainer.insertAdjacentHTML('beforeend', otherAuthorsHtml);
        }
    } else {
        // Full render (initial load)
        const reviewersHtml = `
            ${renderReviewersSection(currentPRData.reviewers, threadCounts, currentPRData.createdBy?.id)}
            ${renderOtherAuthorsSection(allThreads, currentPRData.reviewers, threadCounts, currentPRData.createdBy?.id)}
        `;

        const reviewersContainer = document.getElementById('rightSidebarReviewers');
        if (reviewersContainer) {
            reviewersContainer.innerHTML = reviewersHtml;
        }
    }

    // Load any new avatars
    AvatarLoader.loadPending();
}
