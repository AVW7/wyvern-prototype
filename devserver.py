#!/usr/bin/env python3
"""Static server for the prototype, with caching disabled.

Plain `python3 -m http.server` sends Last-Modified but no Cache-Control, so
browsers heuristically cache the ES modules under src/ and keep running stale
code after an edit. Serving no-store means a normal reload always picks up
what's on disk.
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.test(HandlerClass=NoCacheHandler, port=port)
