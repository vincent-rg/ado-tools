# CLAUDE.md - Project Mind Map

## What is this project?

Browser-based tools for Azure DevOps Server 2022.1+. Pure HTML/CSS/JS frontend + Python stdlib HTTP server. No build step, no frameworks, no npm. Settings stored in localStorage, API calls go directly from browser to ADO Server.

**Run:** `python ado-server.py [port]` (default 8000)

## File Map (15,089 lines total)

```
ado-server.py          (197 lines)  Python HTTP server + avatar/identity proxy
common.css             (709 lines)  Shared styles (badges, modals, avatars, forms, layout)
common.js             (1721 lines)  Shared JS modules (API, config, UI, content, avatars, checks)
diff.js                (219 lines)  Histogram diff algorithm (line-by-line diff)
index.html             (206 lines)  Landing page with tool cards
ado-settings.html      (219 lines)  Settings form (serverUrl, org, project, repo, PAT)
ado-pr-list.html      (4276 lines)  PR list browser (CSS: 1-1057, HTML: 1059-1221, JS: 1224-4274)
ado-pr-threads.html   (7542 lines)  PR thread viewer + Files diff (CSS: 8-2358, HTML: 2360-2527, JS: 2530-7528)
```

## Architecture

- **No framework** - vanilla JS with global namespace objects
- **No build** - files served directly by Python HTTP server
- **Shared state** via `localStorage` (`adoConfig` key)
- **Server role** is minimal: serve static files + proxy avatar/identity requests (to bypass CORS)
- All ADO REST API calls made from browser with PAT auth (Basic auth header)
- API version: 6.0

## common.js - Global Modules

All exposed on `window.*`:

| Module | Purpose |
|--------|---------|
| `ADOConfig` | localStorage CRUD for config (get/save/clear/isValid/getFromForm) |
| `ADOAPI` | All ADO REST API calls (PR, threads, iterations, commits, files, statuses, policies, reviewers, identity search) |
| `ADOIdentity` | Resolve @mention identity IDs to display names (cached in `identityCache`) |
| `ADOContent` | HTML escaping, markdown parsing (bold/italic/code/links/images/headers), @mention resolution |
| `ADOUI` | showMessage/showError/showLoading/clear, date formatting, status badges, auto-complete icon |
| `ADOURL` | URL param helpers, PR URL builder, thread URL builder |
| `ChecksFormatter` | PR checks rendering (build status SVGs, policy formatting, status counting, tooltip builder, fetchPRChecks) |
| `AvatarLoader` | IIFE module: fetch avatars via `/avatar` proxy, blob URL cache, loadPending for lazy load |
| `ADOSearch` | normalize() for accent-insensitive search (NFD decomposition) |

### Key API methods on `ADOAPI`:
- PR: `getPR`, `getPRs` (paginated), `getPRCommits`, `getPRStatuses`, `updatePRStatus`, `completePR`, `setDraft`, `abandonPR`, `reactivatePR`
- Threads: `getPRThreads`, `getThreads`, `createThread`, `addComment`, `updateComment`, `deleteComment`, `updateThreadStatus`, `removeThreadStatus`
- Iterations: `getPRIterations`, `getPRIterationChanges`
- Files: `getFileContent`, `getRepoItems`, `getRepoTree`
- Git: `getMergeBases`, `getCommitDiffs`
- Policies: `getPolicyEvaluations`, `requeuePolicyEvaluation`, `getPRConflicts`
- Reviewers: `addReviewer`, `removeReviewer`, `updateReviewerRequired`, `searchIdentities`
- Meta: `getRepositories`, `getProjects`, `getCurrentUser`, `setAutoComplete`, `removeAutoComplete`

## ado-pr-list.html - PR List Browser

### Structure
- **Left sidebar**: filter panel (status checkboxes, text filters for ID/author/assignee/comment author, resizable)
- **Main content**: PR table with sortable/resizable/hideable columns, pagination, toolbar
- **Modal**: project/repo selection tree for loading PRs

### Key Global State (~50 variables)
- `allPRs`, `filteredPRs` - PR data arrays
- `allAuthors`, `allReviewers`, `allCommentAuthors` - Sets for autocomplete
- `prCommentCounts`, `prChecks`, `prIterationCounts` - Caches keyed by `project/repo/prId`
- `currentSort`, `currentOrder`, `currentPage`, `itemsPerPage` - Table state
- `columnWidths`, `columnVisibility` - Column preferences (persisted to localStorage)
- `liveUpdatesEnabled`, `backgroundPollInterval` - Live polling (2min interval)

### Major Function Groups
- **Project/repo loading** (~250 lines): `loadProjects()`, `buildProjectTree()`, modal management
- **PR loading** (~230 lines): `loadPRsFromSelection()`, `refreshPRs()`, tracks loaded repos with timestamps
- **Filtering** (~120 lines): `getCurrentFilters()` reads DOM → filters object, `prMatchesFilters(pr, filters)` is the single source of truth used by `applyFilters()`, `applyFiltersWithoutReset()`, and live-update change detection
- **Display** (~310 lines): `displayPRs()` renders table + pagination + columns dropdown
- **Comment fetching** (~250 lines): Priority queue (visible PRs first), rate-limited batches, 2-phase fetch
- **Check fetching** (~190 lines): Build policies, status checks, merge conflicts per PR
- **Column management** (~205 lines): Drag resize, double-click auto-expand, persist widths/visibility
- **Live updates** (~170 lines): Background polling, change detection, notification banner, in-place row updates
- **URL state** (~160 lines): Bi-directional URL <-> filter state sync

### Constants
- `POLL_INTERVAL`: 2 min
- `USER_INTERACTION_PAUSE`: 10s
- `STALE_THRESHOLD_MS`: 5 min (comment cache)
- `VISIBILITY_POLL_COOLDOWN`: 20s

