"""
HTTP helpers for the main ARIA agent to drive Adobe apps through the bridge server.

Each function POSTs to http://127.0.0.1:7777/command and returns the JSON body.
"""

from __future__ import annotations

from typing import Any

import httpx

COMMAND_URL = "http://127.0.0.1:7777/command"
DEFAULT_TIMEOUT = 30.0


def _post(app: str, action: str, params: dict[str, Any]) -> dict[str, Any]:
    payload = {"app": app, "action": action, "params": params}
    with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
        response = client.post(COMMAND_URL, json=payload)
        response.raise_for_status()
        return response.json()


def premiere_cut_clip(sequence_name: str, track_index: int, time_seconds: float) -> dict[str, Any]:
    return _post(
        "premiere",
        "cutClipAtTime",
        {"sequenceName": sequence_name, "trackIndex": track_index, "timeInSeconds": time_seconds},
    )


def premiere_apply_effect(
    sequence_name: str, clip_index: int, track_index: int, effect_name: str
) -> dict[str, Any]:
    return _post(
        "premiere",
        "applyEffectToClip",
        {
            "sequenceName": sequence_name,
            "clipIndex": clip_index,
            "trackIndex": track_index,
            "effectName": effect_name,
        },
    )


def premiere_export(sequence_name: str, output_path: str, preset_name: str) -> dict[str, Any]:
    return _post(
        "premiere",
        "exportSequence",
        {"sequenceName": sequence_name, "outputPath": output_path, "presetName": preset_name},
    )


def premiere_get_timeline(sequence_name: str | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if sequence_name:
        params["sequenceName"] = sequence_name
    return _post("premiere", "getSequenceInfo", params)


def premiere_add_marker(sequence_name: str, time_seconds: float, label: str) -> dict[str, Any]:
    return _post(
        "premiere",
        "addMarker",
        {"sequenceName": sequence_name, "timeInSeconds": time_seconds, "label": label, "comment": ""},
    )


def ae_create_comp(name: str, width: int, height: int, fps: float, duration: float) -> dict[str, Any]:
    return _post(
        "aftereffects",
        "createComp",
        {"name": name, "width": width, "height": height, "frameRate": fps, "duration": duration},
    )


def ae_add_text(comp_name: str, text: str, font_size: int, x: float, y: float) -> dict[str, Any]:
    return _post(
        "aftereffects",
        "addTextLayer",
        {
            "compName": comp_name,
            "text": text,
            "fontSize": font_size,
            "r": 255,
            "g": 255,
            "b": 255,
            "x": x,
            "y": y,
        },
    )


def ae_add_keyframe(
    comp_name: str, layer_name: str, property_path: str, time: float, value: Any
) -> dict[str, Any]:
    return _post(
        "aftereffects",
        "addKeyframe",
        {
            "compName": comp_name,
            "layerName": layer_name,
            "property": property_path,
            "timeInSeconds": time,
            "value": value,
        },
    )


def ae_apply_effect(comp_name: str, layer_name: str, effect_match_name: str) -> dict[str, Any]:
    return _post(
        "aftereffects",
        "applyEffect",
        {"compName": comp_name, "layerName": layer_name, "effectMatchName": effect_match_name},
    )


def ae_render(comp_name: str, output_path: str) -> dict[str, Any]:
    return _post(
        "aftereffects",
        "renderComp",
        {"compName": comp_name, "outputPath": output_path, "outputModule": "Lossless"},
    )


def ae_get_comp_info(comp_name: str) -> dict[str, Any]:
    return _post("aftereffects", "getCompInfo", {"compName": comp_name})
