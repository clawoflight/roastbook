"""Install the demo's fictional marks into isolated campaign storage."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
names = ['terracotta-wave', 'cobalt-arches', 'forest-diamond', 'plum-crescent', 'coral-pinwheel']
for entity in ('coffee-shops', 'roasters'):
    target = root / '.artifacts/campaign-uploads/favicons' / entity
    target.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names, 1):
        Image.open(root / f'scripts/seed-assets/demo-favicons/{name}.webp').save(target / f'{i}.png')
