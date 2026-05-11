"""
Thumbnail generator for SpotsNow YouTube thumbnails.
Produces 1280x720 images with Campbell's photo composited onto a branded background.
complexity=0 → clean flat style, complexity=100 → elaborate graphic overlay style.
"""

import os
import io
import math
import base64
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Brand palette ──────────────────────────────────────────────────────────────
COLORS = {
    "dark":       "#0e1323",
    "coral":      "#ed7470",
    "coral_dim":  "#c0524e",
    "coral_glow": "#ff8a87",
    "black":      "#111111",
    "white":      "#ffffff",
    "light_pink": "#f7d1d0",
    "mid_grey":   "#707481",
}

BG_OPTIONS = {
    "dark":   (14, 19, 35),
    "coral":  (237, 116, 112),
    "black":  (17, 17, 17),
    "navy":   (10, 14, 40),
}

PHOTO_PATHS = [
    "/Users/campbell/Desktop/Cursor Work/Marketing/Profile Images/1.png",
    "/Users/campbell/Desktop/Cursor Work/Marketing/Profile Images/2.png",
    "/Users/campbell/Desktop/Cursor Work/Marketing/Profile Images/3.png",
    "/Users/campbell/Desktop/Cursor Work/Marketing/Profile Images/Cam.JPG",
    "/Users/campbell/Desktop/Cursor Work/Marketing/Profile Images/IMG_9833.jpg",
]

W, H = 1280, 720
CORAL_RGB  = (237, 116, 112)
CORAL_GLOW = (255, 138, 135)


# ── Font helpers ───────────────────────────────────────────────────────────────
def _get_font(size, bold=True):
    candidates = [
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFCompact.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


# ── Background ─────────────────────────────────────────────────────────────────
def _draw_background(img: Image.Image, bg: tuple, complexity: float):
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, H], fill=bg)

    if complexity < 0.15:
        return

    # Subtle vignette gradient effect
    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    for i in range(30):
        alpha = int(80 * (i / 30) * complexity)
        pad = i * 8
        vdraw.rectangle([pad, pad, W - pad, H - pad],
                        outline=(0, 0, 0, alpha), width=8)
    img.paste(Image.alpha_composite(img.convert("RGBA"), vignette).convert("RGB"))


# ── Remove background from photo ───────────────────────────────────────────────
def _cutout_photo(photo_path: str) -> Image.Image:
    from rembg import remove
    with open(photo_path, "rb") as f:
        data = f.read()
    result = remove(data)
    return Image.open(io.BytesIO(result)).convert("RGBA")


