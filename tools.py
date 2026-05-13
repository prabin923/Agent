"""System tools callable by ARIA's planner."""

from __future__ import annotations

import importlib.util
import os
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

from config import ADOBE_BRIDGE_BASE_URL, SHELL_TIMEOUT_SECONDS
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


def _load_adobe_tools_module() -> Any:
    """Load ``aria-adobe-plugin/server/adobe_tools.py`` when ``httpx`` is installed."""

    try:
        import httpx  # noqa: F401
    except ImportError:
        return None

    if "ARIA_ADOBE_BRIDGE_URL" not in os.environ:
        os.environ["ARIA_ADOBE_BRIDGE_URL"] = ADOBE_BRIDGE_BASE_URL

    path = Path(__file__).resolve().parent / "aria-adobe-plugin" / "server" / "adobe_tools.py"
    if not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location("aria_adobe_tools", path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        return None
    return module


_adobe_mod = _load_adobe_tools_module()
BRIDGE_TOOLS_ENABLED = _adobe_mod is not None
_registered_adobe_for_vision: set[str] = set()


def _normalize_bridge_response(data: Any) -> ToolResult:
    if not isinstance(data, dict):
        return _error("Adobe bridge returned a non-object response", raw=str(data)[:4000])
    primary = data.get("primary")
    if primary is None:
        responses = data.get("responses")
        if isinstance(responses, list) and responses:
            primary = responses[0]
    if not isinstance(primary, dict):
        return _error("Adobe bridge returned no panel result", envelope=data)
    if primary.get("status") == "error":
        return _error(str(primary.get("message") or "Adobe panel error"), panel=primary, envelope=data)
    return _ok(panel=primary, envelope=data, result=primary.get("result"))


def _call_adobe(method: str, *args: Any, **kwargs: Any) -> ToolResult:
    if _adobe_mod is None:
        return _error(
            "Adobe bridge tools are unavailable. Install `httpx` (see requirements.txt), ensure "
            "`aria-adobe-plugin/server/adobe_tools.py` exists, run `python bridge_server.py` in "
            "`aria-adobe-plugin/server`, and open the ARIA Bridge panel in Premiere Pro or After Effects."
        )
    try:
        import httpx

        fn = getattr(_adobe_mod, method)
        payload = fn(*args, **kwargs)
        return _normalize_bridge_response(payload)
    except httpx.HTTPStatusError as exc:
        body = ""
        try:
            body = exc.response.text[:4000]
        except Exception:
            body = ""
        return _error(f"Adobe bridge HTTP {exc.response.status_code}", http_body=body)
    except Exception as exc:
        return _error(f"{type(exc).__name__}: {exc}")


def premiere_cut_clip(sequence_name: str, track_index: int, time_seconds: float) -> ToolResult:
    return _call_adobe("premiere_cut_clip", sequence_name, track_index, time_seconds)


def premiere_apply_effect(
    sequence_name: str, clip_index: int, track_index: int, effect_name: str
) -> ToolResult:
    return _call_adobe("premiere_apply_effect", sequence_name, clip_index, track_index, effect_name)


def premiere_export(sequence_name: str, output_path: str, preset_name: str) -> ToolResult:
    return _call_adobe("premiere_export", sequence_name, output_path, preset_name)


def premiere_get_timeline(sequence_name: str | None = None) -> ToolResult:
    return _call_adobe("premiere_get_timeline", sequence_name)


def premiere_add_marker(sequence_name: str, time_seconds: float, label: str) -> ToolResult:
    return _call_adobe("premiere_add_marker", sequence_name, time_seconds, label)


def ae_create_comp(name: str, width: int, height: int, fps: float, duration: float) -> ToolResult:
    return _call_adobe("ae_create_comp", name, width, height, fps, duration)


def ae_add_text(comp_name: str, text: str, font_size: int, x: float, y: float) -> ToolResult:
    return _call_adobe("ae_add_text", comp_name, text, font_size, x, y)


def ae_add_keyframe(comp_name: str, layer_name: str, property_path: str, time: float, value: Any) -> ToolResult:
    return _call_adobe("ae_add_keyframe", comp_name, layer_name, property_path, time, value)


def ae_apply_effect(comp_name: str, layer_name: str, effect_match_name: str) -> ToolResult:
    return _call_adobe("ae_apply_effect", comp_name, layer_name, effect_match_name)


def ae_render(comp_name: str, output_path: str) -> ToolResult:
    return _call_adobe("ae_render", comp_name, output_path)


def ae_get_comp_info(comp_name: str) -> ToolResult:
    return _call_adobe("ae_get_comp_info", comp_name)


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

if _adobe_mod is not None:
    _adobe_tool_entries: dict[str, Callable[..., ToolResult]] = {
        "premiere_cut_clip": premiere_cut_clip,
        "premiere_apply_effect": premiere_apply_effect,
        "premiere_export": premiere_export,
        "premiere_get_timeline": premiere_get_timeline,
        "premiere_add_marker": premiere_add_marker,
        "ae_create_comp": ae_create_comp,
        "ae_add_text": ae_add_text,
        "ae_add_keyframe": ae_add_keyframe,
        "ae_apply_effect": ae_apply_effect,
        "ae_render": ae_render,
        "ae_get_comp_info": ae_get_comp_info,
    }
    TOOLS.update(_adobe_tool_entries)
    _registered_adobe_for_vision.update(_adobe_tool_entries.keys())


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

if _adobe_mod is not None:
    TOOL_SPECS.extend(
        [
            {
                "name": "premiere_cut_clip",
                "description": "Premiere: razor/split a video track at time (seconds). Requires ARIA Bridge + panel. Indices are 0-based.",
                "params": {"sequence_name": "str", "track_index": "int", "time_seconds": "float"},
            },
            {
                "name": "premiere_apply_effect",
                "description": "Premiere: add an effect to a clip by match name. Requires ARIA Bridge + panel.",
                "params": {
                    "sequence_name": "str",
                    "clip_index": "int",
                    "track_index": "int",
                    "effect_name": "str",
                },
            },
            {
                "name": "premiere_export",
                "description": "Premiere: export a sequence via exportAsMediaDirect. Requires ARIA Bridge + panel.",
                "params": {"sequence_name": "str", "output_path": "str", "preset_name": "str"},
            },
            {
                "name": "premiere_get_timeline",
                "description": "Premiere: return sequence JSON (clips/tracks). Omit sequence_name to use the active sequence.",
                "params": {"sequence_name": "str|null"},
            },
            {
                "name": "premiere_add_marker",
                "description": "Premiere: add a sequence marker at a time in seconds.",
                "params": {"sequence_name": "str", "time_seconds": "float", "label": "str"},
            },
            {
                "name": "ae_create_comp",
                "description": "After Effects: create a composition (duration in seconds, fps as float).",
                "params": {"name": "str", "width": "int", "height": "int", "fps": "float", "duration": "float"},
            },
            {
                "name": "ae_add_text",
                "description": "After Effects: add a white text layer at (x,y).",
                "params": {"comp_name": "str", "text": "str", "font_size": "int", "x": "float", "y": "float"},
            },
            {
                "name": "ae_add_keyframe",
                "description": "After Effects: set a keyframe on a layer property path (e.g. Transform.Opacity).",
                "params": {
                    "comp_name": "str",
                    "layer_name": "str",
                    "property_path": "str",
                    "time": "float",
                    "value": "any",
                },
            },
            {
                "name": "ae_apply_effect",
                "description": "After Effects: add an effect by match name to a layer.",
                "params": {"comp_name": "str", "layer_name": "str", "effect_match_name": "str"},
            },
            {
                "name": "ae_render",
                "description": "After Effects: enqueue comp to render queue and start rendering (blocking).",
                "params": {"comp_name": "str", "output_path": "str"},
            },
            {
                "name": "ae_get_comp_info",
                "description": "After Effects: return comp JSON (layers, duration, settings).",
                "params": {"comp_name": "str"},
            },
        ]
    )


def should_skip_vision_verify(tool_name: str) -> bool:
    """GUI vision checks are misleading for headless Adobe bridge calls."""

    if tool_name in {"take_screenshot", "read_screen"}:
        return True
    return tool_name in _registered_adobe_for_vision
