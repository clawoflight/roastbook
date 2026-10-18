"""Verify the actual exported campaign, including a full decode of every video."""
import json
from pathlib import Path
import subprocess

import imageio_ffmpeg
from PIL import Image

from render import ASSETS, ROOT, digest

output = ROOT / 'exports'
campaign = json.loads((output / 'campaign.json').read_text())
assert len(campaign['posts']) == 5, 'Expected all five concepts'
assert json.loads((ASSETS / 'captures/diagnostics.json').read_text()) == [], 'Capture requests failed'
for post in campaign['posts']:
    assert post['status'] == 'draft' and post['approved'] is False
    assert len(post['carousel']) == 3
    assert 'www.roastbook.coffee' in post['caption']
    assert len(post['caption']) <= 2200, 'Instagram caption limit exceeded'
    for media in post['carousel']:
        path = output / media['path']
        assert path.is_file() and digest(path) == media['sha256']
        with Image.open(path) as image:
            assert image.size == (1080, 1350) and image.mode == 'RGB'
        assert media['alt']
    for name, capture in post['captures'].items():
        assert digest(ASSETS / 'captures' / f'{name}.png') == capture['sha256']
    video = output / post['reel']['path']
    assert digest(video) == post['reel']['sha256']
    frames = imageio_ffmpeg.read_frames(str(video))
    info = next(frames)
    frames.close()
    assert info['size'] == (1080, 1920), info
    assert abs(info['duration'] - 14) < 0.1, info
    assert info['codec'] == 'h264', info
    assert info['fps'] == 30, info
    held_frames = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(video),
        '-vf', 'select=eq(n\\,30)+eq(n\\,90),scale=108:192',
        '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
    ], check=True, capture_output=True).stdout
    frame_bytes = 108 * 192 * 3
    assert len(held_frames) == frame_bytes * 2
    difference = sum(abs(a - b) for a, b in zip(held_frames[:frame_bytes], held_frames[frame_bytes:])) / frame_bytes
    assert difference < 0.2, f'Camera moved during the reading hold: {difference}'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-xerror', '-i', str(video),
                    '-f', 'null', '-'], check=True)
    print(f"Verified {post['id']}: 3 images and 14-second H.264 Reel")
assert 'Review extracted info' in campaign['posts'][4]['captures']['scan-result']['text']
assert 'Moonrise Lot 17' in campaign['posts'][4]['captures']['scan-result']['text']
print('All five draft packages verified; nothing published.')
