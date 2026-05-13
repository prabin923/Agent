/**
 * WebSocket bridge to the local ARIA FastAPI server.
 * Connects on load, auto-reconnects every 3s, exposes status and handlers.
 */

const WS_URL = "ws://localhost:7777/ws";
const RECONNECT_MS = 3000;

/** @type {WebSocket | null} */
let socket = null;
/** @type {ReturnType<typeof setInterval> | null} */
let reconnectTimer = null;
/** @type {((connected: boolean) => void) | null} */
let statusListener = null;
/** @type {((entry: { ts: number, action: string, status: string, summary: string }) => void) | null} */
let logListener = null;
/** @type {((msg: object) => void) | null} */
let commandListener = null;

/**
 * @param {(connected: boolean) => void} fn
 */
export function setStatusListener(fn) {
  statusListener = fn;
}

/**
 * @param {(entry: { ts: number, action: string, status: string, summary: string }) => void} fn
 */
export function setLogListener(fn) {
  logListener = fn;
}

/**
 * @param {((msg: object) => void) | null} fn
 */
export function setCommandListener(fn) {
  commandListener = fn;
}

function emitStatus(connected) {
  if (statusListener) statusListener(connected);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(lastAppKey);
  }, RECONNECT_MS);
}

/** @type {string} */
let lastAppKey = "premiere";

/**
 * @param {string} [appKey] "premiere" | "aftereffects"
 */
export function connect(appKey) {
  if (appKey) lastAppKey = appKey;
  clearReconnectTimer();
  try {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
  } catch (e) {
    socket = null;
  }

  emitStatus(false);
  try {
    socket = new WebSocket(WS_URL);
  } catch (e) {
    socket = null;
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    emitStatus(true);
    try {
      socket.send(JSON.stringify({ type: "register", app: lastAppKey }));
    } catch (e) {
      // ignore
    }
  });

  socket.addEventListener("close", () => {
    emitStatus(false);
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    emitStatus(false);
  });

  socket.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg && msg.type === "echo" && logListener) {
        logListener({
          ts: Date.now(),
          action: "echo",
          status: "success",
          summary: JSON.stringify(msg.body ?? msg),
        });
        return;
      }
      if (msg && msg.id && msg.action && msg.app && commandListener) {
        commandListener(msg);
        return;
      }
    } catch (e) {
      if (logListener) {
        logListener({
          ts: Date.now(),
          action: "parse",
          status: "error",
          summary: String(e),
        });
      }
    }
  });
}

/**
 * @param {object} payload
 */
export function sendResult(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Send a raw string to the server (manual test / agent channel).
 * @param {string} raw
 */
export function sendRaw(raw) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(raw);
    return true;
  } catch (e) {
    return false;
  }
}

export function isConnected() {
  return !!(socket && socket.readyState === WebSocket.OPEN);
}
