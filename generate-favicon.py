#!/usr/bin/env python3
"""Generate favicon.ico from an outline toad design using Pillow."""

import math
from PIL import Image, ImageDraw


def draw_toad(size: int) -> Image.Image:
    """Draw outline toad icon at `size`x`size` using 4x supersampling."""
    scale = 4
    actual = size * scale

    img = Image.new("RGBA", (actual, actual), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def p(v: float) -> float:
        return v * actual / 100

    def box(x1, y1, x2, y2):
        return [p(x1), p(y1), p(x2), p(y2)]

    stroke = (0, 120, 212, 255)   # #0078d4
    white  = (255, 255, 255, 255)
    solid  = stroke                # pupils / nostrils
    sw_main   = max(1, round(4.5 * actual / 100))
    sw_detail = max(1, round(3.5 * actual / 100))
    sw_small  = max(1, round(3.0 * actual / 100))

    def rot_ellipse_pts(cx, cy, rx, ry, angle_deg, n=48):
        a = math.radians(angle_deg)
        pts = []
        for i in range(n):
            t = 2 * math.pi * i / n
            lx = rx * math.cos(t)
            ly = ry * math.sin(t)
            pts.append((p(cx + lx * math.cos(a) - ly * math.sin(a)),
                        p(cy + lx * math.sin(a) + ly * math.cos(a))))
        return pts

    def outlined_ellipse(x1, y1, x2, y2, sw):
        draw.ellipse(box(x1, y1, x2, y2), fill=white, outline=stroke, width=sw)

    def outlined_poly(pts, sw):
        draw.polygon(pts, fill=white, outline=stroke)
        # Pillow polygon outline is 1px; overdraw with line segments for thickness
        for i in range(len(pts)):
            draw.line([pts[i], pts[(i + 1) % len(pts)]], fill=stroke, width=sw)

    # Hind legs
    outlined_poly(rot_ellipse_pts(17, 84, 16, 9, -18), sw_main)
    outlined_poly(rot_ellipse_pts(83, 84, 16, 9,  18), sw_main)

    # Main body
    outlined_ellipse(13, 52, 87, 94, sw_main)

    # Head
    outlined_ellipse(17, 22, 83, 76, sw_main)

    # Eye protrusion bumps
    outlined_ellipse( 7, 23, 41, 51, sw_main)
    outlined_ellipse(59, 23, 93, 51, sw_main)

    # Iris rings
    outlined_ellipse(14, 27, 34, 47, sw_small)
    outlined_ellipse(66, 27, 86, 47, sw_small)

    # Pupils — horizontal oval
    draw.ellipse(box(17.5, 31, 30.5, 43), fill=solid)
    draw.ellipse(box(69.5, 31, 82.5, 43), fill=solid)

    # Eye shines
    draw.ellipse(box(14, 27, 20, 33), fill=white)
    draw.ellipse(box(66, 27, 72, 33), fill=white)

    # Nostrils
    draw.ellipse(box(42, 52, 46, 56), fill=solid)
    draw.ellipse(box(54, 52, 58, 56), fill=solid)

    # Mouth
    if size >= 20:
        for i in range(22):
            t = i / 21
            mx = 35 + t * 30
            my = 62 + 8 * math.sin(math.pi * t)
            r = 1.8
            draw.ellipse(box(mx - r, my - r, mx + r, my + r), fill=stroke)

    # Front arm stubs
    outlined_poly(rot_ellipse_pts(16, 79, 9, 5, -25), sw_main)
    outlined_poly(rot_ellipse_pts(84, 79, 9, 5,  25), sw_main)

    # Front toes
    for cx, cy, r in [(4, 83, 3.5), (8, 87, 3.5), (13, 90, 3.5), (19, 90, 3)]:
        draw.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=white, outline=stroke, width=sw_detail)
    for cx, cy, r in [(96, 83, 3.5), (92, 87, 3.5), (87, 90, 3.5), (81, 90, 3)]:
        draw.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=white, outline=stroke, width=sw_detail)

    return img.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    img48 = draw_toad(48)
    img32 = draw_toad(32)
    img16 = draw_toad(16)

    img48.save(
        "favicon.ico",
        format="ICO",
        sizes=[(48, 48), (32, 32), (16, 16)],
        append_images=[img32, img16],
    )
    print("favicon.ico generated (48×48, 32×32, 16×16)")
