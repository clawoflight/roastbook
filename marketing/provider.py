"""Resolve the authorized Codex provider without writing or printing credentials."""

import json
import os
from pathlib import Path
import tomllib


def provider_environment():
    environment = os.environ.copy()
    codex = Path.home() / ".codex"
    auth_path = codex / "auth.json"
    auth = json.loads(auth_path.read_text()) if auth_path.exists() else {}
    if auth.get("OPENAI_API_KEY"):
        environment["OPENAI_API_KEY"] = auth["OPENAI_API_KEY"]
        environment["OPENAI_BASE_URL"] = "https://api.openai.com/v1"
    else:
        config = tomllib.loads((codex / "config.toml").read_text())
        provider = config["model_providers"][config["model_provider"]]
        key = environment.get(provider["env_key"])
        if not key:
            raise RuntimeError("The configured provider credential is unavailable")
        environment["OPENAI_API_KEY"] = key
        environment["OPENAI_BASE_URL"] = provider["base_url"]
    return environment
