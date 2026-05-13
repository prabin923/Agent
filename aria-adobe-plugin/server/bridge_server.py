"""
ARIA Adobe Bridge — FastAPI WebSocket server for Premiere Pro / After Effects panels.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

LOG_DIR = Path(__file__).resolve().parent / "aria_adobe_logs"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aria_adobe_bridge")


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append_log(entry: dict[str, Any]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = LOG_DIR / f"aria_{day}.jsonl"
    line = json.dumps({"ts": _utc_ts(), **entry}, default=str)
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


@dataclass
class PendingCommand:
    expected: int
    results: list[dict[str, Any]] = field(default_factory=list)
    event: asyncio.Event = field(default_factory=asyncio.Event)


app = FastAPI(title="ARIA Adobe Bridge", version="1.0.0")

SERVICE_NAME = "ARIA Adobe Bridge"


@app.get("/")
async def health() -> dict[str, Any]:
    """Liveness probe and quick status for operators and the main ARIA agent."""

    snap = await status()
    return {
        "service": SERVICE_NAME,
        "version": "1.0.0",
        "ok": True,
        "websocket_path": "/ws",
        "command_path": "/command",
        "status_path": "/status",
        "connections": snap,
    }


clients: list[dict[str, Any]] = []
clients_lock = asyncio.Lock()
pending: dict[str, PendingCommand] = {}
pending_lock = asyncio.Lock()


async def _register_client(conn: dict[str, Any]) -> None:
    async with clients_lock:
        clients.append(conn)


async def _unregister_client(conn: dict[str, Any]) -> None:
    async with clients_lock:
        if conn in clients:
            clients.remove(conn)


def _targets_for_app(app: str) -> list[dict[str, Any]]:
    if app == "premiere":
        return [c for c in clients if c.get("app") == "premiere"]
    if app == "aftereffects":
        return [c for c in clients if c.get("app") == "aftereffects"]
    if app == "both":
        return list(clients)
    return []


async def _resolve_pending_result(data: dict[str, Any]) -> None:
    cid = data.get("id")
    if not cid or not isinstance(cid, str):
        return
    async with pending_lock:
        p = pending.get(cid)
        if not p:
            return
        p.results.append(data)
        if len(p.results) >= p.expected:
            p.event.set()


@app.get("/status")
async def status() -> dict[str, Any]:
    async with clients_lock:
        premiere = sum(1 for c in clients if c.get("app") == "premiere")
        ae = sum(1 for c in clients if c.get("app") == "aftereffects")
        unknown = sum(1 for c in clients if c.get("app") not in ("premiere", "aftereffects"))
    return {
        "premiere_connected": premiere,
        "aftereffects_connected": ae,
        "unknown_registered": unknown,
        "total": premiere + ae + unknown,
    }


@app.post("/command")
async def post_command(body: dict[str, Any]) -> JSONResponse:
    app_target = body.get("app")
    action = body.get("action")
    params = body.get("params") or {}
    if app_target not in ("premiere", "aftereffects", "both"):
        raise HTTPException(status_code=400, detail='app must be "premiere", "aftereffects", or "both"')
    if not action or not isinstance(action, str):
        raise HTTPException(status_code=400, detail="action is required")

    async with clients_lock:
        targets = _targets_for_app(app_target)

    if not targets:
        raise HTTPException(status_code=503, detail=f"No connected panels for app={app_target}")

    cmd_id = str(uuid.uuid4())
    message = {"id": cmd_id, "app": app_target, "action": action, "params": params}

    pend = PendingCommand(expected=len(targets))
    async with pending_lock:
        pending[cmd_id] = pend

    _append_log({"kind": "command_out", "id": cmd_id, "message": message})

    for t in targets:
        ws: WebSocket = t["ws"]
        try:
            await ws.send_text(json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            logger.exception("send failed: %s", exc)
            async with pending_lock:
                pending.pop(cmd_id, None)
            raise HTTPException(status_code=500, detail="Failed to send to a panel") from exc

    try:
        await asyncio.wait_for(pend.event.wait(), timeout=10.0)
    except asyncio.TimeoutError:
        async with pending_lock:
            pending.pop(cmd_id, None)
        _append_log({"kind": "command_timeout", "id": cmd_id, "message": message})
        raise HTTPException(status_code=504, detail="Timed out waiting for Adobe panel response")

    async with pending_lock:
        pending.pop(cmd_id, None)

    results = list(pend.results)
    _append_log({"kind": "command_results", "id": cmd_id, "results": results})

    combined: dict[str, Any] = {"id": cmd_id, "responses": results}
    if len(results) == 1:
        combined["primary"] = results[0]
    return JSONResponse(content=combined)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    conn: dict[str, Any] = {"ws": websocket, "app": None}
    await _register_client(conn)
    logger.info("WebSocket client connected")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                _append_log({"kind": "ws_nonjson", "raw": raw[:2000]})
                await websocket.send_text(json.dumps({"type": "echo", "body": {"raw": raw}}))
                continue

            if data.get("type") == "register":
                app_name = data.get("app")
                conn["app"] = app_name
                _append_log({"kind": "register", "app": app_name})
                continue

            if data.get("id") and data.get("status") is not None and data.get("action") is None:
                await _resolve_pending_result(data)
                _append_log({"kind": "panel_result", "payload": data})
                continue

            _append_log({"kind": "ws_message", "payload": data})
            await websocket.send_text(json.dumps({"type": "echo", "body": data}))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    finally:
        await _unregister_client(conn)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=7777)
