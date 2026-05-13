"""ARIA observe -> plan -> act -> verify loop."""

from __future__ import annotations

import json
import re
from typing import Any

from config import MAX_TOOL_CALLS, MAX_VERIFY_RETRIES, PLANNER_MODEL
from ollama_client import OllamaClient
from safety import ActionLogger
from tools import BRIDGE_TOOLS_ENABLED, TOOLS, TOOL_SPECS, should_skip_vision_verify
from vision import verify_action


PLANNER_SYSTEM_PROMPT = """You are ARIA, a local macOS automation agent.
Choose exactly one tool call for the next action.
Respond ONLY with valid JSON and no markdown.

Response formats:
{"tool":"tool_name","args":{...},"reasoning":"brief reason"}
{"tool":"done","result":"summary of what was accomplished"}

Rules:
- Use the available tools exactly by name.
- Prefer low-risk, observable actions.
- Use read_screen after GUI actions when visual state matters.
- Do not invent tool names or parameters.
- Destructive shell commands, moving files, and deleting files require user confirmation by the tool.
"""


def _extract_json(text: str) -> dict[str, Any]:
    """Tolerate small model mistakes by extracting the first JSON object."""

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Planner response must be a JSON object")
    return parsed


def _format_tool_call(name: str, args: dict[str, Any]) -> str:
    rendered = ", ".join(f"{key}={value!r}" for key, value in args.items())
    return f"{name}({rendered})"


class AriaAgent:
    def __init__(self, client: OllamaClient | None = None, logger: ActionLogger | None = None) -> None:
        self.client = client or OllamaClient()
        self.logger = logger or ActionLogger()

    def run(self, goal: str) -> str:
        history: list[dict[str, Any]] = []
        failures = 0

        for call_index in range(1, MAX_TOOL_CALLS + 1):
            planner_payload = {
                "goal": goal,
                "available_tools": TOOL_SPECS,
                "history": history[-10:],
                "tool_call_number": call_index,
                "max_tool_calls": MAX_TOOL_CALLS,
            }
            prompt = json.dumps(planner_payload, ensure_ascii=False)

            system_prompt = PLANNER_SYSTEM_PROMPT
            if BRIDGE_TOOLS_ENABLED:
                system_prompt += (
                    "\n- Adobe Premiere/After Effects tools (premiere_* / ae_*) require the local ARIA Adobe Bridge "
                    "on port 7777 and the ARIA Bridge UXP panel connected in the target app."
                )

            try:
                raw = self.client.generate(PLANNER_MODEL, prompt, system=system_prompt)
                decision = _extract_json(raw)
            except Exception as exc:
                failures += 1
                self.logger.log("planner_error", {"error": str(exc)})
                print(f"Planner returned invalid output ({failures}/{MAX_VERIFY_RETRIES}): {exc}")
                if failures >= MAX_VERIFY_RETRIES:
                    return "Failed: planner repeatedly returned invalid output."
                continue

            tool_name = decision.get("tool")
            if tool_name == "done":
                result = str(decision.get("result", "Done."))
                self.logger.log("done", {"result": result, "history": history})
                return result

            args = decision.get("args", {})
            if not isinstance(tool_name, str) or tool_name not in TOOLS:
                failures += 1
                result = {"ok": False, "error": f"Unknown tool: {tool_name}"}
                history.append({"decision": decision, "result": result})
                self.logger.log("tool_error", {"decision": decision, "result": result})
                if failures >= MAX_VERIFY_RETRIES:
                    return f"Failed: planner selected invalid tools {failures} times."
                continue
            if not isinstance(args, dict):
                args = {}

            print(f"-> Calling tool: {_format_tool_call(tool_name, args)}")
            self.logger.log("tool_call", {"tool": tool_name, "args": args, "reasoning": decision.get("reasoning")})

            try:
                result = TOOLS[tool_name](**args)
            except TypeError as exc:
                failures += 1
                result = {"ok": False, "error": f"Bad arguments for {tool_name}: {exc}"}
            except Exception as exc:
                failures += 1
                result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

            verification = None
            if not should_skip_vision_verify(tool_name):
                try:
                    action = _format_tool_call(tool_name, args)
                    verification = verify_action(goal, action, json.dumps(result, default=str), self.client)
                    print(f"-> Vision verification: {verification[:240]}")
                except Exception as exc:
                    verification = f"Vision verification unavailable: {type(exc).__name__}: {exc}"

            # Verification is fed back as context. The planner decides whether another
            # action is needed or whether the goal is complete.
            history_item = {
                "tool": tool_name,
                "args": args,
                "reasoning": decision.get("reasoning"),
                "result": result,
                "vision_verification": verification,
            }
            history.append(history_item)
            self.logger.log("tool_result", history_item)

            if result.get("ok"):
                failures = 0
            elif failures >= MAX_VERIFY_RETRIES:
                return f"Failed after {MAX_VERIFY_RETRIES} retries. Last error: {result.get('error')}"

        return f"Stopped after reaching the {MAX_TOOL_CALLS} tool-call limit."
