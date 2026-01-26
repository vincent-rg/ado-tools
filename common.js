/**
 * Azure DevOps Tools - Common JavaScript
 * Shared utilities across all ADO tools pages
 */

// Cache for resolved identities
const identityCache = {};

/**
 * Configuration Management
 */
const ADOConfig = {
    /**
     * Get configuration from localStorage
     */
    get() {
        const savedConfig = localStorage.getItem('adoConfig');
        return savedConfig ? JSON.parse(savedConfig) : null;
    },

    /**
     * Save configuration to localStorage
     */
    save(config) {
        localStorage.setItem('adoConfig', JSON.stringify(config));
    },

    /**
     * Clear configuration from localStorage
     */
    clear() {
        localStorage.removeItem('adoConfig');
    },

    /**
     * Check if all required fields are present
     */
    isValid(config) {
        return config &&
               config.serverUrl &&
               config.organization &&
               config.project &&
               config.pat;
    },

    /**
     * Get config from form or localStorage
     */
    getFromForm(formIds) {
        const config = {
            serverUrl: document.getElementById(formIds.serverUrl || 'serverUrl')?.value?.trim() || '',
            organization: document.getElementById(formIds.organization || 'organization')?.value?.trim() || '',
            project: document.getElementById(formIds.project || 'project')?.value?.trim() || '',
            repository: document.getElementById(formIds.repository || 'repository')?.value?.trim() || '',
            pat: document.getElementById(formIds.pat || 'pat')?.value?.trim() || ''
        };

        // Merge with saved config for missing fields
        const savedConfig = this.get();
        if (savedConfig) {
            Object.keys(config).forEach(key => {
                if (!config[key] && savedConfig[key]) {
                    config[key] = savedConfig[key];
                }
            });
        }

        return config;
    }
};

/**
 * API Utilities
 */
