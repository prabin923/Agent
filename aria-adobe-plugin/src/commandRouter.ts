/**
 * Routes WebSocket command payloads to ExtendScript in the active host app.
 */

import premiereScript from "host-script:premiere";
import aeScript from "host-script:aftereffects";
import type { LogEntry, PanelResultPayload, ServerCommand } from "./bridge";
import * as bridge from "./bridge";

const uxp = require("uxp") as typeof import("uxp");
const hostName = uxp.host.name;

const PREMIERE_ACTIONS = new Set<string>([
  "cutClipAtTime",
  "trimClip",
  "moveClip",
  "deleteClip",
  "splitAllTracksAtTime",
  "applyEffectToClip",
  "removeEffectFromClip",
  "setEffectParam",
  "addTransition",
  "createSequence",
  "getSequenceInfo",
  "addMarker",
  "setInOutPoints",
  "getPlayheadPosition",
  "setClipVolume",
  "muteTrack",
  "exportSequence",
]);

const AE_ACTIONS = new Set<string>([
  "createComp",
  "getCompInfo",
  "setCompBackground",
  "duplicateComp",
  "addSolidLayer",
  "addTextLayer",
  "addShapeLayer",
  "addFootageLayer",
  "deleteLayer",
  "duplicateLayer",
  "setLayerPosition",
  "setLayerOpacity",
  "setLayerScale",
  "addKeyframe",
  "setKeyframeEasing",
  "applyEffect",
  "setEffectProperty",
  "removeEffect",
  "setExpression",
  "removeExpression",
  "renderComp",
  "addToRenderQueue",
]);

export type AppKey = "premiere" | "aftereffects";

export const appKey: AppKey = hostName === "PP" ? "premiere" : "aftereffects";

export function displayAppName(): string {
  if (hostName === "PP") return "Premiere Pro";
  if (hostName === "AEFT") return "After Effects";
  return hostName || "Adobe";
}

type EvalScriptFn = (code: string) => Promise<string>;

function getEvalScript(): EvalScriptFn {
  if (hostName === "PP") {
    const mod = require("premierepro") as typeof import("premierepro");
    return (code) => mod.evalScript(code);
  }
  if (hostName === "AEFT") {
    const mod = require("aftereffects") as typeof import("aftereffects");
    return (code) => mod.evalScript(code);
  }
  throw new Error("ARIA Bridge: unsupported host " + hostName);
}

const evalHostScript = getEvalScript();

type ExtendScriptEnvelope = { status?: string; result?: unknown; message?: string };

function withSource(body: Omit<PanelResultPayload, "sourceApp">): PanelResultPayload {
  return { ...body, sourceApp: appKey };
}

async function runExtendScript(prelude: string, action: string, params: Record<string, unknown>): Promise<string> {
  const payload = JSON.stringify({ action, params: params || {} });
  const escapedPayload = JSON.stringify(payload);
  const code = prelude + "\n$._ariaBridge.routeFromPanel(" + escapedPayload + ");";
  const raw = await evalHostScript(code);
  return typeof raw === "string" ? raw : String(raw);
}

export async function handleIncomingCommand(msg: ServerCommand): Promise<PanelResultPayload> {
  const target = msg.app;
  const action = msg.action;

  if (target !== appKey && target !== "both") {
    return withSource({
      id: msg.id,
      status: "error",
      result: null,
      message: "Command targets " + target + " but panel runs in " + appKey,
    });
  }

  if (target === "both") {
    const allowed = appKey === "premiere" ? PREMIERE_ACTIONS.has(action) : AE_ACTIONS.has(action);
    if (!allowed) {
      return withSource({
        id: msg.id,
        status: "success",
        result: { skipped: true, reason: "Action not handled in " + appKey },
        message: "",
      });
    }
  }

  const prelude = appKey === "premiere" ? premiereScript : aeScript;
  let inner: string;
  try {
    inner = await runExtendScript(prelude, msg.action, (msg.params as Record<string, unknown>) || {});
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return withSource({
      id: msg.id,
      status: "error",
      result: null,
      message: err,
    });
  }

  try {
    const parsed = JSON.parse(inner) as ExtendScriptEnvelope;
    if (parsed && parsed.status === "error") {
      return withSource({
        id: msg.id,
        status: "error",
        result: null,
        message: String(parsed.message || "ExtendScript error"),
      });
    }
    return withSource({
      id: msg.id,
      status: "success",
      result: parsed && parsed.result !== undefined ? parsed.result : parsed,
      message: parsed && parsed.message ? String(parsed.message) : "",
    });
  } catch {
    return withSource({
      id: msg.id,
      status: "error",
      result: null,
      message: "Invalid JSON from ExtendScript: " + inner,
    });
  }
}

export function installCommandRouting(onLog: (entry: LogEntry) => void): void {
  bridge.setCommandListener(async (msg) => {
    const out = await handleIncomingCommand(msg);
    bridge.sendResult(out);
    let summary = "";
    try {
      summary = out.status === "success" ? JSON.stringify(out.result).slice(0, 400) : String(out.message || "");
    } catch (e) {
      summary = String(e);
    }
    onLog({
      ts: Date.now(),
      action: msg.action || "",
      status: out.status,
      summary,
    });
  });
}