# ── Composite photo onto canvas ────────────────────────────────────────────────
def _place_photo(canvas: Image.Image, photo: Image.Image,
                 side: str, complexity: float):
    """Scale and position the photo cutout."""
    photo_h = int(H * 0.95)
    ratio = photo_h / photo.height
    photo_w = int(photo.width * ratio)
    photo = photo.resize((photo_w, photo_h), Image.LANCZOS)

    if side == "right":
        x = W - photo_w - 20
    else:
        x = 20
    y = H - photo_h

    # At high complexity, add a subtle coral glow behind the person
    if complexity > 0.5:
        glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        glow_alpha = int(60 * (complexity - 0.5) * 2)
        cx = x + photo_w // 2
        for r in range(300, 50, -30):
            a = max(0, glow_alpha - int(glow_alpha * (1 - r / 300)))
            gd.ellipse([cx - r, H // 2 - r, cx + r, H // 2 + r],
                       fill=(*CORAL_RGB, a))
        glow = glow.filter(ImageFilter.GaussianBlur(40))
        canvas.paste(glow, (0, 0), glow)

    canvas.paste(photo, (x, y), photo)


# ── Headline text ──────────────────────────────────────────────────────────────
def _draw_headline(canvas: Image.Image, line1: str, line2: str,
                   side: str, bg: tuple):
    """Draw two-part headline. line2 gets the coral highlight box."""
    draw = ImageDraw.Draw(canvas)
    is_dark_bg = (bg[0] + bg[1] + bg[2]) < 300
    text_color = (255, 255, 255) if is_dark_bg else (17, 17, 17)

    text_x = 60 if side == "right" else W // 2 + 40
    text_y = H // 3

    # Line 1 — smaller, no box
    font1 = _get_font(52, bold=False)
    draw.text((text_x, text_y), line1.upper(), font=font1, fill=text_color)

    # Measure line 1 height
    bb = font1.getbbox(line1.upper())
    line1_h = bb[3] - bb[1]

    # Line 2 — bold, coral highlight box
    font2 = _get_font(72, bold=True)
    bb2 = font2.getbbox(line2.upper())
    pad_x, pad_y = 18, 10
    box_w = bb2[2] - bb2[0] + pad_x * 2
    box_h = bb2[3] - bb2[1] + pad_y * 2
    box_y = text_y + line1_h + 14

    # Box
    draw.rectangle([text_x - pad_x, box_y, text_x - pad_x + box_w, box_y + box_h],
                   fill=CORAL_RGB)
    # Text on box
    draw.text((text_x, box_y + pad_y - bb2[1]), line2.upper(),
              font=font2, fill=(255, 255, 255))


# ── Elaborate graphic elements ─────────────────────────────────────────────────
def _draw_bar_chart(draw: ImageDraw.Draw, x: int, y: int,
                    complexity: float, glow: bool = True):
    """Draw a simple glowing bar chart."""
    bars = [0.4, 0.6, 0.5, 0.75, 0.65, 0.9]
    bar_w, gap, max_h = 28, 10, 160
    for i, h_frac in enumerate(bars):
        bh = int(max_h * h_frac)
        bx = x + i * (bar_w + gap)
        by = y + max_h - bh
        alpha = int(180 * complexity)
        draw.rectangle([bx, by, bx + bar_w, y + max_h],
                       fill=(*CORAL_RGB, alpha))
        if glow:
            draw.rectangle([bx, by, bx + bar_w, y + max_h],
                           outline=(*CORAL_GLOW, min(255, alpha + 40)), width=2)


def _draw_arrow(draw: ImageDraw.Draw, x: int, y: int,
                length: int, complexity: float):
    """Draw an upward arrow."""
    alpha = int(200 * complexity)
    draw.line([(x, y + length), (x, y)], fill=(*CORAL_RGB, alpha), width=4)
    draw.polygon([(x - 12, y + 20), (x + 12, y + 20), (x, y)],
                 fill=(*CORAL_RGB, alpha))


def _draw_network(draw: ImageDraw.Draw, cx: int, cy: int,
                  complexity: float):
    """Draw a simple network/node graph."""
    alpha = int(160 * complexity)
    nodes = [
        (cx, cy),
        (cx - 80, cy - 60), (cx + 80, cy - 60),
        (cx - 120, cy + 40), (cx + 120, cy + 40),
    ]
    edges = [(0, 1), (0, 2), (0, 3), (0, 4), (1, 2)]
    for a, b in edges:
        draw.line([nodes[a], nodes[b]], fill=(*CORAL_RGB, alpha // 2), width=2)
    for nx, ny in nodes:
        r = 12
        draw.ellipse([nx - r, ny - r, nx + r, ny + r],
                     outline=(*CORAL_RGB, alpha), width=3)


def _draw_growth_label(draw: ImageDraw.Draw, x: int, y: int, complexity: float):
    font = _get_font(48, bold=True)
    alpha = int(220 * complexity)
    # Shadow
    draw.text((x + 2, y + 2), "GROWTH", font=font,
              fill=(0, 0, 0, int(alpha * 0.5)))
    draw.text((x, y), "GROWTH", font=font, fill=(*CORAL_RGB, alpha))


def _draw_elaborate_elements(canvas: Image.Image, side: str, complexity: float):
    """Overlay graphic elements at varying intensities based on complexity."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if side == "right":
        # Elements on the left (text side)
        if complexity > 0.3:
            _draw_bar_chart(draw, 60, 80, complexity * 0.8)
        if complexity > 0.5:
            _draw_arrow(draw, 340, 60, 120, complexity * 0.9)
        if complexity > 0.65:
            _draw_growth_label(draw, 60, 55, (complexity - 0.65) / 0.35)
        if complexity > 0.7:
            _draw_network(draw, W - 180, 140, (complexity - 0.7) / 0.3)
    else:
        if complexity > 0.3:
            _draw_bar_chart(draw, W - 310, 80, complexity * 0.8)
        if complexity > 0.5:
            _draw_arrow(draw, W - 120, 60, 120, complexity * 0.9)
        if complexity > 0.65:
            _draw_growth_label(draw, W - 350, 55, (complexity - 0.65) / 0.35)
        if complexity > 0.7:
            _draw_network(draw, 200, 140, (complexity - 0.7) / 0.3)

    # Blur overlay slightly for the neon glow look
    if complexity > 0.5:
        overlay = overlay.filter(ImageFilter.GaussianBlur(1.5))

    canvas.paste(overlay, (0, 0), overlay)


# ── Main entry point ───────────────────────────────────────────────────────────
def generate_thumbnail(
    line1: str,
    line2: str,
    photo_index: int = 0,
    complexity: float = 0.7,     # 0.0 = clean, 1.0 = elaborate
    bg_name: str = "dark",
    photo_side: str = "right",
) -> str:
    """Generate a thumbnail and return as base64 PNG string."""
    complexity = max(0.0, min(1.0, complexity))
    bg = BG_OPTIONS.get(bg_name, BG_OPTIONS["dark"])
    photo_path = PHOTO_PATHS[photo_index % len(PHOTO_PATHS)]

    canvas = Image.new("RGB", (W, H), bg)
    _draw_background(canvas, bg, complexity)

    # Cutout and place photo
    photo = _cutout_photo(photo_path)
    _place_photo(canvas, photo, photo_side, complexity)

    # Elaborate elements behind text
    if complexity > 0.2:
        _draw_elaborate_elements(canvas, photo_side, complexity)

    # Headline always on top
    _draw_headline(canvas, line1, line2, photo_side, bg)

    # Encode as base64
    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def split_headline(full_headline: str) -> tuple:
    """Split a headline into two lines: context + punchy key phrase."""
    words = full_headline.strip().split()
    mid = max(1, len(words) // 2)
    return " ".join(words[:mid]), " ".join(words[mid:])


if __name__ == "__main__":
    # Quick test
    b64 = generate_thumbnail(
        "THE COST OF", "PODCAST ADS",
        photo_index=0, complexity=0.7, bg_name="dark", photo_side="right"
    )
    with open("/tmp/test_thumbnail.png", "wb") as f:
        f.write(base64.b64decode(b64))
    print("Saved to /tmp/test_thumbnail.png")
