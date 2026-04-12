"""
Talking Points Generator API Server
Fetches campaign data from the SpotsNow station API, scrapes the brand website,
then uses Claude to generate talking points.
"""

import os
import json
import re
import ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError

import anthropic

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

STATION_API = "https://station-api-693004779323.northamerica-northeast2.run.app"

# Map known frontend domains to the station API
# Both spotsnow.io and the pre-prod Firebase domain use the same backend
KNOWN_DOMAINS = [
    "spotsnow.io",
    "app.spotsnow.io",
    "www.spotsnow.io",
    "pre-prod-staging--core-production-3c790.us-central1.hosted.app",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch_json(url: str) -> dict:
    """Fetch JSON from a URL."""
    ctx = ssl.create_default_context()
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "SpotsNow-TalkingPoints/1.0",
    })
    with urlopen(req, context=ctx, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_page_text(url: str, max_bytes: int = 200_000) -> str:
    """Fetch a web page and return stripped text content."""
    ctx = ssl.create_default_context()
    if not url.startswith("http"):
        url = "https://" + url
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    })
    try:
        with urlopen(req, context=ctx, timeout=15) as resp:
            raw = resp.read(max_bytes)
            try:
                html = raw.decode("utf-8")
            except UnicodeDecodeError:
                html = raw.decode("latin-1")
    except Exception as e:
        return f"[Error fetching {url}: {e}]"

    # Strip HTML to text
    html = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"&nbsp;", " ", html)
    html = re.sub(r"&amp;", "&", html)
    html = re.sub(r"&lt;", "<", html)
    html = re.sub(r"&gt;", ">", html)
    html = re.sub(r"&#\d+;", " ", html)
    html = re.sub(r"\s+", " ", html)
    return html.strip()[:15000]


def extract_campaign_id(url: str) -> str:
    """Extract campaign UUID from a SpotsNow URL like /c/{id}."""
    match = re.search(r"/c/([0-9a-f-]{36})", url)
    if match:
        return match.group(1)
    # Try just a raw UUID
    match = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", url)
    if match:
        return match.group(1)
    return ""


# ---------------------------------------------------------------------------
# Claude generation
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You write podcast ad talking points. Short, natural, ready to read aloud.

Tone: conversational, genuine. Like a friend recommending something — not a sales pitch.

Critical rules:
- CONCISE. Each bullet is 1-2 sentences max. A creator should be able to glance at a bullet and riff on it.
- Bullets are prompts to talk about, not scripts. Give the creator the *what*, they'll find the *how*.
- Use • for bullets
- Call to action: one tight paragraph with the URL/code. Ready to read verbatim.
- Don't say: short, specific, practical
- No filler, no corporate language, no "game-changer" or "revolutionary"
"""


def generate_talking_points(campaign_data: dict, brand_text: str, product_name: str = "") -> dict:
    """Call Claude to generate structured talking points."""

    client = anthropic.Anthropic()

    # Extract structured data from campaign
    brand = campaign_data.get("brand", {})
    reqs = campaign_data.get("campaignRequirements", {})
    age = reqs.get("ageTarget", {})
    country = reqs.get("countryTarget", {})
    audience = reqs.get("targetAudience", {})
    details = campaign_data.get("details", {})
    ai_summary = details.get("aiSummary", {})

    # Build podcast context from recommended shows
    podcasts = campaign_data.get("podcasts", [])
    podcast_summary = ""
    for pod in podcasts[:5]:
        p = pod.get("podcast", {})
        podcast_summary += f"- {p.get('name', '?')} ({p.get('primaryCategory', '')}): {p.get('description', '')[:200]}...\n"

    product_line = ""
    if product_name:
        product_line = f"\nSpecific product/service to focus on: {product_name}"

    user_prompt = f"""\
Brand: {brand.get("name", "Unknown")} ({brand.get("domain", "")})
{brand.get("description", "")}
{product_line}

Website content:
{brand_text[:4000]}

Audience: {", ".join(audience.get("descriptions", []))}
Interests: {", ".join(audience.get("interests", [])[:8])}
Age: {age.get("minAge", "?")}–{age.get("maxAge", "?")} | Gender: {reqs.get("genderSplit", "Not specified")} | Country: {country.get("countryCode", "US")}

Campaign context: {ai_summary.get("reason", "")}

---

Return JSON with these keys. Keep it SHORT — a creator should scan this in 30 seconds.

