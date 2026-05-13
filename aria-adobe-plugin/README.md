# ARIA Bridge (Adobe UXP)

Local WebSocket bridge between **Premiere Pro** / **After Effects** (UXP panels) and an **ARIA** FastAPI server on `ws://localhost:7777/ws` and `http://127.0.0.1:7777`.

## Prerequisites

- **Node.js** 18+ (for building the panel bundle)
- **Adobe UXP Developer Tool** (UDT) for loading the plugin
- **Python** 3.11+
- **Premiere Pro** and/or **After Effects** 24.0 or newer (manifest targets both)

## Install the UXP plugin (UDT)

1. From this folder run:

   ```bash
   npm install
   npm run typecheck   # optional: static TypeScript check
   npm run build       # esbuild → dist/index.js (~24ms typical)
   ```

   The panel is **TypeScript** (`src/*.ts`, `src/*.tsx`) and builds with **esbuild** (no Webpack/Babel). Use `npm run watch` while iterating.

2. Open **UXP Developer Tool**, choose **Add Plugin**, then select the **`dist`** folder inside `aria-adobe-plugin` (the folder that contains `manifest.json` and `index.html` after the build).

3. Enable **Developer Mode** in Premiere / After Effects if prompted, then load **ARIA Bridge** from the **Plugins** menu and open the **ARIA Bridge** panel (`ariaPanel`).

## Start the bridge server

```bash
cd aria-adobe-plugin/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python bridge_server.py
```

The server listens on **port 7777**. Logs are appended under `server/aria_adobe_logs/` as daily `.jsonl` files.

## Wire `adobe_tools.py` into the main ARIA agent

1. Copy or symlink `aria-adobe-plugin/server/adobe_tools.py` into your ARIA agent package (or add this repo path to `PYTHONPATH`).

2. Import the helpers where tools are registered, for example:

   ```python
   from adobe_tools import (
       premiere_cut_clip,
       premiere_apply_effect,
       premiere_export,
       premiere_get_timeline,
       premiere_add_marker,
       ae_create_comp,
       ae_add_text,
       ae_add_keyframe,
       ae_apply_effect,
       ae_render,
       ae_get_comp_info,
   )
   ```

3. Expose them to your tool-calling layer (OpenAI tools, LangChain tools, etc.) with short descriptions that mention **sequence names**, **0-based track/clip indices**, and **absolute output paths**.

## Example ARIA-style instructions

Natural-language prompts your agent might turn into tool calls:

- “In Premiere sequence **Edit_V1**, cut video track **0** at **12.5** seconds.” → `premiere_cut_clip("Edit_V1", 0, 12.5)`

- “Apply **Gaussian Blur** to clip **0** on track **1** in **Edit_V1**.” → `premiere_apply_effect("Edit_V1", 0, 1, "AE.ADBE Gaussian Blur")` (match names vary; use the Effects panel match name from Adobe docs.)

- “Export **Master** to `/Users/me/out/h264.mp4` using preset `/path/to/preset.epr`.” → `premiere_export("Master", "/Users/me/out/h264.mp4", "/path/to/preset.epr")`

- “Describe the current Premiere timeline.” → `premiere_get_timeline()` (uses the active sequence when `sequenceName` is omitted)

- “In After Effects, create comp **LowerThird**, 1920×1080, 30 fps, 10 s.” → `ae_create_comp("LowerThird", 1920, 1080, 30, 10)`

- “Add white text **Hello ARIA** size 72 at (200,540) in **LowerThird**.” → `ae_add_text("LowerThird", "Hello ARIA", 72, 200, 540)`

- “Set opacity keyframe on **Text** layer in **LowerThird** at 1 s to 50%.” → `ae_add_keyframe("LowerThird", "Text", "Transform.Opacity", 1.0, 50)`

## Troubleshooting

### WebSocket shows red / “Disconnected” in the panel

- Confirm the server is running (`python bridge_server.py`) and listening on **7777** (`lsof -i :7777`).
- Ensure the plugin was built from this project so `manifest.json` includes `http://localhost:7777` and `ws://localhost:7777` under `requiredPermissions.network.domains`.
- Corporate proxies or VPNs can interfere with localhost; try disabling them briefly.

### `evalScript` errors or “Unknown action”

- Match **action** names exactly to those in `src/commandRouter.js` (they mirror the ExtendScript routers).
- Premiere **QE** features (`cutClipAtTime`, `splitAllTracksAtTime`, some transitions) require `app.enableQE()` and a compatible project/sequence state.

### Permission / manifest issues in UDT

- `localFileSystem: "fullAccess"` and `network` domains must be present for export/import and localhost sockets.
- Reload the plugin in UDT after changing `manifest.json`.

### REST `/command` returns 503

- No panel has completed the WebSocket `register` handshake yet. Open **ARIA Bridge** inside Premiere or After Effects so it connects and sends `{"type":"register","app":"premiere"}` or `"aftereffects"`.

### `/command` times out (504)

- The panel did not respond within **10 seconds** (heavy export/render). Increase the timeout in `bridge_server.py` if needed, or enqueue work asynchronously in ExtendScript where possible.

## Repository layout

- `src/App.tsx` — dark React panel UI (typed)
- `src/bridge.ts` — WebSocket client with 3 s reconnect
- `src/commandRouter.ts` — host detection, `evalScript` orchestration
- `src/scripts/premiere.jsx` / `aftereffects.jsx` — ExtendScript libraries (return JSON strings)
- `server/bridge_server.py` — FastAPI + `/ws`, `/command`, `/status`
- `server/adobe_tools.py` — HTTP helpers for the main ARIA agent