const ADOAPI = {
    /**
     * Fetch with authentication
     */
    async fetchWithAuth(url, pat, options = {}) {
        const authHeader = 'Basic ' + btoa(':' + pat);
        return fetch(url, {
            ...options,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    },

    /**
     * Get PR details
     */
    async getPR(config, prId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR details: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get PR threads
     */
    async getPRThreads(config, prId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/threads?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR threads: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    async getThreads(config, project, repoId, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR threads: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get PR iterations
     */
    async getPRIterations(config, prId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/iterations?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR iterations: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get file content at a specific version/iteration
     */
    async getFileContent(config, filePath, versionDescriptor) {
        // versionDescriptor can be like: { version: commitId, versionType: 'commit' }
        // or { version: iterationId, versionType: 'iteration' }
        const versionParam = versionDescriptor ? `&versionDescriptor.version=${versionDescriptor.version}&versionDescriptor.versionType=${versionDescriptor.versionType}` : '';
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/items?path=${encodeURIComponent(filePath)}${versionParam}&api-version=6.0`;

        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch file content: ${response.status} ${response.statusText}`);
        }

        return response.text(); // Return as text since it's file content
    },

    /**
     * Update thread status
     */
    async updateThreadStatus(config, prId, threadId, status) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/threads/${threadId}?api-version=6.0`;

        // Map string status to CommentThreadStatus enum integers
        // https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/commentthreadstatus
        const statusMap = {
            'unknown': 0,
            'active': 1,
            'fixed': 2,
            'wontFix': 3,
            'closed': 4,
            'byDesign': 5,
            'pending': 6
        };

        const statusValue = statusMap[status] !== undefined ? statusMap[status] : status;
        const payload = { status: statusValue };

        const response = await this.fetchWithAuth(url, config.pat, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to update thread status: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Remove thread status (set to null)
     */
    async removeThreadStatus(config, prId, threadId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/threads/${threadId}?api-version=6.0`;

        const payload = { status: null };

        const response = await this.fetchWithAuth(url, config.pat, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to remove thread status: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get repositories in project
     */
    async getRepositories(config, project = null) {
        const proj = project || config.project;
        const url = `${config.serverUrl}/${config.organization}/${proj}/_apis/git/repositories?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch repositories: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get projects in collection
     */
    async getProjects(config) {
        const url = `${config.serverUrl}/${config.organization}/_apis/projects?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch projects: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get PRs from a repository
     */
    async getPRs(config, project, repository, status = 'all') {
        let allPRs = [];
        let skip = 0;
        const top = 100; // Max items per request
        let hasMore = true;

        while (hasMore) {
            let url = `${config.serverUrl}/${config.organization}/${project}/_apis/git/repositories/${repository}/pullRequests?api-version=6.0`;

            // Always add status parameter (Azure DevOps defaults to 'active' if omitted)
            url += `&searchCriteria.status=${status}`;
            url += `&$top=${top}&$skip=${skip}`;

            const response = await this.fetchWithAuth(url, config.pat);

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `Failed to fetch PRs: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const prs = data.value || [];

            allPRs = allPRs.concat(prs);

            // Check if there are more results
            if (prs.length < top) {
                hasMore = false;
            } else {
                skip += top;
            }
        }

        return { value: allPRs };
    },

    /**
     * Get status checks for a PR (pipelines, CI builds, custom checks)
     */
    async getPRStatuses(config, project, repository, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/statuses?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR statuses: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get policy evaluations for a PR (quality gates, build policies, required reviewers, etc.)
     */
    async getPolicyEvaluations(config, project, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/${encodeURIComponent(project)}/${prId}&api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch policy evaluations: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }
};

/**
 * Identity Resolution
 */
const ADOIdentity = {
    /**
     * Resolve a single identity
     */
    async resolve(id, serverUrl, organization, pat) {
        if (identityCache[id]) {
            return identityCache[id];
        }

        try {
            const identityUrl = `${serverUrl}/${organization}/_apis/identities/${encodeURIComponent(id)}?api-version=6.0`;
            const response = await ADOAPI.fetchWithAuth(identityUrl, pat);

            if (response.ok) {
                const data = await response.json();
                identityCache[id] = data.displayName || data.providerDisplayName || id;
            } else {
                identityCache[id] = id;
            }
        } catch (error) {
            // CORS errors are expected when ADO Server doesn't allow cross-origin requests
            // This is not critical - we'll just use the raw ID instead of display name
            identityCache[id] = id;
        }

        return identityCache[id];
    },

    /**
     * Collect and resolve all identities from threads
     */
    async collectAndResolveFromThreads(threads, serverUrl, organization, pat) {
        const identityIds = new Set();

        threads.forEach(thread => {
            if (thread.comments) {
                thread.comments.forEach(comment => {
                    if (comment.content) {
                        const mentionPattern = /@<([^>]+)>/g;
                        let match;
                        while ((match = mentionPattern.exec(comment.content)) !== null) {
                            identityIds.add(match[1]);
                        }
                    }
                });
            }
        });

        if (identityIds.size > 0) {
            console.log(`Attempting to resolve ${identityIds.size} @mention identities. CORS errors may appear but are harmless.`);
        }

        const resolvePromises = Array.from(identityIds).map(id =>
            this.resolve(id, serverUrl, organization, pat)
        );

        await Promise.all(resolvePromises);
    }
};

/**
 * Markdown & Content Parsing
 */
const ADOContent = {
    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Resolve mentions in plain text
     */
    resolveMentions(text) {
        if (!text) return text;

        return text.replace(/@<([^>]+)>/g, (match, id) => {
            const displayName = identityCache[id] || id;
            return `<span class="mention">@${this.escapeHtml(displayName)}</span>`;
        });
    },

    /**
     * Resolve mentions in escaped HTML
     */
    resolveMentionsInEscaped(escapedHtml) {
        if (!escapedHtml) return escapedHtml;

        return escapedHtml.replace(/@&lt;([^&]+)&gt;/g, (match, id) => {
            const displayName = identityCache[id] || id;
            return `<span class="mention">@${this.escapeHtml(displayName)}</span>`;
        });
    },

    /**
     * Parse markdown links and formatting
     */
    parseMarkdownLinks(escapedHtml) {
        if (!escapedHtml) return escapedHtml;

        let result = escapedHtml;
        const placeholders = [];
        let placeholderIndex = 0;

        function createPlaceholder(content) {
            const placeholder = `〔PLH${placeholderIndex}〕`;
            placeholders.push({ placeholder, content });
            placeholderIndex++;
            return placeholder;
        }

        function restorePlaceholders(text) {
            let restored = text;
            for (let i = placeholders.length - 1; i >= 0; i--) {
                const { placeholder, content } = placeholders[i];
                restored = restored.split(placeholder).join(content);
            }
            return restored;
        }

        // 1. Parse code blocks first
        result = result.replace(/```(\w+)?\n?([^`]+)```/g, (match, language, code) => {
            const html = `<pre><code>${code.trim()}</code></pre>`;
            return createPlaceholder(html);
        });

        // 2. Parse inline code
        result = result.replace(/`([^`]+)`/g, (match, code) => {
            const html = `<code>${code}</code>`;
            return createPlaceholder(html);
        });

        // 3. Parse images
        result = result.replace(/!\[([^\]]*)\]\(([^\s\)]+)(?:\s+['"]([^'"]+)['"])?\)/g, (match, alt, url, title) => {
            const titleAttr = title ? ` title="${ADOContent.escapeHtml(title)}"` : '';
            const html = `<img src="${ADOContent.escapeHtml(url)}" alt="${ADOContent.escapeHtml(alt)}"${titleAttr} />`;
            return createPlaceholder(html);
        });

        // 4. Parse bold
        result = result.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        // Only match __ for bold when not part of longer underscore sequences (word boundaries)
        result = result.replace(/(?<![a-zA-Z0-9_])__([^_]+)__(?![a-zA-Z0-9_])/g, '<strong>$1</strong>');

        // 5. Parse italic
        result = result.replace(/(?<!\*)\*(?!\*)([^\*]+)\*(?!\*)/g, '<em>$1</em>');
        // Only match _ for italic when not part of identifier names (word boundaries)
        // Must not be preceded or followed by alphanumeric or underscore characters
        result = result.replace(/(?<![a-zA-Z0-9_])_(?!_)([^_]+)_(?!_)(?![a-zA-Z0-9_])/g, '<em>$1</em>');

        // 6. Parse regular links
        result = result.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (match, text, url) => {
            const html = `<a href="${ADOContent.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            return createPlaceholder(html);
        });

        // 7. Restore placeholders
        result = restorePlaceholders(result);

        return result;
    },

    /**
     * Process comment content (escape, resolve mentions, parse markdown)
     */
    processContent(content) {
        if (!content) return '';
        const escaped = this.escapeHtml(content);
        const withMentions = this.resolveMentionsInEscaped(escaped);
        return this.parseMarkdownLinks(withMentions);
    }
};

/**
 * UI Utilities
 */
const ADOUI = {
    /**
     * Show message
     */
    showMessage(elementId, type, text) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const className = type === 'success' ? 'success' :
                         type === 'warning' ? 'warning' :
                         type === 'error' ? 'error' : 'info';

        element.innerHTML = `<div class="${className}">${text}</div>`;
    },

    /**
     * Show error
     */
    showError(elementId, message) {
        this.showMessage(elementId, 'error', ADOContent.escapeHtml(message));
    },

    /**
     * Show loading
     */
    showLoading(elementId, message = 'Loading...') {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.innerHTML = `<div class="loading">${message}</div>`;
    },

    /**
     * Clear content
     */
    clear(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.innerHTML = '';
    },

    /**
     * Toggle raw JSON visibility
     */
    toggleRawJson(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.toggle('show');
        }
    },

    /**
     * Format date
     */
    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    },

    /**
     * Get status badge class
     */
    getStatusBadgeClass(status, isDeleted = false) {
        if (isDeleted) return 'badge-deleted';

        switch (status?.toLowerCase()) {
            case 'active':
                return 'badge-active';
            case 'fixed':
                return 'badge-fixed';
            case 'closed':
                return 'badge-closed';
            case 'completed':
                return 'badge-completed';
            case 'abandoned':
                return 'badge-abandoned';
            default:
                return 'badge-closed';
        }
    },

    /**
     * Get status text
     */
    getStatusText(status, isDeleted = false) {
        if (isDeleted) return 'DELETED';

        const statusLabels = {
            'active': 'ACTIVE',
            'fixed': 'RESOLVED',
            'closed': 'CLOSED',
            'wontFix': "WON'T FIX",
            'pending': 'PENDING',
            'unknown': 'UNKNOWN'
        };

        return statusLabels[status] || 'UNKNOWN';
    }
};

/**
 * URL Utilities
 */
const ADOURL = {
    /**
     * Get URL parameters
     */
    getParams() {
        return new URLSearchParams(window.location.search);
    },

    /**
     * Get single parameter
     */
    getParam(name) {
        return this.getParams().get(name);
    },

    /**
     * Build PR URL
     */
    buildPRUrl(config, prId, tab = 'overview') {
        return `${config.serverUrl}/${config.organization}/${config.project}/_git/${config.repository}/pullrequest/${prId}?_a=${tab}`;
    },

    /**
     * Build thread URL
     */
    buildThreadUrl(config, prId, threadId, filePath = null) {
        const baseUrl = `${config.serverUrl}/${config.organization}/${config.project}/_git/${config.repository}/pullrequest/${prId}`;

        if (filePath) {
            return `${baseUrl}?_a=files&path=${encodeURIComponent(filePath)}&discussionId=${threadId}`;
        } else {
            return `${baseUrl}?_a=overview&discussionId=${threadId}`;
        }
    }
};

/**
 * Avatar Loading
 * Handles fetching and caching user avatars via proxy
 */
const AvatarLoader = (() => {
    const cache = {};
    const pendingRequests = new Map();

    async function fetch(userId) {
        if (cache[userId]) {
            return cache[userId];
        }

        if (pendingRequests.has(userId)) {
            return pendingRequests.get(userId);
        }

        const fetchPromise = (async () => {
            try {
                const config = ADOConfig.get();
                if (!config?.pat || !config?.organization) {
                    return null;
                }

                const params = new URLSearchParams({
                    id: userId,
                    org: config.organization,
                    serverUrl: config.serverUrl || 'https://dev.azure.com'
                });

                const response = await window.fetch(`/avatar?${params}`, {
                    headers: { 'X-ADO-PAT': config.pat }
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    cache[userId] = blobUrl;
                    return blobUrl;
                }
            } catch (e) {
                console.warn('Failed to fetch avatar:', e);
            }
            return null;
        })();

        pendingRequests.set(userId, fetchPromise);
        fetchPromise.finally(() => pendingRequests.delete(userId));

        return fetchPromise;
    }

    function loadPending() {
        document.querySelectorAll('.avatar-pending:not(.loaded)').forEach(async img => {
            const userId = img.dataset.userId;
            if (!userId) return;

            const blobUrl = await fetch(userId);
            if (blobUrl) {
                img.src = blobUrl;
                img.onload = () => {
                    img.classList.add('loaded');
                    if (img.previousElementSibling?.classList.contains('avatar-placeholder')) {
                        setTimeout(() => {
                            img.previousElementSibling.style.visibility = 'hidden';
                        }, 300);
                    }
                };
            }
        });
    }

    function getCached(userId) {
        return cache[userId] || null;
    }

    return {
        fetch,
        loadPending,
        getCached
    };
})();

// Make utilities globally available
window.ADOConfig = ADOConfig;
window.ADOAPI = ADOAPI;
window.ADOIdentity = ADOIdentity;
window.ADOContent = ADOContent;
window.ADOUI = ADOUI;
window.ADOURL = ADOURL;
window.AvatarLoader = AvatarLoader;
