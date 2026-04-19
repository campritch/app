"""Vercel serverless function: YouTube URL → article + thumbnail headline."""

import os
import re
import json
from http.server import BaseHTTPRequestHandler

import anthropic
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound


def extract_video_id(url):
    match = re.search(r"(?:v=|youtu\.be/|embed/|v/|shorts/)([A-Za-z0-9_-]{11})", url)
    return match.group(1) if match else None


def get_transcript(video_id):
    transcript = YouTubeTranscriptApi().fetch(video_id)
    return " ".join(chunk.text for chunk in transcript)


def generate_article(transcript):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

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
            result = generate_article(transcript)
        except Exception as e:
            self.send_json(500, {"error": f"Claude error: {str(e)}"})
            return

        self.send_json(200, {
            "article": result["article"],
            "video_id": video_id,
            "line1": result["line1"],
            "line2": result["line2"],
        })
