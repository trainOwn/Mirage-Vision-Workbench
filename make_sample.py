"""Generates sample.png, a tiny synthetic image used as the benchmark default."""

from PIL import Image, ImageDraw

img = Image.new("RGB", (640, 480), color=(240, 240, 240))
d = ImageDraw.Draw(img)
d.rectangle([100, 100, 300, 300], fill=(200, 30, 30))
d.ellipse([350, 150, 550, 350], fill=(30, 120, 200))
d.text((50, 20), "HELLO WORLD", fill=(0, 0, 0))
img.save("sample.png")
