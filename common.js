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
        return {
            name: status.context?.name || status.description || 'Unknown check',
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
            // Group by latest per context
            const latestStatuses = new Map();
            statuses.forEach(s => {
                const key = s.context?.name || s.description || 'Unknown';
                const existing = latestStatuses.get(key);
                if (!existing || new Date(s.creationDate) > new Date(existing.creationDate)) {
                    latestStatuses.set(key, s);
                }
            });

            const statusList = Array.from(latestStatuses.values());
            const failed = statusList.filter(s => s.state === 'failed' || s.state === 'error');
            const pending = statusList.filter(s => s.state === 'pending');
            const succeeded = statusList.filter(s => s.state === 'succeeded');

            if (statusList.length > 0) {
                lines.push('');
                lines.push('Pipeline Checks:');
                [...failed, ...pending, ...succeeded].forEach(s => {
                    const icon = this.getIcon(s.state);
                    const info = this.formatStatus(s);
                    lines.push(`  ${icon} ${info.name}`);
                });
            }
        }

        // Policy evaluations
        if (policies.length > 0) {
            const rejected = policies.filter(e => e.status === 'rejected');
            const running = policies.filter(e => e.status === 'running' || e.status === 'queued');
            const approved = policies.filter(e => e.status === 'approved');

            lines.push('');
            lines.push('Policies:');
            [...rejected, ...running, ...approved].forEach(p => {
                const icon = this.getIcon(p.status);
                const { label, extra } = this.formatPolicy(p);
                lines.push(`  ${icon} ${label}${extra ? ' ' + extra : ''}`);
            });
        }

        return lines.join('\n').trim();
    },

    /**
     * Count statuses by state
     */
    countStatuses(statuses) {
        // Group by latest per context first
        const latestStatuses = new Map();
        statuses.forEach(s => {
            const key = s.context?.name || s.description || 'Unknown';
            const existing = latestStatuses.get(key);
            if (!existing || new Date(s.creationDate) > new Date(existing.creationDate)) {
                latestStatuses.set(key, s);
            }
        });

        const list = Array.from(latestStatuses.values());
        return {
            total: list.length,
            succeeded: list.filter(s => s.state === 'succeeded').length,
            failed: list.filter(s => s.state === 'failed' || s.state === 'error').length,
            pending: list.filter(s => s.state === 'pending').length
        };
    },

    /**
     * Count policies by status
     */
    countPolicies(policies) {
        return {
            total: policies.length,
            approved: policies.filter(e => e.status === 'approved').length,
            rejected: policies.filter(e => e.status === 'rejected').length,
            running: policies.filter(e => e.status === 'running' || e.status === 'queued').length
        };
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
