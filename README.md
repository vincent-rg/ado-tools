# Azure DevOps Tools

A collection of web-based tools for working with Azure DevOps Server 2022.1

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

1. Open `http://localhost:8000/ado-settings.html`
2. Enter your Azure DevOps Server details:
   - Server URL (e.g., `https://your-ado-server.com`)
   - Organization/Collection (usually `DefaultCollection`)
   - Project name
   - Repository name
   - Personal Access Token (PAT)
3. Click **Test Connection** to verify
4. Click **Save Settings**

**Note:** Settings are stored in browser localStorage and shared across all tools.

### 3. Use the Tools

Once configured, you can access:
- **PR Threads Viewer**: `http://localhost:8000/ado-pr-threads.html`
- More tools coming soon...

## 🔐 Security

- **PAT Storage**: Your Personal Access Token is stored in browser localStorage
- **Localhost Only**: The server only listens on localhost (127.0.0.1)
- **No External Access**: Not accessible from other machines
- **User Folder Encryption**: If your user folder is encrypted (BitLocker, EFS), localStorage is encrypted at rest

## 🛠️ Available Tools

### PR Threads Viewer
View and analyze all discussion threads in a Pull Request.

**Features:**
- Lists all threads with comments
- Resolves @mentions to display names
- Renders Markdown links and images
- Shows comment types (Text, System, Code Change)
- Highlights deleted comments and threads
- **Code context links**: View comments in diff with iteration ranges
  - 📋 Before: Code state when comment was made
  - 📝 After: Changes made after comment
  - 🔍 Complete: Full PR diff
- Raw JSON view for debugging
- Direct links to Azure DevOps

**Usage:**
1. Go to `http://localhost:8000/ado-pr-threads.html`
2. Enter PR ID (or use URL parameter: `?prId=123`)
3. Click **Load PR Threads**

## 📋 Requirements

- **Python**: 3.9.13 or higher (standard library only, no dependencies)
- **Browser**: Modern browser (Chrome, Firefox, Edge, Safari)
- **Azure DevOps Server**: 2022.1 or compatible version
- **PAT**: Personal Access Token with "Code (Read)" permissions

## 🔧 Creating a Personal Access Token

1. Log in to Azure DevOps Server
2. Click your profile icon → **Security**
3. Under **Personal Access Tokens** → **New Token**
4. Configure:
   - Name: "ADO Tools"
   - Expiration: Set as needed
   - Scopes: **Code (Read)**
5. Click **Create**
6. **Copy the token immediately** (won't be shown again)

## 📁 File Structure

```
ado-tools/
├── ado-server.py          # Python HTTP server
├── ado-settings.html      # Settings/configuration page
├── ado-pr-threads.html    # PR threads viewer tool
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
- Check PAT has "Code (Read)" permissions
- Ensure PAT hasn't expired
- Test in Settings page with "Test Connection" button

### Settings Not Persisting
- Make sure you're accessing via `http://localhost` (not `file://`)
- Check browser isn't in incognito/private mode
- Try clearing cache and reconfiguring

## 🎯 Tips

- **Bookmark the settings page** for easy access
- **Configure once**: Settings are shared across all tools
- **URL parameters**: Most tools support URL parameters (e.g., `?prId=123`)
- **Multiple servers**: Run multiple instances on different ports for different ADO servers

## 📝 Notes

- **No installation required**: Pure Python standard library
- **No external dependencies**: Works on corporate machines with restrictions
- **Offline capable**: Works without internet (if ADO server is accessible)
- **Cross-platform**: Works on Windows, macOS, Linux

## 🔄 Updates

To update tools:
1. Stop the server (Ctrl+C)
2. Replace HTML files with new versions
3. Restart the server
4. Hard refresh browser (Ctrl+F5)

## 📞 Support

For issues or questions, check:
- Raw JSON view in tools for API responses
- Browser console for JavaScript errors
- Server output for HTTP errors
