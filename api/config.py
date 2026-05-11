"""Returns the Anthropic API key from environment to the frontend."""

import os
import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        body = json.dumps({"key": key}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
