"""Vercel serverless function: generate branded thumbnail."""

import os
import io
import json
import base64
from http.server import BaseHTTPRequestHandler
from PIL import Image, ImageDraw, ImageFont, ImageFilter


W, H = 1280, 720
CORAL_RGB  = (237, 116, 112)
CORAL_GLOW = (255, 138, 135)

BG_OPTIONS = {
    "dark":  (14, 19, 35),
    "coral": (237, 116, 112),
    "black": (17, 17, 17),
    "navy":  (10, 14, 40),
}

# Pre-cut photos live next to this file in cutouts/
HERE = os.path.dirname(__file__)
PHOTOS = [
    os.path.join(HERE, "cutouts", "cam1.png"),
    os.path.join(HERE, "cutouts", "cam2.png"),
    os.path.join(HERE, "cutouts", "cam3.png"),
    os.path.join(HERE, "cutouts", "cam_color.png"),
]


def _get_font(size, bold=True):
    candidates = [
        "/var/task/api/fonts/Inter-Bold.ttf" if bold else "/var/task/api/fonts/Inter-Regular.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _place_photo(canvas, photo_path, side, complexity):
    if not os.path.exists(photo_path):
        return
    photo = Image.open(photo_path).convert("RGBA")
    photo_h = int(H * 0.95)
    ratio = photo_h / photo.height
    photo_w = int(photo.width * ratio)
    photo = photo.resize((photo_w, photo_h), Image.LANCZOS)
    x = W - photo_w - 20 if side == "right" else 20
    y = H - photo_h

    if complexity > 0.5:
        glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        cx = x + photo_w // 2
        glow_a = int(60 * (complexity - 0.5) * 2)
        for r in range(300, 50, -30):
            a = max(0, glow_a - int(glow_a * (1 - r / 300)))
            gd.ellipse([cx - r, H // 2 - r, cx + r, H // 2 + r], fill=(*CORAL_RGB, a))
        glow = glow.filter(ImageFilter.GaussianBlur(40))
        canvas.paste(glow, (0, 0), glow)

    canvas.paste(photo, (x, y), photo)


def _draw_headline(canvas, line1, line2, side, bg):
    draw = ImageDraw.Draw(canvas)
    is_dark = sum(bg) < 300
    text_color = (255, 255, 255) if is_dark else (17, 17, 17)
    text_x = 60 if side == "right" else W // 2 + 40
    text_y = H // 3

    font1 = _get_font(52, bold=False)
    draw.text((text_x, text_y), line1.upper(), font=font1, fill=text_color)
    bb = font1.getbbox(line1.upper())
    line1_h = bb[3] - bb[1]

    font2 = _get_font(72, bold=True)
    bb2 = font2.getbbox(line2.upper())
    px, py = 18, 10
    box_w = bb2[2] - bb2[0] + px * 2
    box_h = bb2[3] - bb2[1] + py * 2
    box_y = text_y + line1_h + 14
    draw.rectangle([text_x - px, box_y, text_x - px + box_w, box_y + box_h], fill=CORAL_RGB)
    draw.text((text_x, box_y + py - bb2[1]), line2.upper(), font=font2, fill=(255, 255, 255))


def _draw_elaborate(canvas, side, complexity):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    alpha = int(180 * complexity)
    ax = int(alpha * 0.85)

    lx = 60 if side == "right" else W - 310

    if complexity > 0.3:
        bars = [0.4, 0.6, 0.5, 0.75, 0.65, 0.9]
        bw, gap, mh = 28, 10, 160
        for i, h_frac in enumerate(bars):
            bh = int(mh * h_frac)
            bx = lx + i * (bw + gap)
            by = 80 + mh - bh
            draw.rectangle([bx, by, bx + bw, 80 + mh], fill=(*CORAL_RGB, ax))
            draw.rectangle([bx, by, bx + bw, 80 + mh], outline=(*CORAL_GLOW, min(255, ax + 40)), width=2)

    if complexity > 0.5:
        ax2 = int(alpha * 0.9)
        arx = lx + 280 if side == "right" else lx + 280
        draw.line([(arx, 180), (arx, 60)], fill=(*CORAL_RGB, ax2), width=4)
        draw.polygon([(arx - 12, 80), (arx + 12, 80), (arx, 60)], fill=(*CORAL_RGB, ax2))

    if complexity > 0.65:
        font = _get_font(48, bold=True)
        ga = int(220 * (complexity - 0.65) / 0.35)
        gx = lx
        draw.text((gx + 2, 37), "GROWTH", font=font, fill=(0, 0, 0, int(ga * 0.5)))
        draw.text((gx, 35), "GROWTH", font=font, fill=(*CORAL_RGB, ga))

    if complexity > 0.7:
        rx = W - 180 if side == "right" else 200
        nodes = [(rx, 140), (rx - 80, 80), (rx + 80, 80), (rx - 100, 180), (rx + 100, 180)]
        na = int(160 * (complexity - 0.7) / 0.3)
        for a, b in [(0,1),(0,2),(0,3),(0,4),(1,2)]:
            draw.line([nodes[a], nodes[b]], fill=(*CORAL_RGB, na // 2), width=2)
        for nx, ny in nodes:
            draw.ellipse([nx-12, ny-12, nx+12, ny+12], outline=(*CORAL_RGB, na), width=3)

    if complexity > 0.5:
        overlay = overlay.filter(ImageFilter.GaussianBlur(1.5))
    canvas.paste(overlay, (0, 0), overlay)


def generate(line1, line2, photo_index=0, complexity=0.7, bg_name="dark", photo_side="right"):
    complexity = max(0.0, min(1.0, complexity))
    bg = BG_OPTIONS.get(bg_name, BG_OPTIONS["dark"])
    canvas = Image.new("RGB", (W, H), bg)

    _place_photo(canvas, PHOTOS[photo_index % len(PHOTOS)], photo_side, complexity)
    if complexity > 0.2:
        _draw_elaborate(canvas, photo_side, complexity)
    _draw_headline(canvas, line1, line2, photo_side, bg)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


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

        try:
            thumb = generate(
                line1=body.get("line1", ""),
                line2=body.get("line2", ""),
                photo_index=int(body.get("photo_index", 0)),
                complexity=float(body.get("complexity", 0.7)),
                bg_name=body.get("bg_name", "dark"),
                photo_side=body.get("photo_side", "right"),
            )
            self.send_json(200, {"thumbnail": thumb})
        except Exception as e:
            self.send_json(500, {"error": str(e)})
