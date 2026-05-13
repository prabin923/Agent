"""CLI entry point for ARIA."""

from __future__ import annotations

import sys

from agent import AriaAgent
from config import ENABLE_TTS


def speak(text: str) -> None:
    if not ENABLE_TTS:
        return
    try:
        import pyttsx3

        engine = pyttsx3.init()
        engine.say(text)
        engine.runAndWait()
    except Exception:
        pass


def read_multiline_goal() -> str:
    print("ARIA ready. What would you like me to do?")
    print("Enter your goal. Finish with Ctrl-D on a new line.")
    chunks = sys.stdin.read().strip()
    return chunks


def main() -> int:
    goal = read_multiline_goal()
    if not goal:
        print("No goal provided.")
        return 1

    agent = AriaAgent()
    summary = agent.run(goal)
    print("\nFinal summary:")
    print(summary)
    speak(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
