"""Screen capture and local vision model helpers."""

from __future__ import annotations

import base64
import io

import mss
from PIL import Image

from config import SCREENSHOT_WIDTH, VISION_MODEL
from ollama_client import OllamaClient


def take_screenshot_base64(width: int = SCREENSHOT_WIDTH) -> str:
    """Capture the primary display and return a resized PNG as base64."""

    with mss.mss() as screen:
        monitor = screen.monitors[1]
        raw = screen.grab(monitor)
        image = Image.frombytes("RGB", raw.size, raw.rgb)

    if image.width > width:
        height = int(image.height * (width / image.width))
        image = image.resize((width, height), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def describe_screen(client: OllamaClient | None = None) -> str:
    client = client or OllamaClient()
    screenshot = take_screenshot_base64()
    prompt = (
        "Describe the current macOS screen in concise, actionable terms. "
        "Mention visible app names, active windows, dialogs, buttons, text fields, "
        "and whether the previous action appears successful."
    )
    return client.generate(VISION_MODEL, prompt, images=[screenshot], temperature=0.0)


def verify_action(goal: str, action: str, result: str, client: OllamaClient | None = None) -> str:
    """Capture the screen and ask the vision model whether the action helped."""

    client = client or OllamaClient()
    screenshot = take_screenshot_base64()
    prompt = (
        "You are verifying a macOS automation step.\n"
        f"User goal: {goal}\n"
        f"Last action: {action}\n"
        f"Tool result: {result[:2000]}\n\n"
        "Describe what is visible and say whether the action appears successful, "
        "blocked, or incomplete. Keep it concise."
    )
    return client.generate(VISION_MODEL, prompt, images=[screenshot], temperature=0.0)
