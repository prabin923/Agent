"""Small wrapper around the local Ollama HTTP API."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Any

from config import OLLAMA_BASE_URL


class OllamaError(RuntimeError):
    """Raised when Ollama is unavailable or returns an invalid response."""


class OllamaClient:
    def __init__(self, base_url: str = OLLAMA_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def generate(
        self,
        model: str,
        prompt: str,
        *,
        system: str | None = None,
        images: list[str] | None = None,
        temperature: float = 0.1,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system
        if images:
            payload["images"] = images

        request = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise OllamaError(
                f"Could not reach Ollama at {self.base_url}. Is `ollama serve` running?"
            ) from exc
        except json.JSONDecodeError as exc:
            raise OllamaError("Ollama returned invalid JSON") from exc

        text = data.get("response")
        if not isinstance(text, str):
            raise OllamaError(f"Ollama response missing text: {data!r}")
        return text.strip()


def ensure_base64_image(value: str) -> str:
    """Accept a raw base64 string or a data URL and return plain base64 for Ollama."""

    if value.startswith("data:image"):
        return value.split(",", 1)[1]
    base64.b64decode(value, validate=True)
    return value
