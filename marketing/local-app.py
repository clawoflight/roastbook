"""Run a command against only the isolated campaign database and media directory."""

import os
from pathlib import Path
import sys

from provider import provider_environment

ROOT = Path(__file__).resolve().parent.parent
environment = provider_environment()
environment.update({
    "DATABASE_URL": "postgresql://campaign:campaign-local-only@127.0.0.1:55439/roastbook_campaign",
    "STORAGE_PROVIDER": "local",
    "STORAGE_PATH": str(ROOT / ".artifacts/campaign-uploads"),
    "STORAGE_URL": "/media",
    "AI_TELEMETRY_STORE_PAYLOADS": "false",
    "OPENAI_VISION_MODEL": os.environ.get("CAMPAIGN_VISION_MODEL", "gpt-6-luna"),
})
if len(sys.argv) < 2:
    raise SystemExit("Usage: python marketing/local-app.py <command> [arguments...]")
os.chdir(ROOT)
os.execvpe(sys.argv[1], sys.argv[1:], environment)