- "brandName": brand name (clean, no "LLC" etc.)
- "introduction": 2-3 bullets (•). Each bullet = one talking prompt, 1 sentence. What is it, who is it for, what makes it different.
- "personalExperience": 2-3 bullets (•). Prompts for the creator to riff on. What to try, how it felt, why they'd recommend it.
- "callToAction": One short paragraph, ready to read word-for-word. Include URL and any discount code.
- "keyMessages": 2-3 bullets (•). Core things to hit. One sentence each.
- "doNotSay": 2-3 bullets (•). Specific things to avoid.
- "pronunciation": Phonetic guide for the brand name.

Return ONLY valid JSON."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = message.content[0].text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    return json.loads(text)


# ---------------------------------------------------------------------------
# HTTP Server
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json_response(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path == "/talking-points":
            # Serve the HTML file
            html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "talking-points.html")
            try:
                with open(html_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self._cors()
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self._json_response(404, {"error": "HTML file not found"})
        elif self.path.endswith(".png") or self.path.endswith(".jpg") or self.path.endswith(".svg"):
            # Serve static assets
            file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), self.path.lstrip("/"))
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                ext = self.path.rsplit(".", 1)[-1]
                mime = {"png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml"}.get(ext, "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
        else:
            self._json_response(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/api/create-google-doc":
            return self._handle_create_gdoc()

        if self.path == "/api/download-doc":
            return self._handle_download_doc()

        if self.path != "/api/generate-talking-points":
            self._json_response(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json_response(400, {"error": "Invalid JSON body"})
            return

        campaign_url = body.get("campaignUrl", "").strip()
        if not campaign_url:
            self._json_response(400, {"error": "campaignUrl is required"})
            return

        # Extract campaign ID from URL
        campaign_id = extract_campaign_id(campaign_url)
        if not campaign_id:
            self._json_response(400, {"error": "Could not extract campaign ID from URL"})
            return

        # Step 1: Fetch campaign data from station API
        # If only fetching campaign info (no generation), return the raw data
        fetch_only = body.get("fetchOnly", False)
        print(f"[INFO] Fetching campaign: {campaign_id} (fetchOnly={fetch_only})")
        try:
            campaign_resp = fetch_json(f"{STATION_API}/advertising-campaign/{campaign_id}")
            if not campaign_resp.get("success"):
                self._json_response(400, {"error": "Campaign not found"})
                return
            campaign_data = campaign_resp["data"]
        except Exception as e:
            print(f"[ERROR] Failed to fetch campaign: {e}")
            self._json_response(500, {"error": f"Failed to fetch campaign data: {e}"})
            return

        # Extract brand info
        brand = campaign_data.get("brand", {})
        brand_domain = brand.get("domain", "")
        brand_name = brand.get("name", "Unknown Brand")

        print(f"[INFO] Brand: {brand_name} ({brand_domain})")

        # If fetchOnly, return campaign metadata for pre-filling the form
        if fetch_only:
            reqs = campaign_data.get("campaignRequirements", {})
            age = reqs.get("ageTarget", {})
            country = reqs.get("countryTarget", {})
            audience = reqs.get("targetAudience", {})
            ai_summary = campaign_data.get("details", {}).get("aiSummary", {})

            self._json_response(200, {
                "brandName": brand_name,
                "brandDomain": brand_domain,
                "brandDescription": brand.get("description", ""),
                "brandLogoUrl": brand.get("logoUrl", ""),
                "ageMin": age.get("minAge"),
                "ageMax": age.get("maxAge"),
                "country": country.get("countryCode", "US"),
                "interests": audience.get("interests", []),
                "audienceDescriptions": audience.get("descriptions", []),
                "campaignSummary": ai_summary.get("reason", ""),
                "budget": campaign_data.get("budget", ""),
            })
            return

        # Step 2: Scrape brand website for additional context
        brand_text = ""
        if brand_domain:
            print(f"[INFO] Scraping brand website: {brand_domain}")
            brand_text = fetch_page_text(brand_domain)
            if brand_text.startswith("[Error"):
                print(f"[WARN] Brand scrape issue: {brand_text[:200]}")
                brand_text = ""

        # Step 3: Generate talking points with Claude
        print("[INFO] Calling Claude to generate talking points...")
        try:
            product_name = body.get("productName", "")

            # Apply audience overrides from the user if provided
            overrides = body.get("audienceOverrides")
            if overrides:
                reqs = campaign_data.setdefault("campaignRequirements", {})
                if overrides.get("interests"):
                    reqs.setdefault("targetAudience", {})["interests"] = [
                        i.strip() for i in overrides["interests"].split(",") if i.strip()
                    ]
                if overrides.get("audienceDescriptions"):
                    reqs.setdefault("targetAudience", {})["descriptions"] = [
                        d.strip() for d in overrides["audienceDescriptions"].split(",") if d.strip()
                    ]
                if overrides.get("ageMin") and overrides.get("ageMax"):
                    reqs["ageTarget"] = {
                        "minAge": int(overrides["ageMin"]),
                        "maxAge": int(overrides["ageMax"]),
                    }
                if overrides.get("country"):
                    reqs["countryTarget"] = {"countryCode": overrides["country"]}
                if overrides.get("genderSplit"):
                    reqs["genderSplit"] = overrides["genderSplit"]

            result = generate_talking_points(campaign_data, brand_text, product_name)
            # Add brand website to response
            result["brandWebsite"] = f"https://{brand_domain}" if brand_domain else ""
            self._json_response(200, result)
            print(f"[INFO] Done — brand: {result.get('brandName', '?')}")
        except json.JSONDecodeError as e:
            print(f"[ERROR] Claude returned invalid JSON: {e}")
            self._json_response(500, {"error": "AI returned invalid response. Please try again."})
        except anthropic.APIError as e:
            print(f"[ERROR] Anthropic API error: {e}")
            self._json_response(500, {"error": f"AI API error: {e.message}"})
        except Exception as e:
            print(f"[ERROR] Unexpected error: {e}")
            self._json_response(500, {"error": str(e)})

    def _build_doc_html(self, body):
        """Build a clean HTML doc from sections."""
        brand = body.get("brandName", "Brand")
        website = body.get("brandWebsite", "")
        sections = body.get("sections", [])
        today = __import__("datetime").date.today().strftime("%B %d, %Y")

        html = f"""<html><head><meta charset="utf-8"><style>
body {{ font-family: Arial, sans-serif; font-size: 11pt; color: #17212b; padding: 32px; }}
h1 {{ font-size: 18pt; margin: 0 0 4px; }}
.url {{ font-size: 10pt; color: #8a95a3; margin: 0 0 24px; }}
h2 {{ font-size: 11pt; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e8eaed; }}
.verbatim {{ font-size: 8pt; color: #e8474c; background: #fef2f2; padding: 1px 5px; border-radius: 3px; margin-left: 6px; text-transform: uppercase; }}
.content {{ font-size: 10pt; color: #5a6472; line-height: 1.7; white-space: pre-wrap; margin: 0; }}
.footer {{ margin-top: 28px; padding-top: 12px; border-top: 1px solid #e8eaed; font-size: 9pt; color: #8a95a3; }}
</style></head><body>
<h1>Talking Points &mdash; {brand}</h1>
<p class="url">{website.replace("https://", "").replace("http://", "")}</p>
"""
        for s in sections:
            label = s.get("label", "")
            content = s.get("content", "")
            verbatim = s.get("verbatim", False)
            if not content:
                continue
            vtag = '<span class="verbatim">Read Verbatim</span>' if verbatim else ""
            html += f'<h2>{label}{vtag}</h2>\n<p class="content">{content}</p>\n'

        html += f'<p class="footer">Generated by SpotsNow &middot; {today}</p></body></html>'
        return html

    def _handle_create_gdoc(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json_response(400, {"error": "Invalid JSON body"})
            return

        # Return formatted HTML content for Google Doc creation
        html = self._build_doc_html(body)
        import base64
        b64 = base64.b64encode(html.encode("utf-8")).decode("ascii")
        self._json_response(200, {
            "htmlContent": b64,
            "title": f"{body.get('brandName', 'Brand')} — Talking Points",
        })

    def _handle_download_doc(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json_response(400, {"error": "Invalid JSON body"})
            return

        html = self._build_doc_html(body)
        brand = body.get("brandName", "Brand")
        filename = f"{brand.replace(' ', '-')}-talking-points.doc"
        content = html.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/msword")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        pass


def main():
    port = int(os.environ.get("PORT", 8787))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Talking Points API running on http://localhost:{port}")
    print("Endpoints:")
    print(f"  POST http://localhost:{port}/api/generate-talking-points")
    print(f"  Body: {{ \"campaignUrl\": \"https://...spotsnow.../c/UUID\" }}")
    print()
    server.serve_forever()


if __name__ == "__main__":
    main()
