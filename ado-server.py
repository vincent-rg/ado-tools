#!/usr/bin/env python3
"""
Simple HTTP server for Azure DevOps tools
Compatible with Python 3.9.13 - uses only standard library

Usage:
    python ado-server.py [port]
    
Default port: 8000
Access at: http://localhost:8000/
"""

import http.server
import socketserver
import sys
import os
import base64
import json
import sqlite3
import threading
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# Default port
PORT = 8000

# Override port if provided as command line argument
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        print(f"Invalid port number: {sys.argv[1]}")
        print("Usage: python ado-server.py [port]")
        sys.exit(1)

# --- Local database (ado-server.db) ---
_db_lock = threading.Lock()
_DB_PATH = str(Path(__file__).parent / 'ado-server.db')

def _get_db():
    """Open a connection to the local DB, creating tables if needed."""
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('''CREATE TABLE IF NOT EXISTS review_timestamps (
        server_url  TEXT NOT NULL,
        org         TEXT NOT NULL,
        pr_id       TEXT NOT NULL,
        thread_id   TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        PRIMARY KEY (server_url, org, pr_id, thread_id)
    )''')
    conn.commit()
    return conn

# Custom handler to set proper MIME types and proxy requests
class ADOHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/avatar?'):
            self.handle_avatar_proxy()
        elif self.path.startswith('/identity-resolve?'):
            self.handle_identity_resolve_proxy()
        elif self.path.startswith('/attachment?'):
            self.handle_attachment_proxy()
        elif self.path.startswith('/review-timestamps?') or self.path == '/review-timestamps':
            self.handle_review_timestamps_get()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/identity-search'):
            self.handle_identity_search_proxy()
        elif self.path == '/review-timestamps':
            self.handle_review_timestamps_post()
        else:
            self.send_error(404, 'Not Found')

    def do_DELETE(self):
        if self.path.startswith('/review-timestamps'):
            self.handle_review_timestamps_delete()
        else:
            self.send_error(404, 'Not Found')

    def handle_avatar_proxy(self):
        """Proxy avatar requests to Azure DevOps with PAT authentication"""
        # Parse query parameters
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        avatar_id = params.get('id', [None])[0]
        org = params.get('org', [None])[0]
        server_url = params.get('serverUrl', ['https://dev.azure.com'])[0]

        # Get PAT from header
        pat = self.headers.get('X-ADO-PAT', '')

        if not avatar_id or not org or not pat:
            self.send_error(400, 'Missing required parameters (id, org) or X-ADO-PAT header')
            return

        # Build Azure DevOps avatar URL
        ado_url = f"{server_url}/{org}/_api/_common/identityImage?id={avatar_id}"

        try:
            # Create request with PAT authentication
            auth_string = base64.b64encode(f":{pat}".encode()).decode()
            req = urllib.request.Request(ado_url)
            req.add_header('Authorization', f'Basic {auth_string}')

            # Fetch from Azure DevOps
            with urllib.request.urlopen(req, timeout=10) as response:
                image_data = response.read()
                content_type = response.headers.get('Content-Type', 'image/png')

                # Send response
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(image_data))
                self.send_header('Cache-Control', 'max-age=604800')  # Cache avatars for 1 week
                self.end_headers()
                self.wfile.write(image_data)

        except urllib.error.HTTPError as e:
            self.send_error(e.code, f'Azure DevOps returned: {e.reason}')
        except urllib.error.URLError as e:
            self.send_error(502, f'Failed to connect to Azure DevOps: {e.reason}')
        except Exception as e:
            self.send_error(500, f'Proxy error: {str(e)}')

    def handle_attachment_proxy(self):
        """Proxy ADO PR attachment image requests with PAT authentication"""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        attachment_url = params.get('url', [None])[0]
        pat = self.headers.get('X-ADO-PAT', '')

        print(f'[attachment] incoming url={attachment_url!r} pat_present={bool(pat)}', flush=True)

        if not attachment_url or not pat:
            print('[attachment] -> 400 missing url or PAT', flush=True)
            self.send_error(400, 'Missing required parameters (url) or X-ADO-PAT header')
            return

        try:
            auth_string = base64.b64encode(f":{pat}".encode()).decode()
            req = urllib.request.Request(attachment_url)
            req.add_header('Authorization', f'Basic {auth_string}')
            req.add_header('Accept', 'application/octet-stream, image/*, */*')

            print(f'[attachment] forwarding GET {attachment_url}', flush=True)
            with urllib.request.urlopen(req, timeout=10) as response:
                image_data = response.read()
                content_type = response.headers.get('Content-Type', 'application/octet-stream')
                print(f'[attachment] <- {response.status} {content_type} {len(image_data)} bytes', flush=True)

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(image_data))
                self.end_headers()
                self.wfile.write(image_data)

        except urllib.error.HTTPError as e:
            body_preview = ''
            try:
                body_preview = e.read(500).decode('utf-8', errors='replace')
            except Exception:
                pass
            print(f'[attachment] <- HTTPError {e.code} {e.reason} for {attachment_url}', flush=True)
            print(f'[attachment]    response headers: {dict(e.headers) if e.headers else {}}', flush=True)
            print(f'[attachment]    body preview: {body_preview!r}', flush=True)
            self.send_error(e.code, f'Azure DevOps returned: {e.reason}')
        except urllib.error.URLError as e:
            print(f'[attachment] <- URLError {e.reason} for {attachment_url}', flush=True)
            self.send_error(502, f'Failed to connect to Azure DevOps: {e.reason}')
        except Exception as e:
            print(f'[attachment] <- Exception {type(e).__name__}: {e} for {attachment_url}', flush=True)
            self.send_error(500, f'Proxy error: {str(e)}')

    def handle_identity_resolve_proxy(self):
        """Proxy identity resolve requests to Azure DevOps Identities API"""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        identity_id = params.get('id', [None])[0]
        org = params.get('org', [None])[0]
        server_url = params.get('serverUrl', ['https://dev.azure.com'])[0]
        pat = self.headers.get('X-ADO-PAT', '')

        if not identity_id or not org or not pat:
            self.send_error(400, 'Missing required parameters (id, org) or X-ADO-PAT header')
            return

        server_url = server_url.rstrip('/')
        # Azure DevOps Services: identities API lives on vssps.dev.azure.com
        # On-premises: same server URL
        if 'dev.azure.com' in server_url:
            identity_base = f"https://vssps.dev.azure.com/{org}"
        else:
            identity_base = f"{server_url}/{org}"
        ado_url = f"{identity_base}/_apis/identities/{urllib.parse.quote(identity_id, safe='')}?api-version=6.0"

        try:
            auth_string = base64.b64encode(f":{pat}".encode()).decode()
            req = urllib.request.Request(ado_url)
            req.add_header('Authorization', f'Basic {auth_string}')

            with urllib.request.urlopen(req, timeout=10) as response:
                response_data = response.read()
                content_type = response.headers.get('Content-Type', 'application/json')

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(response_data))
                self.end_headers()
                self.wfile.write(response_data)

        except urllib.error.HTTPError as e:
            self.send_error(e.code, f'Azure DevOps returned: {e.reason}')
        except urllib.error.URLError as e:
            self.send_error(502, f'Failed to connect to Azure DevOps: {e.reason}')
        except Exception as e:
            self.send_error(500, f'Proxy error: {str(e)}')

    def handle_identity_search_proxy(self):
        """Proxy identity search requests to Azure DevOps Identity Picker API"""
        # Get headers
        pat = self.headers.get('X-ADO-PAT', '')
        org = self.headers.get('X-ADO-Org', '')
        server_url = self.headers.get('X-ADO-Server', 'https://dev.azure.com')

        if not pat or not org:
            self.send_error(400, 'Missing required headers: X-ADO-PAT, X-ADO-Org')
            return

        # Read the POST body
        content_length = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_length)

        # Build Azure DevOps Identity Picker URL
        server_url = server_url.rstrip('/')
        ado_url = f"{server_url}/{org}/_apis/IdentityPicker/Identities?api-version=5.1-preview.1"

        try:
            # Create request with PAT authentication
            auth_string = base64.b64encode(f":{pat}".encode()).decode()
            req = urllib.request.Request(ado_url, data=post_body, method='POST')
            req.add_header('Authorization', f'Basic {auth_string}')
            req.add_header('Content-Type', 'application/json')

            # Fetch from Azure DevOps
            with urllib.request.urlopen(req, timeout=10) as response:
                response_data = response.read()
                content_type = response.headers.get('Content-Type', 'application/json')

                # Send response
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(response_data))
                self.end_headers()
                self.wfile.write(response_data)

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            self.send_error(e.code, f'Azure DevOps returned: {e.reason} - {error_body}')
        except urllib.error.URLError as e:
            self.send_error(502, f'Failed to connect to Azure DevOps: {e.reason}')
        except Exception as e:
            self.send_error(500, f'Proxy error: {str(e)}')

    def _send_json(self, data: bytes):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)

    def handle_review_timestamps_get(self):
        """Return all review timestamps for a PR."""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        server_url = params.get('serverUrl', [None])[0]
        org = params.get('org', [None])[0]
        pr_id = params.get('prId', [None])[0]
        if not server_url or not org or not pr_id:
            self.send_error(400, 'Missing required parameters: serverUrl, org, prId')
            return
        with _db_lock:
            conn = _get_db()
            try:
                rows = conn.execute(
                    'SELECT thread_id, timestamp FROM review_timestamps '
                    'WHERE server_url=? AND org=? AND pr_id=?',
                    (server_url, org, pr_id)
                ).fetchall()
            finally:
                conn.close()
        result = json.dumps([{'threadId': int(r['thread_id']), 'timestamp': r['timestamp']}
                              for r in rows]).encode()
        self._send_json(result)

    def handle_review_timestamps_post(self):
        """Set (upsert) a review timestamp for one thread."""
        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self.send_error(400, 'Invalid JSON body')
            return
        server_url = body.get('serverUrl')
        org = body.get('org')
        pr_id = str(body.get('prId', ''))
        thread_id = str(body.get('threadId', ''))
        timestamp = body.get('timestamp')
        if not server_url or not org or not pr_id or not thread_id or timestamp is None:
            self.send_error(400, 'Missing required fields: serverUrl, org, prId, threadId, timestamp')
            return
        with _db_lock:
            conn = _get_db()
            try:
                conn.execute(
                    'INSERT OR REPLACE INTO review_timestamps '
                    '(server_url, org, pr_id, thread_id, timestamp) VALUES (?,?,?,?,?)',
                    (server_url, org, pr_id, thread_id, int(timestamp))
                )
                conn.commit()
            finally:
                conn.close()
        self._send_json(json.dumps({'ok': True}).encode())

    def handle_review_timestamps_delete(self):
        """Remove a review timestamp for one thread."""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        server_url = params.get('serverUrl', [None])[0]
        org = params.get('org', [None])[0]
        pr_id = params.get('prId', [None])[0]
        thread_id = params.get('threadId', [None])[0]
        if not server_url or not org or not pr_id or not thread_id:
            self.send_error(400, 'Missing required parameters: serverUrl, org, prId, threadId')
            return
        with _db_lock:
            conn = _get_db()
            try:
                conn.execute(
                    'DELETE FROM review_timestamps '
                    'WHERE server_url=? AND org=? AND pr_id=? AND thread_id=?',
                    (server_url, org, pr_id, thread_id)
                )
                conn.commit()
            finally:
                conn.close()
        self._send_json(json.dumps({'ok': True}).encode())

    def end_headers(self):
        # Add headers to prevent caching during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Custom log format
        sys.stdout.write("%s - [%s] %s\n" %
                        (self.address_string(),
                         self.log_date_time_string(),
                         format % args))

