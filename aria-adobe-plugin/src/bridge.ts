/**
 * WebSocket bridge to the local ARIA FastAPI server.
 */

const WS_URL = "ws://localhost:7777/ws";
const RECONNECT_MS = 3000;

export type LogEntry = {
  ts: number;
  action: string;
  status: string;
  summary: string;
};

/** Incoming command from the bridge server. */
export type ServerCommand = {
  id: string;
  app: "premiere" | "aftereffects" | "both";
  action: string;
  params?: Record<string, unknown>;
};

export type PanelResultPayload = {
  id: string;
  status: "success" | "error";
  result: unknown;
  message: string;
  sourceApp?: string;
};

type StatusListener = (connected: boolean) => void;
type LogListener = (entry: LogEntry) => void;
type CommandListener = (msg: ServerCommand) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusListener: StatusListener | null = null;
let logListener: LogListener | null = null;
let commandListener: CommandListener | null = null;

export function setStatusListener(fn: StatusListener | null): void {
  statusListener = fn;
}

export function setLogListener(fn: LogListener | null): void {
  logListener = fn;
}

export function setCommandListener(fn: CommandListener | null): void {
  commandListener = fn;
}

function emitStatus(connected: boolean): void {
  statusListener?.(connected);
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(lastAppKey);
  }, RECONNECT_MS);
}

let lastAppKey: "premiere" | "aftereffects" = "premiere";

export function connect(appKey?: "premiere" | "aftereffects"): void {
  if (appKey) lastAppKey = appKey;
  clearReconnectTimer();
  try {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
  } catch {
    socket = null;
  }

  emitStatus(false);
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    socket = null;
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    emitStatus(true);
    try {
      socket?.send(JSON.stringify({ type: "register", app: lastAppKey }));
    } catch {
      /* ignore */
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

  socket.addEventListener("message", (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      if (msg && msg.type === "echo" && logListener) {
        logListener({
          ts: Date.now(),
          action: "echo",
          status: "success",
          summary: JSON.stringify(msg.body ?? msg),
        });
        return;
      }
      if (
        msg &&
        typeof msg.id === "string" &&
        typeof msg.action === "string" &&
        typeof msg.app === "string" &&
        commandListener
      ) {
        commandListener(msg as ServerCommand);
        return;
      }
    } catch (e) {
      logListener?.({
        ts: Date.now(),
        action: "parse",
        status: "error",
        summary: String(e),
      });
    }
  });
}

export function sendResult(payload: PanelResultPayload): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function sendRaw(raw: string): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(raw);
    return true;
  } catch {
    return false;
  }
}

export function isConnected(): boolean {
  return !!(socket && socket.readyState === WebSocket.OPEN);
}
