/**
 * Routes WebSocket command payloads to ExtendScript in the active host app.
 */

import premiereScript from "./scripts/premiere.jsx";
import aeScript from "./scripts/aftereffects.jsx";
import * as bridge from "./bridge.js";

const PREMIERE_ACTIONS = new Set([
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

const AE_ACTIONS = new Set([
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

const uxp = require("uxp");
const hostName = uxp.host.name;

/** @type {"premiere" | "aftereffects"} */
export const appKey = hostName === "PP" ? "premiere" : "aftereffects";

/**
 * @returns {string}
 */
function displayAppName() {
  if (hostName === "PP") return "Premiere Pro";
  if (hostName === "AEFT") return "After Effects";
  return hostName || "Adobe";
}

export { displayAppName };

/**
 * @returns {(code: string) => Promise<string>}
 */
function getEvalScript() {
  if (hostName === "PP") {
    const mod = require("premierepro");
    return (code) => mod.evalScript(code);
  }
  if (hostName === "AEFT") {
    const mod = require("aftereffects");
    return (code) => mod.evalScript(code);
  }
  throw new Error("ARIA Bridge: unsupported host " + hostName);
}

const evalHostScript = getEvalScript();

/**
 * @param {object} body
 * @returns {object}
 */
function withSource(body) {
  return Object.assign({}, body, { sourceApp: appKey });
}

/**
 * @param {string} prelude ExtendScript library source
 * @param {string} action
 * @param {object} params
 * @returns {Promise<string>}
 */
async function runExtendScript(prelude, action, params) {
  const payload = JSON.stringify({ action: action, params: params || {} });
  const escapedPayload = JSON.stringify(payload);
  const code =
    prelude +
    '\n$._ariaBridge.routeFromPanel(' +
    escapedPayload +
    ");";
  const raw = await evalHostScript(code);
  return typeof raw === "string" ? raw : String(raw);
}

/**
 * Execute a server command if it targets this panel's app.
 * @param {{ id: string, app: string, action: string, params?: object }} msg
 * @returns {Promise<{ id: string, status: string, result: any, message: string, sourceApp: string }>}
 */
export async function handleIncomingCommand(msg) {
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
    const allowed =
      appKey === "premiere" ? PREMIERE_ACTIONS.has(action) : AE_ACTIONS.has(action);
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
  let inner;
  try {
    inner = await runExtendScript(prelude, msg.action, msg.params || {});
  } catch (e) {
    return withSource({
      id: msg.id,
      status: "error",
      result: null,
      message: e && e.message ? e.message : String(e),
    });
  }

  try {
    const parsed = JSON.parse(inner);
    if (parsed && parsed.status === "error") {
      return withSource({
        id: msg.id,
        status: "error",
        result: null,
        message: parsed.message || "ExtendScript error",
      });
    }
    return withSource({
      id: msg.id,
      status: "success",
      result: parsed && parsed.result !== undefined ? parsed.result : parsed,
      message: parsed && parsed.message ? String(parsed.message) : "",
    });
  } catch (e) {
    return withSource({
      id: msg.id,
      status: "error",
      result: null,
      message: "Invalid JSON from ExtendScript: " + inner,
    });
  }
}

/**
 * @param {(entry: { ts: number, action: string, status: string, summary: string }) => void} onLog
 */
export function installCommandRouting(onLog) {
  bridge.setCommandListener(async (msg) => {
    const out = await handleIncomingCommand(msg);
    bridge.sendResult(out);
    if (onLog) {
      let summary = "";
      try {
        summary =
          out.status === "success"
            ? JSON.stringify(out.result).slice(0, 400)
            : String(out.message || "");
      } catch (e) {
        summary = String(e);
      }
      onLog({
        ts: Date.now(),
        action: msg.action || "",
        status: out.status,
        summary,
      });
    }
  });
}
