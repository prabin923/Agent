# ARIA

ARIA (Autonomous Runtime Intelligence Agent) is a local macOS automation agent that uses Ollama for planning and vision, then executes tool calls against the local system.

It runs fully offline after Ollama and the required models are installed.

## Requirements

- macOS 13 Ventura or newer
- Python 3.11+
- Ollama running locally at `http://localhost:11434`
- Accessibility permissions for the terminal app you use to run ARIA

## Setup

Install Ollama from:

```sh
https://ollama.com/download
```

Start Ollama:

```sh
ollama serve
```

Pull the local models:

```sh
ollama pull llama3
ollama pull llava
```

Create a virtual environment and install dependencies:

```sh
cd aria
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install
```

Grant macOS permissions:

1. Open System Settings.
2. Go to Privacy & Security.
3. Enable Accessibility for Terminal, iTerm, or the app running ARIA.
4. Enable Screen Recording for the same app so screenshots work.

## Run

```sh
python main.py
```

ARIA prints:

```text
ARIA ready. What would you like me to do?
```

Type a multi-line goal, then press `Ctrl-D` on a new line.

## Architecture

ARIA runs an observe -> plan -> act -> verify loop:

1. The CLI receives a user goal.
2. `llama3` receives the goal, tool list, and recent action history.
3. The model returns one JSON tool call, for example:

   ```json
   {"tool":"open_app","args":{"app_name":"Safari"},"reasoning":"Need to open the browser."}
   ```

4. ARIA executes the matching Python function from `tools.py`.
5. ARIA captures a screenshot after each non-screenshot tool call and asks `llava` to verify whether the action appears successful, blocked, or incomplete.
6. Tool results and vision verification are appended to the next planner prompt.
7. The planner can also explicitly call `read_screen` when it needs a fresh visual observation.
8. The loop ends when the planner returns:

   ```json
   {"tool":"done","result":"summary of what was accomplished"}
   ```

The loop is capped at 15 tool calls per goal and gives up after 5 consecutive planner/tool failures.

## Safety

ARIA asks for interactive confirmation before:

- `delete_file`
- `move_file`
- `run_shell` commands that match destructive patterns such as `rm`, `sudo`, `shutdown`, `git reset --hard`, or `git clean`

Every run writes a JSONL action log to:

```text
~/aria_logs/
```

Logs include timestamps, tool calls, arguments, planner reasoning, and results.

## Tool List

- `run_shell(command: str)`
- `open_app(app_name: str)`
- `close_app(app_name: str)`
- `click_at(x: int, y: int)`
- `type_text(text: str)`
- `press_key(key: str)`
- `take_screenshot()`
- `read_screen()`
- `open_file(path: str)`
- `move_file(src: str, dst: str)`
- `delete_file(path: str, confirm: bool)`
- `write_file(path: str, content: str)`
- `read_file(path: str)`
- `browser_open(url: str)`
- `set_volume(level: int)`
- `get_clipboard()`
- `set_clipboard(text: str)`

## Notes

- Ollama does not provide OpenAI-style function calling here, so ARIA uses a strict JSON protocol and parses the model response.
- `pyautogui` controls mouse and keyboard through macOS Accessibility permissions.
- `mss` captures the screen and `Pillow` resizes screenshots before sending them to `llava`.
- `playwright` is included for browser automation extensions, though the default `browser_open` tool uses the macOS default browser.
- Optional TTS is available with `ARIA_TTS=1 python main.py`.
# Agent
