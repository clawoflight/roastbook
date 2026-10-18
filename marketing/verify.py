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
audio_hashes = set()
audio_starts = [post['reel']['audio']['start_seconds'] for post in campaign['posts']]
assert len(set(audio_starts)) == 5, 'Each Reel needs a distinct music excerpt'
assert all(right - left >= 14 for left, right in zip(sorted(audio_starts), sorted(audio_starts)[1:])), 'Music excerpts overlap'
for post in campaign['posts']:
    assert post['status'] == 'draft' and post['approved'] is False
    assert len(post['carousel']) == 3
    assert 'www.roastbook.coffee' in post['caption']
    assert 'GitHub' in post['caption'] and 'Both links are in our profile.' in post['caption']
    assert len(post['caption']) <= 2200, 'Instagram caption limit exceeded'
    for media in post['carousel']:
        path = output / media['path']
        assert path.is_file() and digest(path) == media['sha256']
        with Image.open(path) as image:
            assert image.size == (1080, 1350) and image.mode == 'RGB'
        assert media['alt']
    for name, capture in post['captures'].items():
        assert digest(ASSETS / 'captures' / f'{name}.png') == capture['sha256']
    if post['id'] == '04-cafe-journal':
        for name in ['places-overview', 'places']:
            assert len(post['captures'][name]['visibleCafes']) >= 3
        assert post['captures']['places']['selectedCafe'].startswith('Saved café: Lantern Room,')
        assert 'Lantern Room' in post['captures']['places']['text']
    video = output / post['reel']['path']
    assert digest(video) == post['reel']['sha256']
    frames = imageio_ffmpeg.read_frames(str(video))
    info = next(frames)
    frames.close()
    assert info['size'] == (1080, 1920), info
    assert abs(info['duration'] - 14) < 0.1, info
    assert info['codec'] == 'h264', info
    assert info['fps'] == 60, info
    assert info.get('audio_codec') == 'aac', info
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-xerror', '-i', str(video),
                    '-f', 'null', '-'], check=True)
    audio_hash = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(video),
                                 '-map', '0:a:0', '-f', 'hash', '-hash', 'sha256', '-'],
                                check=True, capture_output=True, text=True).stdout.strip()
    assert audio_hash not in audio_hashes, 'Reels contain identical audio'
    audio_hashes.add(audio_hash)
    print(f"Verified {post['id']}: 3 images and 14-second H.264 Reel with unique audio")
assert 'Review extracted info' in campaign['posts'][4]['captures']['scan-result']['text']
assert 'Moonrise Lot 17' in campaign['posts'][4]['captures']['scan-result']['text']
print('All five draft packages verified; nothing published.')
