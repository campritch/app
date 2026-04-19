#!/usr/bin/env python3
"""YouTube → Article backend server."""

import os
import re
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

import anthropic
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from thumbnail_generator import generate_thumbnail, split_headline


def extract_video_id(url: str):
    """Extract YouTube video ID from various URL formats."""
    for pattern in [r"(?:v=|youtu\.be/|embed/|v/|shorts/)([A-Za-z0-9_-]{11})"]:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_transcript(video_id: str) -> str:
    transcript = YouTubeTranscriptApi().fetch(video_id)
    return " ".join(chunk.text for chunk in transcript)


def generate_article(transcript: str) -> dict:
    """Call Claude to turn a transcript into an article + thumbnail headline."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""You are an expert writer and journalist. Below is the transcript of a YouTube video.

1. Write a well-structured, engaging article:
   - Compelling headline
   - Strong lede that hooks the reader
   - Clear sections with subheadings where appropriate
   - Readable style — not a transcript dump
   - Preserve key ideas, quotes, and insights
   - Brief conclusion

2. At the very end, after the article, output this exact block:
---THUMBNAIL---
LINE1: [3-5 word context phrase, e.g. "THE COST OF"]
LINE2: [2-4 word punchy key phrase, e.g. "PODCAST ADS"]
---END---

Return the article in clean markdown, then the THUMBNAIL block.

Transcript:
{transcript}"""

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text

    # Parse out thumbnail lines
    line1, line2 = "", ""
    if "---THUMBNAIL---" in raw and "---END---" in raw:
        block = raw.split("---THUMBNAIL---")[1].split("---END---")[0]
        for row in block.strip().splitlines():
            if row.startswith("LINE1:"):
                line1 = row.replace("LINE1:", "").strip()
            elif row.startswith("LINE2:"):
                line2 = row.replace("LINE2:", "").strip()
        article = raw.split("---THUMBNAIL---")[0].strip()
    else:
        article = raw

    return {"article": article, "line1": line1, "line2": line2}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

    def send_json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))

        if self.path == "/generate":
            self._handle_generate(body)
        elif self.path == "/thumbnail":
            self._handle_thumbnail(body)
        else:
            self.send_json(404, {"error": "Not found"})

    def _handle_generate(self, body):
        url = body.get("url", "").strip()
        if not url:
            self.send_json(400, {"error": "Missing YouTube URL"})
            return

        video_id = extract_video_id(url)
        if not video_id:
            self.send_json(400, {"error": "Could not parse a video ID from that URL"})
            return

        try:
            print(f"Fetching transcript for video: {video_id}")
            transcript = get_transcript(video_id)
        except TranscriptsDisabled:
            self.send_json(400, {"error": "Transcripts are disabled for this video"})
            return
        except NoTranscriptFound:
            self.send_json(400, {"error": "No transcript found for this video"})
            return
        except Exception as e:
            self.send_json(500, {"error": f"Transcript error: {str(e)}"})
            return

        try:
            print("Generating article with Claude...")
            result = generate_article(transcript)
        except ValueError as e:
            self.send_json(500, {"error": str(e)})
            return
        except Exception as e:
            self.send_json(500, {"error": f"Claude error: {str(e)}"})
            return

        # Generate initial thumbnail at default settings
        try:
            print("Generating thumbnail...")
            thumb_b64 = generate_thumbnail(
                result["line1"], result["line2"],
                photo_index=0, complexity=0.7,
                bg_name="dark", photo_side="right",
            )
        except Exception as e:
            print(f"Thumbnail warning: {e}")
            thumb_b64 = ""

        self.send_json(200, {
            "article": result["article"],
            "video_id": video_id,
            "line1": result["line1"],
            "line2": result["line2"],
            "thumbnail": thumb_b64,
        })

    def _handle_thumbnail(self, body):
        try:
            thumb_b64 = generate_thumbnail(
                line1=body.get("line1", ""),
                line2=body.get("line2", ""),
                photo_index=int(body.get("photo_index", 0)),
                complexity=float(body.get("complexity", 0.7)),
                bg_name=body.get("bg_name", "dark"),
                photo_side=body.get("photo_side", "right"),
            )
            self.send_json(200, {"thumbnail": thumb_b64})
        except Exception as e:
            self.send_json(500, {"error": str(e)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5055))
    print(f"Starting server on http://localhost:{port}")
    server = HTTPServer(("localhost", port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
