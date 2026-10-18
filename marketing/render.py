"""Compose real screenshots with generated scenes; export carousel and Reel drafts."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
CREAM = '#f6efe3'
INK = '#38291f'
ACCENT = '#a75c2e'


def font(size, display=False, weight=500):
    name = 'bricolage-grotesque.ttf' if display else 'hanken-grotesk.ttf'
    result = ImageFont.truetype(str(ASSETS / 'fonts' / name), size)
    result.set_variation_by_axes([
        weight if axis['name'] == b'Weight' else axis['default']
        for axis in result.get_variation_axes()
    ])
    return result


def text(image, value, x, y, size, display=False, color=INK, weight=500):
    draw = ImageDraw.Draw(image)
    face = font(size, display, weight)
    for line in value.split('\n'):
        if draw.textlength(line, font=face) > image.width - x - 65:
            raise ValueError(f'Copy exceeds the safe area: {line}')
        draw.text((x, y), line, font=face, fill=color, anchor='lt')
        y += round(size * 1.12)
    return y


def brand(image, y=54):
    logo = Image.open(ROOT.parent / 'public/navbar-logo.png').convert('RGBA')
    logo.thumbnail((34, 34), Image.Resampling.LANCZOS)
    image.paste(logo, (64, y), logo)
    text(image, 'roastbook', 110, y, 29, True, weight=650)


def device(image, screenshot, width, xy, angle=0):
    shot = Image.open(screenshot).convert('RGB')
    height = round(shot.height * width / shot.width)
    shot = shot.resize((width, height), Image.Resampling.LANCZOS)
    bezel = 16
    frame = Image.new('RGBA', (width + bezel * 2, height + bezel * 2))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), 32,
                           fill='#252321', outline='#aaa59c', width=3)
    mask = Image.new('L', shot.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), 18, fill=255)
    frame.paste(shot, (bezel, bezel), mask)
    frame = frame.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    layer = Image.new('RGBA', image.size)
    shadow = Image.new('RGBA', frame.size, (24, 16, 10, 0))
    shadow.putalpha(frame.getchannel('A').point(lambda a: round(a * 0.36)))
    layer.alpha_composite(shadow, (xy[0] + 14, xy[1] + 25))
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(20)))
    image.alpha_composite(frame, xy)


def scene(post, size, reel, index=0):
    source = ASSETS / 'scenes' / f"{post['id']}.webp"
    if index == 2 and post['id'].startswith('05'):
        source = ASSETS / 'coffee-bag.webp'
    photo = Image.open(source)
    image = ImageOps.fit(photo, size, centering=(0.5 if index == 0 else 0.3, 0.5)).convert('RGBA')
    # Keep the photograph visible; only soften the areas carrying copy.
    veil = Image.new('RGBA', size)
    draw = ImageDraw.Draw(veil)
    for y in range(size[1]):
        top = max(0, 1 - y / (560 if reel else 430))
        bottom = max(0, min(1, (y - size[1] + (650 if reel else 480)) / (300 if reel else 250)))
        draw.line((0, y, size[0], y), fill=(246, 239, 227, round(235 * max(top, bottom))))
    image.alpha_composite(veil)
    return image


def render_slide(post, index, reel=False, capture_name=None):
    size = (1080, 1920 if reel else 1350)
    image = scene(post, size, reel, index)
    brand(image, 150 if reel else 62)
    titles = [post['title'], post['detail_title'], post['end_title']]
    text(image, titles[index], 64, 235 if reel else 140, 84, True, weight=700)
    capture = ASSETS / 'captures' / f"{capture_name or post['captures'][0 if index == 0 else 1]}.png"
    if index == 0:
        if post['device'] == 'phone':
            device(image, capture, 480 if reel else 390,
                   (410 if reel else 470, 480 if reel else 390), -6)
        else:
            device(image, capture, 920, (48, 620 if reel else 450), -3)
        text(image, 'Your coffee, remembered.', 64, 1575 if reel else 1240, 30, weight=600)
    elif index == 1:
        shot = Image.open(capture)
        available = (936, 1040 if reel else 790)
        ratio = min(available[0] / shot.width, available[1] / shot.height)
        width = round(shot.width * ratio) - 32
        height = round(shot.height * width / shot.width) + 32
        y = (540 if reel else 390) + (available[1] - height) // 2
        device(image, capture, width, ((1080 - width - 32) // 2, y))
        text(image, 'Real screens. Demo coffee.', 64, 1630 if reel else 1240, 26, weight=600)
    else:
        if not post['id'].startswith('05'):
            primary = ASSETS / 'captures' / f"{post['captures'][0]}.png"
            if post['device'] == 'phone':
                device(image, primary, 400 if reel else 300,
                       (470 if reel else 550, 510 if reel else 385), 5)
            else:
                device(image, primary, 890, (64, 600 if reel else 420), 3)
        text(image, 'Try the demo. Make it yours.', 64, 1470 if reel else 1120, 38, True, weight=650)
        text(image, 'Website + GitHub in our profile', 64, 1530 if reel else 1180, 29, weight=600)
        text(image, 'www.roastbook.coffee', 64, 1580 if reel else 1230, 28)
    return image.convert('RGB')


def make_video(folder, overview=False, audio_start=8):
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1']
    names = ['reel-01.png', 'reel-02.png', 'reel-03.png']
    durations = [5, 5, 5]
    if overview:
        names.insert(1, 'reel-overview.png')
        durations = [5, 2.75, 2.75, 5]
    for name in names:
        command += ['-i', str(folder / name)]
    command += ['-i', str(ASSETS / 'music/jazz-slower.mp3')]
    filters = [
        f"[{i}:v]scale=4320:7680,zoompan=z='1+0.03*on/{round(duration * 60) - 1}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={round(duration * 60)}:s=1080x1920:fps=60,trim=duration={duration},setpts=PTS-STARTPTS,fps=60,settb=1/60,format=yuv420p[v{i}]"
        for i, duration in enumerate(durations)
    ]
    previous = 'v0'
    elapsed = durations[0]
    for i in range(1, len(durations)):
        result = 'out' if i == len(durations) - 1 else f'fade{i}'
        offset = elapsed - 0.5
        filters.append(f'[{previous}][v{i}]xfade=transition=fade:duration=0.5:offset={offset},fps=60[{result}]')
        elapsed += durations[i] - 0.5
        previous = result
    assert elapsed == 14, 'Reel timeline must remain 14 seconds'
    filters += [f'[{len(names)}:a]atrim=start={audio_start}:duration=14,asetpts=PTS-STARTPTS,loudnorm=I=-22:TP=-2:LRA=7,afade=t=in:d=0.7,afade=t=out:st=12.5:d=1.5[audio]']
    command += ['-filter_complex', ';'.join(filters), '-map', '[out]', '-map', '[audio]', '-t', '14',
                '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '20',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', str(folder / 'reel.mp4')]
    subprocess.run(command, check=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bundle(output, posts):
    with ZipFile(output / 'roastbook-campaign.zip', 'w', ZIP_DEFLATED) as archive:
        for name in ['index.html', 'campaign.json']:
            archive.write(output / name, name)
        for post in posts:
            folder = output / post['id']
            names = ['caption.txt', 'post.json']
            names += [f'carousel-{i:02}.png' for i in range(1, 4)]
            if 'reel' in post:
                names += ['reel.mp4', 'reel-01.png']
            for name in names:
                archive.write(folder / name, f"{post['id']}/{name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', action='store_true', help='Also encode the five Reels with CC0 music')
    parser.add_argument('--only', help='Rebuild one concept, retaining the other verified packages')
    args = parser.parse_args()
    campaign = json.loads((ROOT / 'campaign.json').read_text())
    if args.only and args.only not in [post['id'] for post in campaign['posts']]:
        parser.error('Unknown concept')
    provenance = json.loads((ASSETS / 'captures/provenance.json').read_text())
    output = ROOT / 'exports'
    cards = []
    packages = []
    for post in campaign['posts']:
        folder = output / post['id']
        folder.mkdir(parents=True, exist_ok=True)
        for name in post['captures']:
            capture = ASSETS / 'captures' / f'{name}.png'
            if digest(capture) != provenance[name]['sha256']:
                raise ValueError(f'Capture provenance does not match {name}')
        rebuild = not args.only or post['id'] == args.only
        if rebuild:
            for i in range(3):
                render_slide(post, i).save(folder / f'carousel-{i+1:02}.png')
                render_slide(post, i, True).save(folder / f'reel-{i+1:02}.png')
            if post.get('detail_overview'):
                render_slide(post, 1, True, post['detail_overview']).save(folder / 'reel-overview.png')
            if args.video:
                make_video(folder, bool(post.get('detail_overview')), post['audio_start_seconds'])
        (folder / 'caption.txt').write_text(post['caption'] + '\n')
        media = []
        for i, alt in enumerate([post['alt'], f"Actual Roastbook screen: {post['detail_title'].replace(chr(10), ' ')} Fictional sample data.", f"{post['end_title'].replace(chr(10), ' ')} Explore the Roastbook demo at www.roastbook.coffee."], 1):
            path = folder / f'carousel-{i:02}.png'
            media.append({'path': path.relative_to(output).as_posix(), 'alt': alt, 'sha256': digest(path), 'width': 1080, 'height': 1350})
        package = {'id': post['id'], 'status': 'draft', 'approved': False, 'caption': post['caption'],
                   'carousel': media, 'captures': {name: provenance[name] for name in post['captures']},
                   'ai_generated_scene': True, 'scene_prompt': post['scene_prompt']}
        if args.video:
            package['reel'] = {'path': f"{post['id']}/reel.mp4", 'sha256': digest(folder / 'reel.mp4'),
                               'width': 1080, 'height': 1920, 'duration_seconds': 14, 'audio': {'title': 'Jazz Slower', 'creator': 'Alex McCulloch', 'license': 'CC0-1.0', 'source': 'https://opengameart.org/content/jazz-slower', 'start_seconds': post['audio_start_seconds'], 'duration_seconds': 14},
                               'description': 'Animated stills with 60 fps supersampled slow zooms and crossfades; not generated live-action footage.'}
        (folder / 'post.json').write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')
        packages.append(package)
        media_html = ''.join(f'<a href="{post["id"]}/carousel-{i:02}.png" download><img src="{post["id"]}/carousel-{i:02}.png" alt="{html.escape(media[i-1]["alt"])}" loading="lazy"></a>' for i in range(1, 4))
        video = f'<video controls preload="none" poster="{post["id"]}/reel-01.png" src="{post["id"]}/reel.mp4"></video>' if args.video else ''
        status = 'DRAFT · Carousel + 14-second Reel with CC0 music' if args.video else 'DRAFT · Carousel preview'
        cards.append(f'<section><h2>{html.escape(post["title"].replace(chr(10), " "))}</h2><p class="tag">{status}</p><div class="slides">{media_html}</div><details><summary>Video, caption and publishing package</summary><div class="details">{video}<div><pre>{html.escape(post["caption"])}</pre><p><a href="{post["id"]}/reel.mp4" download>Download Reel</a> · <a href="{post["id"]}/caption.txt" download>Caption</a> · <a href="{post["id"]}/post.json" download>Post metadata</a></p></div></div></details></section>')
        print(f"Rendered {post['id']}", flush=True)
    (output / 'campaign.json').write_text(json.dumps({'name': campaign['name'], 'posts': packages}, indent=2, ensure_ascii=False) + '\n')
    page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Roastbook campaign review</title><style>body{margin:0;background:#f6efe3;color:#38291f;font:17px system-ui;line-height:1.5}main{max-width:1240px;margin:auto;padding:40px 24px}h1{font-size:clamp(32px,5vw,64px);line-height:1.05;max-width:850px}h2{font-size:28px}.tag{font-size:12px;letter-spacing:.1em;color:#854623}section{padding:28px 0 40px;border-top:1px solid #d5c6b4}.slides{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}img{display:block;width:100%;border-radius:12px}a{color:inherit}details{margin-top:24px}summary{cursor:pointer;padding:12px 0;min-height:24px}.details{display:flex;gap:28px;padding-top:20px}video{width:260px;max-width:100%;border-radius:12px}pre{white-space:pre-wrap;font:inherit}a:focus-visible,summary:focus-visible{outline:3px solid #a75c2e;outline-offset:5px}@media(max-width:600px){main{padding:24px 16px}.slides{grid-template-columns:1fr}.details{display:block}video{width:100%}}</style><main><p>ROASTBOOK / CAMPAIGN 01</p><p><a href="roastbook-campaign.zip" download>Download the complete campaign</a></p><h1>Coffee worth remembering.</h1><p>Five concepts. Real app captures. AI-generated surroundings. All posts are drafts for review; nothing has been published.</p><p>Carousels: 1080 × 1350. Reels: 1080 × 1920, CC0 jazz soundtrack, 14 seconds. Click a slide to download it.</p>' + ''.join(cards) + '</main></html>'
    (output / 'index.html').write_text(page)
    bundle(output, packages)


if __name__ == '__main__':
    main()
