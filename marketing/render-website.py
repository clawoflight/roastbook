"""Build the shared homepage/README photograph from campaign source assets."""
from PIL import Image, ImageOps
from render import ASSETS, ROOT, device

image = ImageOps.fit(Image.open(ASSETS / 'scenes/01-perfect-espresso.webp'), (1600, 1200)).convert('RGBA')
device(image, ASSETS / 'captures/brew.png', 580, (850, 100), -5)
output = ROOT.parent / 'public/media/roastbook-coffee-journal.webp'
output.parent.mkdir(parents=True, exist_ok=True)
image.convert('RGB').save(output, quality=85, method=6)
print(output)
