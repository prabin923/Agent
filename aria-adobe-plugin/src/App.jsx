import React, { useCallback, useEffect, useState } from "react";
import * as bridge from "./bridge.js";
import { appKey, displayAppName, installCommandRouting } from "./commandRouter.js";

const PLUGIN_VERSION = "1.0.0";

/**
 * @typedef {{ ts: number, action: string, status: string, summary: string }} LogEntry
 */

/**
 * @param {number} ts
 * @returns {string}
 */
function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
  } catch (e) {
    return "";
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  /** @type {[LogEntry[], function]} */
  const [logs, setLogs] = useState([]);
  const [rawInput, setRawInput] = useState('{"type":"ping"}');

  const appendLog = useCallback((entry) => {
    setLogs((prev) => {
      const next = prev.concat([entry]);
      return next.length > 20 ? next.slice(next.length - 20) : next;
    });
  }, []);

  useEffect(() => {
    bridge.setStatusListener(setConnected);
    installCommandRouting(appendLog);
    bridge.connect(appKey);
    return () => {
      bridge.setStatusListener(null);
      bridge.setCommandListener(null);
      bridge.setLogListener(null);
    };
  }, [appendLog]);

  const clearLog = useCallback(() => setLogs([]), []);

  const sendRaw = useCallback(() => {
    const ok = bridge.sendRaw(rawInput);
    appendLog({
      ts: Date.now(),
      action: "manual_send",
      status: ok ? "success" : "error",
      summary: ok ? "Sent to server" : "Not connected",
    });
  }, [rawInput, appendLog]);

  const appLabel = displayAppName();

  return (
    <>
      <style>{`
        .aria-root { display:flex; flex-direction:column; height:100%; min-width:300px; min-height:400px; background:#1e1e1e; color:#e0e0e0; box-sizing:border-box; }
        .aria-header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #333; flex-shrink:0; }
        .aria-title { font-size:14px; font-weight:600; letter-spacing:0.02em; }
        .aria-status { display:flex; align-items:center; gap:8px; font-size:11px; color:#aaa; }
        .aria-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .aria-dot-on { background:#2ecc71; box-shadow:0 0 6px rgba(46,204,113,0.6); }
        .aria-dot-off { background:#e74c3c; box-shadow:0 0 6px rgba(231,76,60,0.4); }
        .aria-log-wrap { flex:1; overflow:auto; padding:8px 12px; }
        .aria-log-row { font-size:11px; line-height:1.35; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #2a2a2a; }
        .aria-log-meta { color:#888; margin-bottom:2px; }
        .aria-log-action { color:#7eb6ff; font-weight:500; }
        .aria-log-ok { color:#2ecc71; }
        .aria-log-err { color:#e74c3c; }
        .aria-toolbar { padding:8px 12px; border-top:1px solid #333; flex-shrink:0; }
        .aria-btn { background:#333; color:#eee; border:1px solid #444; border-radius:4px; padding:6px 10px; font-size:11px; cursor:pointer; }
        .aria-btn:hover { background:#3d3d3d; }
        .aria-row { display:flex; gap:8px; align-items:center; margin-top:8px; }
        .aria-input { flex:1; background:#111; color:#ddd; border:1px solid #444; border-radius:4px; padding:6px 8px; font-size:11px; font-family:Menlo,Monaco,monospace; }
        .aria-footer { padding:8px 12px; border-top:1px solid #333; font-size:10px; color:#777; flex-shrink:0; display:flex; justify-content:space-between; }
      `}</style>
      <div className="aria-root">
        <div className="aria-header">
          <div className="aria-title">ARIA Bridge</div>
          <div className="aria-status">
            <span className={"aria-dot " + (connected ? "aria-dot-on" : "aria-dot-off")} title={connected ? "Connected" : "Disconnected"} />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
        <div className="aria-log-wrap">
          {logs.length === 0 ? (
            <div style={{ color: "#666", fontSize: 11 }}>No commands yet.</div>
          ) : (
            logs.map((row, idx) => (
              <div className="aria-log-row" key={row.ts + "-" + idx}>
                <div className="aria-log-meta">
                  {formatTime(row.ts)} — <span className="aria-log-action">{row.action}</span>{" "}
                  <span className={row.status === "success" ? "aria-log-ok" : "aria-log-err"}>{row.status}</span>
                </div>
                <div style={{ color: "#bbb", wordBreak: "break-word" }}>{row.summary}</div>
              </div>
            ))
          )}
        </div>
        <div className="aria-toolbar">
          <button type="button" className="aria-btn" onClick={clearLog}>
            Clear Log
          </button>
          <div className="aria-row">
            <input className="aria-input" value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder='Raw JSON or text' />
            <button type="button" className="aria-btn" onClick={sendRaw}>
              Send to ARIA
            </button>
          </div>
        </div>
        <div className="aria-footer">
          <span>{appLabel}</span>
          <span>v{PLUGIN_VERSION}</span>
        </div>
      </div>
    </>
  );
}
