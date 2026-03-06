#!/usr/bin/env python3
"""Generate assets/favicon.ico from assets/toad.svg using cairosvg + Pillow."""

import io
import cairosvg
from PIL import Image

SVG_PATH = "assets/toad.svg"
ICO_PATH = "assets/favicon.ico"
SIZES = [48, 32, 16]


def svg_to_image(svg_path: str, size: int) -> Image.Image:
    png_data = cairosvg.svg2png(url=svg_path, output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_data)).convert("RGBA")


if __name__ == "__main__":
    images = [svg_to_image(SVG_PATH, s) for s in SIZES]
    images[0].save(
        ICO_PATH,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:],
    )
    print(f"{ICO_PATH} generated ({', '.join(f'{s}×{s}' for s in SIZES)})")