## ado-pr-threads.html - PR Thread Viewer + Files View

### Structure
- **Left sidebar**: filter chips (status), bulk mode toggle, show deleted toggle, author filter
- **Main content**: Two views switched by tabs:
  - **Overview**: Thread list with comments, markdown rendering, CRUD operations
  - **Files**: File tree + side-by-side diff with inline threads
- **Right sidebar**: PR info, stats, reviewers (with management), checks, iteration panel

### Key Global State (~25 variables)
- `allThreads`, `allIterations`, `currentPRData`, `currentConfig` - Core data
- `currentView` ('overview' | 'files'), `fileViewMode` ('changed' | 'commented' | 'all')
- `selectedFilePath`, `fileDiffCache` (Map), `fileTreeBuilt`
- `currentMergeBase` - Computed merge base commit for diffs
- `selectedIterationStart`, `selectedIterationEnd` - Iteration range
- `threadsByFilePath` (Map), `commentedFilePaths` (Set), `changedFilePaths` (Set)
- `iterationChangesCache` (Map), `filePathHistoryCache` (Map)
- `repoTreeCache` (Map), `repoTreeFullyLoaded`
- `isBulkMode`, `selectedThreadIds` (Set)

### Major Function Groups (~137 functions total)
- **Data loading & polling** (~8 funcs): `loadPRThreads()`, `fetchAndUpdate*()`, `pollPRData()`, `startPRPolling()`
- **Iteration management** (~11 funcs): iteration selector UI, drag-to-select range, file path tracking across renames
- **File tree operations** (~8 funcs): `buildFileTree()`, lazy-load repo dirs, change type indicators, thread count badges
- **Thread CRUD** (unified): `showReplyForm/hideReplyForm/submitReply/startEditComment/cancelEditComment/saveEditComment/deleteComment` take a `prefix` param ('' for Overview, 'inline-' for Files). `refreshThreadsFromAPI()` is the single refresh-after-mutation path. Inline aliases (`showInlineReplyForm`, etc.) kept for onclick compat.
- **Diff rendering** (~6 funcs): `renderFileDiff()`, inline threads between diff lines, highlighted commented lines
- **PR actions** (~8 funcs): status changes, draft toggle, abandon/reactivate, complete with merge strategy, auto-complete
- **Reviewer management** (~7 funcs): add/remove/toggle required, identity search dropdown
- **Line stats** (~8 funcs): async line count computation via local diff (fetch both versions, diff with HistogramDiff)
- **Display** (~540 lines in `displayResults()`): thread rendering, compact/detailed views, stats, code context links
- **Files view rendering** (~800 lines): file tree panel, diff panel, iteration selector

### Iteration System
- Iterations = pushes to the PR source branch
- Selector allows picking a range (start..end) to see cumulative changes
- Drag nodes to quickly select range
- Diffs computed: merge base → selected iteration range
- File paths tracked across iterations (handles renames via `buildFilePathHistory`)

### Files View Diff System
- Uses `HistogramDiff.diff()` from diff.js
- Fetches file content at two versions (merge base commit + iteration commit)
- Results cached in `fileDiffCache` (Map keyed by `filePath:iterStart-iterEnd`)
- Inline threads rendered between diff lines where comments exist
- Threads show collapsed (gutter avatar) or expanded (full comment list)

## ado-server.py - HTTP Server

- Python stdlib only (`http.server`, `socketserver`)
- Serves static files from script directory
- Two proxy endpoints:
  - `GET /avatar?id=&org=&serverUrl=` - Proxy avatar images with PAT auth, 1-week cache
  - `POST /identity-search` - Proxy Identity Picker API for reviewer search
- No-cache headers on static files (dev mode)
- Listens on localhost only

## diff.js - Histogram Diff

- `HistogramDiff.diff(oldText, newText)` → array of `{type, content, oldLine, newLine}`
- Recursive algorithm: finds low-occurrence lines as anchors, diffs regions between them
- Falls back to simple LCS for small regions (≤10 lines)
- `HistogramDiff.stats(old, new)` → `{added, removed}` counts

## Known TODOs (from TODO file)

PR Threads:
- Add linked work items
- "Ready to complete!" badge when all requirements met
- Scroll in diff file preview
- Description editing (markdown editor)
- "@" support in markdown
- Fix "unknown build" names (fetch pipeline name from buildDefinitionId)
- "requires merge strategy" policy display

PR List:
- Sort by update count
- Sort by open comment count
- Click reviewer/author to see their open comments

Global:
- Refactor avatar indicator display
- Add global option to disable live updates

Markdown:
- ~~Checkbox support~~: DONE
- ~~Escaping (like \+)~~: DONE
- ~~Bullet support (- + numbered lists)~~: DONE

## Refactoring Opportunities

### Medium Impact

- [ ] Extract inline CSS/JS from monolithic HTML files into separate `.css`/`.js` files
- [ ] Break up `displayPRs()` (266 lines) in `ado-pr-list.html` into smaller functions
- [ ] Break up `displayResults()` (540 lines) in `ado-pr-threads.html` into smaller functions
- [ ] Organize global state into state objects instead of 50+/25+ loose globals
- [ ] Fix inconsistent API methods: `setDraft()` uses raw `fetch()` instead of `fetchWithAuth()`; deduplicate `getPRThreads`/`getThreads` and `getPRIterations`/`getIterations` pairs
- [ ] Consolidate magic numbers (timeouts, thresholds) into config constants objects

### Low Impact

- [ ] Replace inline `onclick` handlers with event delegation + `data-*` attributes
- [ ] Standardize error handling (mix of `alert()`, `console.warn`, `try/catch`)
