"""Generate missing campaign backgrounds with the imagegen skill CLI."""

import json
import os
from pathlib import Path
import subprocess
import sys

from PIL import Image

from provider import provider_environment

ROOT = Path(__file__).resolve().parent
cli = Path(os.environ.get("IMAGE_GEN_CLI", str(Path.home() / ".codex/skills/.system/imagegen/scripts/image_gen.py")))
if not cli.is_file():
    raise SystemExit("Set IMAGE_GEN_CLI to the imagegen skill's scripts/image_gen.py")
output = ROOT.parent / "output/imagegen/roastbook"
output.mkdir(parents=True, exist_ok=True)
scenes = ROOT / "assets/scenes"
scenes.mkdir(parents=True, exist_ok=True)
jobs = []
posts = json.loads((ROOT / "campaign.json").read_text())["posts"]
for post in posts:
    if not (output / f"{post['id']}.png").exists() and not (scenes / f"{post['id']}.webp").exists():
        jobs.append({"prompt": post["scene_prompt"], "out": f"{post['id']}.png",
                     "size": "1024x1536", "quality": "high"})
if jobs:
    batch = output / "prompts.jsonl"
    batch.write_text("".join(json.dumps(job) + "\n" for job in jobs))
    subprocess.run([sys.executable, str(cli), "generate-batch", "--input", str(batch),
                    "--out-dir", str(output), "--concurrency", "2", "--no-augment"],
                   env=provider_environment(), check=True)
for post in posts:
    target = scenes / f"{post['id']}.webp"
    if not target.exists():
        Image.open(output / f"{post['id']}.png").save(target, quality=95)