# Change to script directory so relative paths work
os.chdir(Path(__file__).parent)

# Create server
try:
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ADOHandler) as httpd:
        print("=" * 70)
        print(f"🔧 Azure DevOps Tools Server")
        print("=" * 70)
        print(f"Server running at: http://localhost:{PORT}/")
        print(f"Serving directory: {os.getcwd()}")
        print()
        print("📄 Available Pages:")
        print(f"  🏠 Home:            http://localhost:{PORT}/")
        print(f"  ⚙️  Settings:        http://localhost:{PORT}/ado-settings.html")
        print(f"  📋 PR List:         http://localhost:{PORT}/ado-pr-list.html")
        print(f"  💬 PR Threads:      http://localhost:{PORT}/ado-pr-threads.html")
        print()
        print("💡 Quick Start:")
        print("  1. Open the home page (first link above)")
        print("  2. Click Settings to configure your Azure DevOps connection")
        print("  3. Use PR List to browse pull requests")
        print("  4. Click any PR to view its threads")
        print()
        print("Press Ctrl+C to stop the server")
        print("=" * 70)
        print()
        
        # Serve forever
        httpd.serve_forever()
        
except KeyboardInterrupt:
    print("\n\nServer stopped by user")
    sys.exit(0)
except OSError as e:
    if e.errno == 48 or e.errno == 98:  # Address already in use
        print(f"\nError: Port {PORT} is already in use.")
        print("Try a different port:")
        print(f"  python ado-server.py {PORT + 1}")
    else:
        print(f"\nError starting server: {e}")
    sys.exit(1)
