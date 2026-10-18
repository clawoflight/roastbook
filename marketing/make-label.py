"""Prepare an explicitly fictional, legible label for the real extraction demo."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
image = Image.open(ROOT.parent / 'scripts/seed-assets/bean-packaging/kraft-orange.webp').convert('RGB')
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((390, 390, 825, 850), radius=6, fill='#faf3e6')
font_path = ROOT / 'assets/fonts/hanken-grotesk.ttf'
for text, y, size in [
    ('EMBER ATLAS', 420, 25), ('Moonrise Lot 17', 470, 37),
    ('Origin: Luma Highlands', 535, 25), ('Region: Moonrise Valley', 578, 25),
    ('Process: Washed', 621, 25), ('Roast: Light', 664, 25),
    ('Net weight: 250 g', 707, 25), ('SAMPLE / FICTIONAL COFFEE', 792, 19),
]:
    draw.text((415, y), text, font=ImageFont.truetype(str(font_path), size), fill='#38281e')
image.save(ROOT / 'assets/sample-label.jpg', quality=95)
