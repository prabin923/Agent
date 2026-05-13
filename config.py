"""Configuration for ARIA."""

from __future__ import annotations

from pathlib import Path
import os


OLLAMA_BASE_URL = "http://localhost:11434"
PLANNER_MODEL = "llama3"
VISION_MODEL = "llava"

MAX_TOOL_CALLS = 15
MAX_VERIFY_RETRIES = 5
SCREENSHOT_WIDTH = 1024

LOG_DIR = Path.home() / "aria_logs"

# Keep shell execution bounded so a stuck command cannot freeze the agent loop.
SHELL_TIMEOUT_SECONDS = 120

# Optional spoken summaries/status. Enable with ARIA_TTS=1.
ENABLE_TTS = os.environ.get("ARIA_TTS", "").lower() in {"1", "true", "yes"}
