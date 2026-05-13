"""System tools callable by ARIA's planner."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

import pyautogui
import pyperclip
try:
    from ApplicationServices import AXIsProcessTrusted
except Exception:  # pyobjc is only available after requirements are installed on macOS.
    AXIsProcessTrusted = None

from config import SHELL_TIMEOUT_SECONDS
from ollama_client import OllamaClient
from safety import is_destructive_shell, require_confirmation
from vision import describe_screen, take_screenshot_base64


ToolResult = dict[str, Any]

KEY_ALIASES = {
    "cmd": "command",
    "control": "ctrl",
    "esc": "escape",
    "return": "enter",
    "option": "alt",
}


def _ok(**payload: Any) -> ToolResult:
    return {"ok": True, **payload}


def _error(message: str, **payload: Any) -> ToolResult:
    return {"ok": False, "error": message, **payload}


def _accessibility_ready() -> bool:
    """Check macOS Accessibility trust before sending mouse or keyboard input."""

    if AXIsProcessTrusted is None:
        return True
    return bool(AXIsProcessTrusted())


def _require_accessibility() -> ToolResult | None:
    if _accessibility_ready():
        return None
    return _error(
        "macOS Accessibility permission is not enabled for this terminal app. "
        "Enable it in System Settings > Privacy & Security > Accessibility."
    )


def run_shell(command: str) -> ToolResult:
    if is_destructive_shell(command) and not require_confirmation("run_shell", command):
        return _error("User declined destructive shell command")
    try:
        completed = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=SHELL_TIMEOUT_SECONDS,
        )
        return _ok(
            returncode=completed.returncode,
            stdout=completed.stdout[-8000:],
            stderr=completed.stderr[-8000:],
        )
    except subprocess.TimeoutExpired:
        return _error(f"Command timed out after {SHELL_TIMEOUT_SECONDS} seconds")


def open_app(app_name: str) -> ToolResult:
    completed = subprocess.run(["open", "-a", app_name], capture_output=True, text=True)
    return _ok(returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)


def close_app(app_name: str) -> ToolResult:
    script = f'tell application "{app_name}" to quit'
    completed = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return _ok(returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)


def click_at(x: int, y: int) -> ToolResult:
    denied = _require_accessibility()
    if denied:
        return denied
    pyautogui.click(x=int(x), y=int(y))
    return _ok(message=f"Clicked at ({x}, {y})")


def type_text(text: str) -> ToolResult:
    denied = _require_accessibility()
    if denied:
        return denied
    pyautogui.write(text, interval=0.01)
    return _ok(chars=len(text))


def press_key(key: str) -> ToolResult:
    denied = _require_accessibility()
    if denied:
        return denied
    parts = [KEY_ALIASES.get(part.strip().lower(), part.strip().lower()) for part in key.split("+") if part.strip()]
    if len(parts) > 1:
        pyautogui.hotkey(*parts)
    elif parts:
        pyautogui.press(parts[0])
    else:
        return _error("No key provided")
    return _ok(message=f"Pressed {key}")


def take_screenshot() -> ToolResult:
    return _ok(image_base64=take_screenshot_base64())


def read_screen() -> ToolResult:
    return _ok(description=describe_screen(OllamaClient()))


def open_file(path: str) -> ToolResult:
    completed = subprocess.run(["open", path], capture_output=True, text=True)
    return _ok(returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)


def move_file(src: str, dst: str) -> ToolResult:
    detail = f"{src} -> {dst}"
    if not require_confirmation("move_file", detail):
        return _error("User declined move_file")
    shutil.move(src, dst)
    return _ok(src=src, dst=dst)


def delete_file(path: str, confirm: bool = False) -> ToolResult:
    if not confirm:
        return _error("delete_file requires args.confirm=true and interactive confirmation")
    if not require_confirmation("delete_file", path):
        return _error("User declined delete_file")
    target = Path(path).expanduser()
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return _ok(path=str(target))


def write_file(path: str, content: str) -> ToolResult:
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return _ok(path=str(target), bytes=len(content.encode("utf-8")))


def read_file(path: str) -> ToolResult:
    target = Path(path).expanduser()
    return _ok(path=str(target), content=target.read_text(encoding="utf-8")[-12000:])


def browser_open(url: str) -> ToolResult:
    completed = subprocess.run(["open", url], capture_output=True, text=True)
    return _ok(returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)


def set_volume(level: int) -> ToolResult:
    clamped = max(0, min(100, int(level)))
    script = f"set volume output volume {clamped}"
    completed = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return _ok(level=clamped, returncode=completed.returncode, stderr=completed.stderr)


def get_clipboard() -> ToolResult:
    return _ok(text=pyperclip.paste())


def set_clipboard(text: str) -> ToolResult:
    pyperclip.copy(text)
    return _ok(chars=len(text))


TOOLS: dict[str, Callable[..., ToolResult]] = {
    "run_shell": run_shell,
    "open_app": open_app,
    "close_app": close_app,
    "click_at": click_at,
    "type_text": type_text,
    "press_key": press_key,
    "take_screenshot": take_screenshot,
    "read_screen": read_screen,
    "open_file": open_file,
    "move_file": move_file,
    "delete_file": delete_file,
    "write_file": write_file,
    "read_file": read_file,
    "browser_open": browser_open,
    "set_volume": set_volume,
    "get_clipboard": get_clipboard,
    "set_clipboard": set_clipboard,
}


TOOL_SPECS = [
    {"name": "run_shell", "description": "Run a terminal command and return stdout/stderr.", "params": {"command": "str"}},
    {"name": "open_app", "description": "Open a macOS app by name via open -a.", "params": {"app_name": "str"}},
    {"name": "close_app", "description": "Quit a macOS app by name using AppleScript.", "params": {"app_name": "str"}},
    {"name": "click_at", "description": "Move mouse and click at screen coordinates.", "params": {"x": "int", "y": "int"}},
    {"name": "type_text", "description": "Type text with the keyboard.", "params": {"text": "str"}},
    {"name": "press_key", "description": "Press a key or shortcut like cmd+space.", "params": {"key": "str"}},
    {"name": "take_screenshot", "description": "Capture screen, resize to 1024px wide, return base64 PNG.", "params": {}},
    {"name": "read_screen", "description": "Use llava to describe the current screen.", "params": {}},
    {"name": "open_file", "description": "Open a file with its default app.", "params": {"path": "str"}},
    {"name": "move_file", "description": "Move or rename a file after confirmation.", "params": {"src": "str", "dst": "str"}},
    {"name": "delete_file", "description": "Delete a file or folder after confirm=true and user confirmation.", "params": {"path": "str", "confirm": "bool"}},
    {"name": "write_file", "description": "Write content to a file, creating parent folders.", "params": {"path": "str", "content": "str"}},
    {"name": "read_file", "description": "Read a UTF-8 text file.", "params": {"path": "str"}},
    {"name": "browser_open", "description": "Open a URL in the default browser.", "params": {"url": "str"}},
    {"name": "set_volume", "description": "Set macOS output volume 0-100.", "params": {"level": "int"}},
    {"name": "get_clipboard", "description": "Return current clipboard text.", "params": {}},
    {"name": "set_clipboard", "description": "Set clipboard text.", "params": {"text": "str"}},
]
