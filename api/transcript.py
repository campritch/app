"""Vercel serverless function: fetch YouTube transcript only."""

import re
import json
from http.server import BaseHTTPRequestHandler
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound


def extract_video_id(url):
    match = re.search(r"(?:v=|youtu\.be/|embed/|v/|shorts/)([A-Za-z0-9_-]{11})", url)
    return match.group(1) if match else None


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self.send_json(400, {"error": "Invalid request body"})
            return

        url = body.get("url", "").strip()
        if not url:
            self.send_json(400, {"error": "Missing YouTube URL"})
            return

        video_id = extract_video_id(url)
        if not video_id:
            self.send_json(400, {"error": "Could not parse a video ID from that URL"})
            return

        try:
            transcript = YouTubeTranscriptApi().fetch(video_id)
            text = " ".join(chunk.text for chunk in transcript)
        except TranscriptsDisabled:
            self.send_json(400, {"error": "Transcripts are disabled for this video"})
            return
        except NoTranscriptFound:
            self.send_json(400, {"error": "No transcript found for this video"})
            return
        except Exception as e:
            self.send_json(500, {"error": f"Transcript error: {str(e)}"})
            return

        self.send_json(200, {"transcript": text, "video_id": video_id})
