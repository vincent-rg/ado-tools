# Azure DevOps Tools

A collection of web-based tools for working with Azure DevOps Server 2022.1+

## 🚀 Quick Start

### 1. Start the Server

```bash
# Navigate to the tools directory
cd /path/to/ado-tools

# Start the server (Python 3.9.13+)
python ado-server.py

# Or specify a custom port
python ado-server.py 8080
```

The server will start at `http://localhost:8000/` by default.

### 2. Configure Settings

1. Open `http://localhost:8000/` (or `http://localhost:8000/ado-settings.html`)
2. Enter your Azure DevOps Server details:
   - Server URL (e.g., `https://your-ado-server.com`)
   - Organization/Collection (usually `DefaultCollection`)
   - Default project name
   - Default repository name
   - Personal Access Token (PAT)
3. Click **Test Connection** to verify
4. Click **Save Settings**

**Note:** Settings are stored in browser localStorage and shared across all tools.

### 3. Use the Tools

Once configured, access the tools from the home page at `http://localhost:8000/`

## 🛠️ Available Tools

### Home Page (`index.html`)
Landing page with navigation to all available tools and setup status.

### Settings (`ado-settings.html`)
Configure your Azure DevOps Server connection and default project/repository. All tools share these settings.

**Features:**
- Server connection configuration
- PAT management
- Connection testing
- Shared settings across all tools

### PR List (`ado-pr-list.html`)
Browse and filter Pull Requests across all projects and repositories in your collection.

**Features:**
- **Project & Repository Selection**:
  - Loads all projects in the collection
  - Shows repositories for selected projects
  - Multi-select with checkboxes
- **Advanced Filtering**:
  - PR status (active, completed, abandoned, all)
  - PR ID (exact match)
  - Created by (autocomplete from loaded PRs)
  - Assigned to / Reviewers (autocomplete from loaded PRs)
  - Real-time filtering as you type
- **Easy Navigation**:
  - Click any PR to view its threads
  - Automatically updates project/repo context

**Usage:**
1. Go to `http://localhost:8000/ado-pr-list.html`
2. Select projects and repositories
3. Click **Load Pull Requests**
4. Use filters to find specific PRs
5. Click on a PR to view its threads

### PR Threads Viewer (`ado-pr-threads.html`)
View and manage all discussion threads in a Pull Request with advanced filtering and bulk operations.

**Features:**
- **Thread Display**:
  - Lists all threads with comments
  - Resolves @mentions to display names
  - Renders Markdown (links, images, code blocks, formatting)
  - Shows comment types (Text, System, Code Change, Deleted)
  - Thread statistics (Active, Fixed, Closed, Deleted counts)
  - Raw JSON view for debugging

- **Code Context Links**:
  - View comments in Azure DevOps diff with iteration ranges
  - 📋 Before: Code state when comment was made
  - 📝 After: Changes made after comment
  - 📄 Complete: Full PR diff from first to latest update

- **Thread Filtering**:
  - Show/hide deleted threads
  - Filter by status (active, fixed, closed, completed, unknown)
  - Filter by first comment author
  - Real-time count of filtered threads
  - Filters work with AND logic

- **View Modes**:
  - **Detailed View**: Full comment display with context (default)
  - **Compact View**: One line per comment for quick scanning
  - Toggle button to switch between modes

- **Thread Status Management** (requires PAT with write permissions):
  - **Individual Change**: Dropdown on each thread header
  - **Bulk Change**:
    - Enable bulk selection mode
    - Select multiple threads with checkboxes
    - Select/deselect all buttons
    - Change status of all selected threads at once
    - Confirmation dialog before applying
    - Shows success/failure summary

**Usage:**
1. Navigate from PR List (recommended) OR
2. Go to `http://localhost:8000/ado-pr-threads.html?prId=123`
3. Threads load automatically if PR ID is in URL
4. Use filters to find specific threads
5. Toggle compact view for quick scanning
6. Change thread status individually or in bulk

**Note:** Status changes require a PAT with "Code (Write)" permissions. Read-only PATs will see helpful error messages.

## 🔐 Security

- **PAT Storage**: Your Personal Access Token is stored in browser localStorage
- **Localhost Only**: The server only listens on localhost (127.0.0.1)
- **No External Access**: Not accessible from other machines
- **User Folder Encryption**: If your user folder is encrypted (BitLocker, EFS), localStorage is encrypted at rest
- **No Data Sent Externally**: All communication stays between your browser and your ADO server

