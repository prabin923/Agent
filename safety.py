"""Safety checks and append-only action logging."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from config import LOG_DIR


DESTRUCTIVE_SHELL_PATTERNS = [
    r"\brm\s+(-[^\s]*[rf][^\s]*\s+)?",
    r"\bsudo\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bmkfs\b",
    r"\bdd\s+",
    r">\s*/dev/",
    r"\bchmod\s+-R\b",
    r"\bchown\s+-R\b",
    r"\bgit\s+reset\s+--hard\b",
    r"\bgit\s+clean\b",
]


def is_destructive_shell(command: str) -> bool:
    return any(re.search(pattern, command) for pattern in DESTRUCTIVE_SHELL_PATTERNS)


def require_confirmation(action: str, detail: str) -> bool:
    print(f"\nSafety confirmation required for {action}:")
    print(detail)
    response = input("Proceed? Type 'y' to continue: ").strip().lower()
    return response == "y"


class ActionLogger:
    def __init__(self, log_dir: Path = LOG_DIR) -> None:
        self.log_dir = log_dir
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            # In sandboxed or restricted environments, home may be unwritable.
            # Fall back to a project-local log directory so the agent can still run.
            self.log_dir = Path.cwd() / "aria_logs"
            self.log_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.path = self.log_dir / f"aria_{stamp}.jsonl"

    def log(self, event: str, payload: dict[str, Any]) -> None:
        record = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "event": event,
            **payload,
        }
        line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
        try:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line)
        except PermissionError:
            # Home log dir may exist but be unwritable (e.g. sandbox); mirror __init__ fallback.
            self.log_dir = Path.cwd() / "aria_logs"
            self.log_dir.mkdir(parents=True, exist_ok=True)
            self.path = self.log_dir / self.path.name
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line)
