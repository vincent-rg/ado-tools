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

    async getIterations(config, project, repoId, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/git/repositories/${repoId}/pullRequests/${prId}/iterations?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR iterations: ${response.status} ${response.statusText}`);
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
     * Get PR iteration changes (files changed in an iteration)
     */
    async getPRIterationChanges(config, prId, iterationId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/iterations/${iterationId}/changes?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR iteration changes: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get diff stats between two commits
     */
    async getCommitDiffs(config, baseCommitId, targetCommitId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/diffs/commits?baseVersionType=commit&baseVersion=${baseCommitId}&targetVersionType=commit&targetVersion=${targetCommitId}&api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch commit diffs: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get PR commits
     */
    async getPRCommits(config, prId) {
        const url = `${config.serverUrl}/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${prId}/commits?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR commits: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get file diffs using internal ADO API (undocumented)
     * Returns line-level diff information for files
     */
    async getFileDiffs(config, repositoryId, baseCommit, targetCommit, filePaths) {
        const url = `${config.serverUrl}/${config.organization}/_apis/Contribution/HierarchyQuery/project/${config.project}?api-version=5.1-preview`;

        const body = {
            contributionIds: ["ms.vss-code-web.file-diff-data-provider"],
            dataProviderContext: {
                properties: {
                    repositoryId: repositoryId,
                    diffParameters: {
                        baseVersionCommit: baseCommit,
                        targetVersionCommit: targetCommit,
                        fileDiffParams: filePaths.map(p => ({ path: p, originalPath: p }))
                    }
                }
            }
        };

        const response = await this.fetchWithAuth(url, config.pat, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch file diffs: ${response.status} ${response.statusText}`);
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
     * @param {object} config - ADO configuration
     * @param {string} project - Project name (for API path)
     * @param {string} projectId - Project GUID (for artifact ID)
     * @param {number} prId - Pull request ID
     */
    async getPolicyEvaluations(config, project, projectId, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/${encodeURIComponent(projectId)}/${prId}&api-version=6.0-preview.1`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch policy evaluations: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Get merge conflicts for a PR
     */
    async getPRConflicts(config, project, repository, prId) {
        const url = `${config.serverUrl}/${config.organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/conflicts?api-version=6.0`;
        const response = await this.fetchWithAuth(url, config.pat);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to fetch PR conflicts: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Requeue a policy evaluation (triggers build for build policies)
     * @param {object} config - ADO configuration
     * @param {string} project - Project name
     * @param {string} evaluationId - Policy evaluation ID
     */
    async requeuePolicyEvaluation(config, project, evaluationId) {
        const baseUrl = config.serverUrl.replace(/\/+$/, '');
        const url = `${baseUrl}/${config.organization}/${project}/_apis/policy/evaluations/${evaluationId}?api-version=6.0-preview.1`;
        const response = await this.fetchWithAuth(url, config.pat, {
            method: 'PATCH'
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Failed to requeue policy: ${response.status} ${response.statusText}`);
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

        // 4. Parse headers (h1-h6) - consume trailing newline to avoid double spacing with pre-wrap
        result = result.replace(/^(#{1,6})\s+(.+)\n?/gm, (match, hashes, text) => {
            const level = hashes.length;
            const html = `<h${level} style="margin: 0.5em 0; font-size: ${1.5 - (level - 1) * 0.15}em;">${text}</h${level}>`;
            return createPlaceholder(html);
        });

        // 5. Parse bold
        result = result.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        // Only match __ for bold when not part of longer underscore sequences (word boundaries)
        result = result.replace(/(?<![a-zA-Z0-9_])__([^_]+)__(?![a-zA-Z0-9_])/g, '<strong>$1</strong>');

        // 6. Parse italic
        result = result.replace(/(?<!\*)\*(?!\*)([^\*]+)\*(?!\*)/g, '<em>$1</em>');
        // Only match _ for italic when not part of identifier names (word boundaries)
        // Must not be preceded or followed by alphanumeric or underscore characters
        result = result.replace(/(?<![a-zA-Z0-9_])_(?!_)([^_]+)_(?!_)(?![a-zA-Z0-9_])/g, '<em>$1</em>');

        // 7. Parse regular links
        result = result.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (match, text, url) => {
            const html = `<a href="${ADOContent.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            return createPlaceholder(html);
        });

        // 8. Restore placeholders
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
 * Checks Formatting
 * Shared utilities for formatting PR checks (statuses, policies, conflicts)
 */
const ChecksFormatter = {
    /**
     * Get status icon based on state
     */
    getIcon(state) {
        switch (state) {
            case 'succeeded':
            case 'approved': return '✓';
            case 'failed':
            case 'error':
            case 'rejected': return '✗';
            case 'pending':
            case 'running':
            case 'queued': return '●';
            default: return '○';
        }
    },

    /**
     * Get CSS class based on state
     */
    getClass(state) {
        switch (state) {
            case 'succeeded':
            case 'approved': return 'status-indicator-success';
            case 'failed':
            case 'error':
            case 'rejected': return 'status-indicator-error';
            case 'pending':
            case 'running':
            case 'queued': return 'status-indicator-pending';
            default: return 'status-indicator-warning';
        }
    },

    /**
     * Get ADO-style SVG icon for build status
     * @param {string} state - Build state (notTriggered, queued, running, succeeded, failed)
     * @param {number} size - Icon size in pixels (default 16)
     * @returns {string} SVG markup
     */
    getBuildStatusSvg(state, size = 16) {
        const icons = {
            notTriggered: `<svg class="build-status-icon" height="${size}" viewBox="0 0 32 32" width="${size}"><circle cx="16" cy="16" r="16" fill="#8a8886"/><path d="M16 7a1.5 1.5 0 0 1 1.5 1.5v7.377l4.026 4.027a1.5 1.5 0 0 1-2.12 2.121l-4.428-4.427A1.496 1.496 0 0 1 14.5 16.5v-8A1.5 1.5 0 0 1 16 7z" fill="#fff"/></svg>`,
            queued: `<svg class="build-status-icon" height="${size}" viewBox="0 0 32 32" width="${size}"><circle cx="16" cy="16" r="16" fill="#0078d4"/><path d="M16 7a1.5 1.5 0 0 1 1.5 1.5v7.377l4.026 4.027a1.5 1.5 0 0 1-2.12 2.121l-4.428-4.427A1.496 1.496 0 0 1 14.5 16.5v-8A1.5 1.5 0 0 1 16 7z" fill="#fff"/></svg>`,
            running: `<svg class="build-status-icon build-status-running" height="${size}" viewBox="0 0 32 32" width="${size}"><circle cx="16" cy="16" r="16" fill="#0078d4"/><path d="M23 16c0 .325-.022.645-.065.959-.07.509.137 1.031.582 1.289.622.36 1.42.058 1.545-.65a9.204 9.204 0 0 0-6.27-10.367c-.664-.21-1.292.324-1.292 1.02 0 .532.374.982.873 1.162A7.003 7.003 0 0 1 23 16zM9 16a7.003 7.003 0 0 1 4.627-6.587c.5-.18.873-.63.873-1.161 0-.697-.628-1.232-1.292-1.02a9.204 9.204 0 0 0-6.27 10.367c.124.707.924 1.008 1.545.649.445-.258.652-.78.582-1.29A7.062 7.062 0 0 1 9 16zm7 7a6.975 6.975 0 0 0 4.728-1.838c.403-.37.999-.484 1.472-.21.586.339.744 1.121.261 1.597A9.17 9.17 0 0 1 16 25.2a9.17 9.17 0 0 1-6.461-2.65c-.482-.477-.325-1.26.261-1.599.473-.273 1.069-.159 1.472.21A6.975 6.975 0 0 0 16 23z" fill="#fff"/></svg>`,
            succeeded: `<svg class="build-status-icon" height="${size}" viewBox="0 0 32 32" width="${size}"><circle cx="16" cy="16" r="16" fill="#107c10"/><path d="M12.799 20.83l-.005-.003L9.94 17.97a1.5 1.5 0 1 1 2.121-2.12l1.8 1.798 6.209-6.21a1.5 1.5 0 1 1 2.12 2.122l-7.264 7.264-.005.006a1.5 1.5 0 0 1-2.121 0z" fill="#fff"/></svg>`,
            failed: `<svg class="build-status-icon" height="${size}" viewBox="0 0 32 32" width="${size}"><circle cx="16" cy="16" r="16" fill="#d13438"/><path d="M21.99 9.99a1.5 1.5 0 0 0-2.122 0L16 13.856 12.132 9.99a1.5 1.5 0 0 0-2.121 2.122l3.868 3.868-3.89 3.889a1.5 1.5 0 0 0 2.122 2.121L16 18.1l3.89 3.89a1.5 1.5 0 0 0 2.12-2.122l-3.889-3.89 3.868-3.867a1.5 1.5 0 0 0 0-2.122z" fill="#fff"/></svg>`
        };
        return icons[state] || icons.notTriggered;
    },

    /**
     * Determine actual build state from policy evaluation
     * @param {object} policy - Policy evaluation object
     * @returns {string} Build state (notTriggered, queued, running, succeeded, failed)
     */
    getBuildState(policy) {
        if (policy.status === 'approved') return 'succeeded';
        if (policy.status === 'rejected') return 'failed';
        if (policy.status === 'running') return 'running';
        if (policy.status === 'queued') {
            return policy.context?.buildId ? 'queued' : 'notTriggered';
        }
        return 'notTriggered';
    },

    /**
     * Check if a policy is a build policy
     * @param {object} policy - Policy evaluation object
     * @returns {boolean}
     */
    isBuildPolicy(policy) {
        return policy.configuration?.type?.displayName?.toLowerCase() === 'build';
    },

    /**
     * Format a policy evaluation for display
     * @param {object} policy - Policy evaluation object
     * @returns {object} { label, extra } - formatted label and optional extra info
     */
    formatPolicy(policy) {
        const type = policy.configuration?.type?.displayName || 'Policy';
        const settings = policy.configuration?.settings || {};
        const context = policy.context || {};

        let label = type;
        let extra = '';

        const typeLower = type.toLowerCase();

        if (typeLower === 'build') {
            const buildName = settings.displayName || context.buildDefinitionName || 'Unknown build';
            label = `Build: ${buildName}`;
            if (context.isExpired) {
                extra = '(expired)';
            }
        } else if (typeLower === 'status') {
            const statusName = settings.statusName || 'Unknown';
            const statusGenre = settings.statusGenre ? ` (${settings.statusGenre})` : '';
            label = `Status: ${statusName}${statusGenre}`;
        } else if (typeLower.includes('minimum') && typeLower.includes('reviewer')) {
            const count = settings.minimumApproverCount;
            if (count !== undefined) {
                label = `${type}: ${count} required`;
            }
        } else if (typeLower.includes('required reviewer')) {
            const name = settings.displayName;
            if (name) {
                label = `Required reviewer: ${name}`;
            }
        } else if (typeLower.includes('work item')) {
            label = type;
        } else if (settings.displayName) {
            label = `${type}: ${settings.displayName}`;
        }

        return { label, extra };
    },

    /**
     * Format a status check for display
     * @param {object} status - Status check object
     * @returns {object} { name, description, url }
     */
    formatStatus(status) {
        const name = status.context?.name || 'Unknown check';
        const genre = status.context?.genre;
        const displayName = genre ? `${name} (${genre})` : name;
        return {
            name: displayName,
            description: status.description || '',
            url: status.targetUrl || null
        };
    },

    /**
     * Build tooltip content for detailed checks info
     * @param {object} data - { statuses, policies, conflicts, mergeStatus }
     * @returns {string} - Tooltip text
     */
    buildTooltip(data) {
        const lines = [];
        const { statuses = [], policies = [], conflicts = [], mergeStatus } = data;

        // Merge status
        if (mergeStatus === 'conflicts' && conflicts.length > 0) {
            lines.push('⚠️ Merge Conflicts:');
            conflicts.slice(0, 5).forEach(c => {
                const path = c.conflictPath || c.filePath || c.sourceFilePath || 'Unknown';
                lines.push(`  • ${path}`);
            });
            if (conflicts.length > 5) {
                lines.push(`  ... and ${conflicts.length - 5} more`);
            }
        } else if (mergeStatus && mergeStatus !== 'succeeded' && mergeStatus !== 'notSet') {
            const mergeTexts = {
                'conflicts': '⚠️ Merge conflicts',
                'rejectedByPolicy': '🚫 Rejected by policy',
                'queued': '⏳ Merge queued',
                'failure': '❌ Merge failed'
            };
            if (mergeTexts[mergeStatus]) {
                lines.push(mergeTexts[mergeStatus]);
            }
        }

        // Status checks (pipelines)
        if (statuses.length > 0) {
            const statusList = this.getLatestStatuses(statuses);
            const failed = statusList.filter(s => s.state === 'failed' || s.state === 'error');
            const pending = statusList.filter(s => s.state === 'pending' || !s.state);  // no state = queued
            const succeeded = statusList.filter(s => s.state === 'succeeded');

            if (statusList.length > 0) {
                lines.push('');
                lines.push('📊 Status Checks:');
                [...failed, ...pending, ...succeeded].forEach(s => {
                    const icon = this.getIcon(s.state || 'pending');
                    const info = this.formatStatus(s);
                    lines.push(`  ${icon} ${info.name}`);
                });
            }
        }

        // Build policies (separate section)
        const buildPolicies = policies.filter(p => this.isBuildPolicy(p));
        if (buildPolicies.length > 0) {
            // Sort by state: failed, notTriggered, running, queued, succeeded
            const stateOrder = { failed: 0, notTriggered: 1, running: 2, queued: 3, succeeded: 4 };
            const sorted = buildPolicies.sort((a, b) => {
                const stateA = this.getBuildState(a);
                const stateB = this.getBuildState(b);
                return (stateOrder[stateA] ?? 5) - (stateOrder[stateB] ?? 5);
            });

            lines.push('');
            lines.push('🔧 Builds:');
            sorted.forEach(p => {
                const state = this.getBuildState(p);
                const stateIcons = {
                    notTriggered: '○',
                    queued: '◷',
                    running: '⟳',
                    succeeded: '✓',
                    failed: '✗'
                };
                const icon = stateIcons[state] || '○';
                const { label, extra } = this.formatPolicy(p);
                lines.push(`  ${icon} ${label}${extra ? ' ' + extra : ''}`);
            });
        }

        // Other policy evaluations (non-build)
        const nonBuildPolicies = policies.filter(p => !this.isBuildPolicy(p));
        if (nonBuildPolicies.length > 0) {
            const rejected = nonBuildPolicies.filter(e => e.status === 'rejected');
            const running = nonBuildPolicies.filter(e => e.status === 'running' || e.status === 'queued');
            const approved = nonBuildPolicies.filter(e => e.status === 'approved');

            lines.push('');
            lines.push('📋 Policies:');
            [...rejected, ...running, ...approved].forEach(p => {
                const icon = this.getIcon(p.status);
                const { label, extra } = this.formatPolicy(p);
                lines.push(`  ${icon} ${label}${extra ? ' ' + extra : ''}`);
            });
        }

        return lines.join('\n').trim();
    },

    /**
     * Get deduplicated statuses - latest per context (name+genre) for latest iteration
     * @param {Array} statuses - Raw statuses from API
     * @returns {Array} Deduplicated status list
     */
    getLatestStatuses(statuses) {
        if (!statuses || statuses.length === 0) return [];

        // Find the latest iterationId
        const maxIterationId = Math.max(...statuses.map(s => s.iterationId || 0));

        // Filter to latest iteration only
        const latestIterationStatuses = statuses.filter(s => (s.iterationId || 0) === maxIterationId);

        // Group by context name + genre, keeping latest by creationDate
        const latestStatuses = new Map();
        latestIterationStatuses.forEach(s => {
            const name = s.context?.name || s.description || 'Unknown';
            const genre = s.context?.genre || '';
            const key = genre ? `${name}/${genre}` : name;

            const existing = latestStatuses.get(key);
            if (!existing || new Date(s.creationDate) > new Date(existing.creationDate)) {
                latestStatuses.set(key, s);
            }
        });

        // Filter out notApplicable statuses
        return Array.from(latestStatuses.values()).filter(s => s.state !== 'notApplicable');
    },

    /**
     * Count statuses by state
     */
    countStatuses(statuses) {
        const list = this.getLatestStatuses(statuses);
        return {
            total: list.length,
            succeeded: list.filter(s => s.state === 'succeeded').length,
            failed: list.filter(s => s.state === 'failed' || s.state === 'error').length,
            pending: list.filter(s => s.state === 'pending' || !s.state).length  // no state = queued/pending
        };
    },

    /**
     * Count policies by status (for non-build policies)
     */
    countPolicies(policies) {
        const nonBuildPolicies = policies.filter(p => !this.isBuildPolicy(p));
        return {
            total: nonBuildPolicies.length,
            approved: nonBuildPolicies.filter(e => e.status === 'approved').length,
            rejected: nonBuildPolicies.filter(e => e.status === 'rejected').length,
            running: nonBuildPolicies.filter(e => e.status === 'running' || e.status === 'queued').length
        };
    },

    /**
     * Count build policies by state
     * @param {Array} policies - All policy evaluations
     * @returns {object} Counts by build state
     */
    countBuildPolicies(policies) {
        const buildPolicies = policies.filter(p => this.isBuildPolicy(p));
        const counts = {
            total: buildPolicies.length,
            notTriggered: 0,
            queued: 0,
            running: 0,
            succeeded: 0,
            failed: 0
        };

        buildPolicies.forEach(p => {
            const state = this.getBuildState(p);
            counts[state]++;
        });

        return counts;
    },

    /**
     * Fetch all checks data for a PR (statuses, policies, conflicts)
     * @param {object} config - ADO config
     * @param {string} project - Project name
     * @param {string} repository - Repository name
     * @param {number} prId - Pull request ID
     * @param {string} projectId - Project GUID (from pr.repository.project.id)
     * @param {string} mergeStatus - PR merge status (to determine if conflicts should be fetched)
     * @returns {Promise<object>} { statuses, policies, conflicts, mergeStatus }
     */
    async fetchPRChecks(config, project, repository, prId, projectId, mergeStatus) {
        const checks = {
            statuses: [],
            policies: [],
            conflicts: [],
            mergeStatus: mergeStatus
        };

        try {
            // Use project GUID for policy evaluations, fallback to project name
            const effectiveProjectId = projectId || project;

            const fetchPromises = [
                ADOAPI.getPRStatuses(config, project, repository, prId).catch(() => ({ value: [] })),
                ADOAPI.getPolicyEvaluations(config, project, effectiveProjectId, prId).catch(() => ({ value: [] }))
            ];

            // Only fetch conflicts if there are merge conflicts
            if (mergeStatus === 'conflicts') {
                fetchPromises.push(
                    ADOAPI.getPRConflicts(config, project, repository, prId).catch(() => ({ value: [] }))
                );
            }

            const results = await Promise.all(fetchPromises);

            checks.statuses = results[0].value || [];
            checks.policies = results[1].value || [];
            if (results[2]) {
                checks.conflicts = results[2].value || [];
            }
        } catch (e) {
            console.warn('Failed to fetch PR checks:', e);
        }

        return checks;
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
window.ChecksFormatter = ChecksFormatter;
window.AvatarLoader = AvatarLoader;
