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

# Custom handler to set proper MIME types
class ADOHandler(http.server.SimpleHTTPRequestHandler):
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