## 📋 Requirements

- **Python**: 3.9.13 or higher (standard library only, no dependencies)
- **Browser**: Modern browser (Chrome, Firefox, Edge, Safari)
- **Azure DevOps Server**: 2022.1 or compatible version
- **PAT Permissions**:
  - "Code (Read)" - Required for all features
  - "Code (Write)" - Optional, needed for thread status changes

## 🔧 Creating a Personal Access Token

1. Log in to Azure DevOps Server
2. Click your profile icon → **Security**
3. Under **Personal Access Tokens** → **New Token**
4. Configure:
   - Name: "ADO Tools"
   - Expiration: Set as needed
   - Scopes:
     - **Code (Read)** - Required
     - **Code (Write)** - Optional (for thread status changes)
5. Click **Create**
6. **Copy the token immediately** (won't be shown again)

## 📁 File Structure

```
ado-tools/
├── ado-server.py          # Python HTTP server
├── common.css             # Shared styles across all pages
├── common.js              # Shared JavaScript utilities
├── index.html             # Home page with navigation
├── ado-settings.html      # Settings/configuration page
├── ado-pr-list.html       # PR list browser
├── ado-pr-threads.html    # PR threads viewer
└── README.md              # This file
```

## ⚙️ Server Options

```bash
# Default port (8000)
python ado-server.py

# Custom port
python ado-server.py 9000

# Stop server
Press Ctrl+C
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Try a different port
python ado-server.py 8001
```

### Connection Failed
- Verify server URL is correct
- Check PAT has required permissions
- Ensure PAT hasn't expired
- Test in Settings page with "Test Connection" button
- Check network access to ADO server

### Settings Not Persisting
- Make sure you're accessing via `http://localhost` (not `file://`)
- Check browser isn't in incognito/private mode
- Try clearing cache and reconfiguring

### Thread Status Changes Not Working
- Verify PAT has "Code (Write)" permissions
- Check thread is not deleted or unknown status
- Review error message for specific issue

## 🎯 Tips

- **Start at Home**: Use `http://localhost:8000/` as your entry point
- **Configure Once**: Settings are shared across all tools
- **Use PR List**: Easiest way to navigate to specific PRs
- **URL Parameters**: Direct links work (e.g., `?prId=123`)
- **Keyboard Shortcuts**: Browser shortcuts work (Ctrl+F to search page, etc.)
- **Multiple Servers**: Run multiple instances on different ports for different ADO servers
- **Compact View**: Great for quickly scanning long thread lists
- **Bulk Operations**: Use filters first, then bulk select for efficiency

## 📝 Architecture Notes

- **No installation required**: Pure Python standard library
- **No external dependencies**: Works on corporate machines with restrictions
- **Client-side only**: All logic runs in browser
- **Direct API calls**: Browser → Azure DevOps Server (no proxy)
- **Offline capable**: Works without internet (if ADO server is accessible)
- **Cross-platform**: Works on Windows, macOS, Linux

## 🔄 Updates

To update tools:
1. Stop the server (Ctrl+C)
2. Replace files with new versions (or `git pull`)
3. Restart the server
4. Hard refresh browser (Ctrl+F5 or Shift+F5)

## 📞 Support

For issues or questions, check:
- Raw JSON view in tools for API responses
- Browser console (F12) for JavaScript errors
- Server output for HTTP errors
- Settings page connection test

## 🎨 Customization

All files are plain HTML/CSS/JavaScript. Feel free to modify:
- Colors and styling in `common.css` or inline styles
- Behavior in `common.js` or page-specific scripts
- Server port and behavior in `ado-server.py`

## 📖 API Reference

The tools use Azure DevOps REST API 6.0:
- Pull Requests: `_apis/git/repositories/{repo}/pullRequests`
- Threads: `_apis/git/repositories/{repo}/pullRequests/{id}/threads`
- Iterations: `_apis/git/repositories/{repo}/pullRequests/{id}/iterations`
- Projects: `_apis/projects`
- Repositories: `_apis/git/repositories`

See each tool's "View Raw JSON" or "API Endpoints Used" sections for specific calls.
