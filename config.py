"""Configuration for ARIA."""

from __future__ import annotations

from pathlib import Path
import os


OLLAMA_BASE_URL = "http://localhost:11434"
PLANNER_MODEL = "llama3"
VISION_MODEL = "llava"

# Base URL for the ARIA Adobe Bridge HTTP API (no trailing /command). Override with ARIA_ADOBE_BRIDGE_URL.
ADOBE_BRIDGE_BASE_URL = os.environ.get("ARIA_ADOBE_BRIDGE_URL", "http://127.0.0.1:7777").rstrip("/")

MAX_TOOL_CALLS = 15
MAX_VERIFY_RETRIES = 5
SCREENSHOT_WIDTH = 1024

LOG_DIR = Path.home() / "aria_logs"

# Keep shell execution bounded so a stuck command cannot freeze the agent loop.
SHELL_TIMEOUT_SECONDS = 120

# Optional spoken summaries/status. Enable with ARIA_TTS=1.
ENABLE_TTS = os.environ.get("ARIA_TTS", "").lower() in {"1", "true", "yes"}
