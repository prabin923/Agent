/**
 * ARIA Bridge — Premiere Pro ExtendScript host.
 * All exported operations return JSON strings: { "status":"success","result":... } or { "status":"error","message":"..." }.
 */

if (typeof JSON === "undefined") {
  throw new Error("JSON is required for ARIA Bridge");
}

/**
 * @param {Sequence} seq
 * @returns {number}
 */
function ariaTicksPerSecond(seq) {
  try {
    if (seq && seq.timebase) return seq.timebase;
  } catch (e0) {}
  return 254016000000;
}

/**
 * @param {Sequence} seq
 * @param {number} seconds
 * @returns {Time}
 */
function ariaTimeFromSeconds(seq, seconds) {
  var t = new Time();
  t.ticks = Math.round(seconds * ariaTicksPerSecond(seq));
  return t;
}

/**
 * @param {Sequence} seq
 * @param {Time} t
 * @returns {number}
 */
function ariaSecondsFromTime(seq, t) {
  if (!t) return 0;
  return t.ticks / ariaTicksPerSecond(seq);
}

/**
 * @param {string} name sequence name
 * @returns {Sequence|null}
 */
function ariaFindSequence(name) {
  var i;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    var s = app.project.sequences[i];
    if (s && s.name === name) return s;
  }
  return null;
}

/**
 * @param {Sequence} seq
 * @param {number} trackIndex 0-based video track
 * @param {number} clipIndex 0-based clip index on track
 * @returns {TrackItem|null}
 */
function ariaGetVideoClip(seq, trackIndex, clipIndex) {
  if (!seq || trackIndex < 0 || clipIndex < 0) return null;
  var tr = seq.videoTracks[trackIndex];
  if (!tr) return null;
  var c = tr.clips[clipIndex];
  return c || null;
}

/**
 * @param {Sequence} seq
 * @param {number} trackIndex 0-based audio track
 * @param {number} clipIndex 0-based clip index on track
 * @returns {TrackItem|null}
 */
function ariaGetAudioClip(seq, trackIndex, clipIndex) {
  if (!seq || trackIndex < 0 || clipIndex < 0) return null;
  var tr = seq.audioTracks[trackIndex];
  if (!tr) return null;
  var c = tr.clips[clipIndex];
  return c || null;
}

/**
 * @param {string} sequenceName
 * @param {number} trackIndex 0-based video track index
 * @param {number} timeInSeconds
 * @returns {string} JSON
 */
function cutClipAtTime(sequenceName, trackIndex, timeInSeconds) {
  try {
    app.enableQE();
    if (!qe || !qe.project) return JSON.stringify({ status: "error", message: "QE not available" });
    qe.project.init();
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var qseq = qe.project.getSequenceByName(sequenceName);
    if (!qseq) return JSON.stringify({ status: "error", message: "QE sequence not found" });
    var tc = qseq.adoTimecodeFromSeconds(timeInSeconds);
    var tr = qseq.getVideoTrackAt(trackIndex);
    if (!tr) return JSON.stringify({ status: "error", message: "Video track not found" });
    tr.razor(tc);
    return JSON.stringify({ status: "success", result: { cut: true, timeInSeconds: timeInSeconds } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {number} newInPoint seconds
 * @param {number} newOutPoint seconds
 * @returns {string} JSON
 */
function trimClip(sequenceName, clipIndex, trackIndex, newInPoint, newOutPoint) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    clip.inPoint = ariaTimeFromSeconds(seq, newInPoint);
    clip.outPoint = ariaTimeFromSeconds(seq, newOutPoint);
    return JSON.stringify({ status: "success", result: { trimmed: true } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {number} newStartTime seconds on timeline
 * @returns {string} JSON
 */
function moveClip(sequenceName, clipIndex, trackIndex, newStartTime) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    clip.start = ariaTimeFromSeconds(seq, newStartTime);
    return JSON.stringify({ status: "success", result: { moved: true } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @returns {string} JSON
 */
function deleteClip(sequenceName, clipIndex, trackIndex) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    clip.remove(false, false);
    return JSON.stringify({ status: "success", result: { deleted: true } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} timeInSeconds
 * @returns {string} JSON
 */
function splitAllTracksAtTime(sequenceName, timeInSeconds) {
  try {
    app.enableQE();
    if (!qe || !qe.project) return JSON.stringify({ status: "error", message: "QE not available" });
    qe.project.init();
    var qseq = qe.project.getSequenceByName(sequenceName);
    if (!qseq) return JSON.stringify({ status: "error", message: "QE sequence not found" });
    var tc = qseq.adoTimecodeFromSeconds(timeInSeconds);
    var vi;
    for (vi = 0; vi < qseq.numVideoTracks; vi++) {
      var vtr = qseq.getVideoTrackAt(vi);
      if (vtr) vtr.razor(tc);
    }
    var ai;
    for (ai = 0; ai < qseq.numAudioTracks; ai++) {
      var atr = qseq.getAudioTrackAt(ai);
      if (atr) atr.razor(tc);
    }
    return JSON.stringify({ status: "success", result: { split: true, timeInSeconds: timeInSeconds } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {string} effectName match name or display name hint
 * @returns {string} JSON
 */
function applyEffectToClip(sequenceName, clipIndex, trackIndex, effectName) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    var comps = clip.getComponents();
    if (!comps) return JSON.stringify({ status: "error", message: "No components" });
    var m = 0;
    for (m = 0; m < comps.numItems; m++) {
      var c = comps[m];
      if (c && c.matchName === effectName) {
        return JSON.stringify({ status: "success", result: { alreadyPresent: true } });
      }
    }
    comps.addByMatchName(effectName);
    return JSON.stringify({ status: "success", result: { applied: effectName } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {string} effectName
 * @returns {string} JSON
 */
function removeEffectFromClip(sequenceName, clipIndex, trackIndex, effectName) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    var comps = clip.getComponents();
    var i;
    for (i = comps.numItems - 1; i >= 0; i--) {
      var c = comps[i];
      if (c && (c.matchName === effectName || c.displayName === effectName)) {
        c.remove();
        return JSON.stringify({ status: "success", result: { removed: effectName } });
      }
    }
    return JSON.stringify({ status: "error", message: "Effect not found on clip" });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {string} effectName
 * @param {string} paramName
 * @param {*} value
 * @returns {string} JSON
 */
function setEffectParam(sequenceName, clipIndex, trackIndex, effectName, paramName, value) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetVideoClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Clip not found" });
    var comps = clip.getComponents();
    var i;
    for (i = 0; i < comps.numItems; i++) {
      var c = comps[i];
      if (c && (c.matchName === effectName || c.displayName === effectName)) {
        var props = c.properties;
        var p;
        for (p = 0; p < props.numItems; p++) {
          var pr = props[p];
          if (pr && (pr.name === paramName || pr.displayName === paramName)) {
            pr.setValue(value, true);
            return JSON.stringify({ status: "success", result: { set: paramName } });
          }
        }
        return JSON.stringify({ status: "error", message: "Param not found" });
      }
    }
    return JSON.stringify({ status: "error", message: "Effect not found" });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based
 * @param {number} trackIndex 0-based video track
 * @param {string} transitionName
 * @param {number} duration seconds
 * @returns {string} JSON
 */
function addTransition(sequenceName, clipIndex, trackIndex, transitionName, duration) {
  try {
    app.enableQE();
    if (!qe || !qe.project) return JSON.stringify({ status: "error", message: "QE not available" });
    qe.project.init();
    var qseq = qe.project.getSequenceByName(sequenceName);
    if (!qseq) return JSON.stringify({ status: "error", message: "QE sequence not found" });
    var tr = qseq.getVideoTrackAt(trackIndex);
    if (!tr) return JSON.stringify({ status: "error", message: "Track not found" });
    var qclip = tr.getItemAt(clipIndex);
    if (!qclip) return JSON.stringify({ status: "error", message: "QE clip not found" });
    var trans = qclip.addTransition(transitionName, qseq.adoTimecodeFromSeconds(duration), 0);
    return JSON.stringify({ status: "success", result: { transition: transitionName, handle: String(trans) } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} width ignored if presetPath resolves sizing; kept for API parity
 * @param {number} height ignored if presetPath resolves sizing; kept for API parity
 * @param {number} frameRate ignored if presetPath resolves framerate; kept for API parity
 * @param {string} [presetPath] optional .sqpreset path; empty uses host default (may vary)
 * @returns {string} JSON
 */
function createSequence(sequenceName, width, height, frameRate, presetPath) {
  try {
    var path = presetPath ? String(presetPath) : "";
    var id = app.project.createNewSequence(sequenceName, path);
    if (!id) return JSON.stringify({ status: "error", message: "createNewSequence failed (preset path may be required)" });
    return JSON.stringify({
      status: "success",
      result: { sequenceName: sequenceName, id: id, width: width, height: height, frameRate: frameRate },
    });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @returns {string} JSON describing clips and tracks
 */
function getSequenceInfo(sequenceName) {
  try {
    var name = sequenceName;
    if (!name && app.project.activeSequence) name = app.project.activeSequence.name;
    if (!name) return JSON.stringify({ status: "error", message: "No sequence name and no active sequence" });
    var seq = ariaFindSequence(name);
    var out = {};
    out.name = seq.name;
    out.durationSeconds = ariaSecondsFromTime(seq, seq.end);
    out.videoTracks = [];
    out.audioTracks = [];
    var vt;
    for (vt = 0; vt < seq.videoTracks.numTracks; vt++) {
      var vtr = seq.videoTracks[vt];
      var vclips = [];
      var ci;
      for (ci = 0; ci < vtr.clips.numItems; ci++) {
        var cl = vtr.clips[ci];
        vclips.push({
          index: ci,
          name: cl ? cl.name : "",
          startSeconds: cl ? ariaSecondsFromTime(seq, cl.start) : 0,
          endSeconds: cl ? ariaSecondsFromTime(seq, cl.end) : 0,
          inSeconds: cl ? ariaSecondsFromTime(seq, cl.inPoint) : 0,
          outSeconds: cl ? ariaSecondsFromTime(seq, cl.outPoint) : 0,
        });
      }
      out.videoTracks.push({ index: vt, clips: vclips });
    }
    var at;
    for (at = 0; at < seq.audioTracks.numTracks; at++) {
      var atr = seq.audioTracks[at];
      var aclips = [];
      var ac;
      for (ac = 0; ac < atr.clips.numItems; ac++) {
        var acl = atr.clips[ac];
        aclips.push({
          index: ac,
          name: acl ? acl.name : "",
          startSeconds: acl ? ariaSecondsFromTime(seq, acl.start) : 0,
          endSeconds: acl ? ariaSecondsFromTime(seq, acl.end) : 0,
        });
      }
      out.audioTracks.push({ index: at, clips: aclips });
    }
    return JSON.stringify({ status: "success", result: out });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} timeInSeconds
 * @param {string} label
 * @param {string} comment
 * @returns {string} JSON
 */
function addMarker(sequenceName, timeInSeconds, label, comment) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var m = seq.markers.createMarker(ariaTimeFromSeconds(seq, timeInSeconds));
    m.name = label || "ARIA";
    m.comments = comment || "";
    return JSON.stringify({ status: "success", result: { marker: label } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} inPoint seconds
 * @param {number} outPoint seconds
 * @returns {string} JSON
 */
function setInOutPoints(sequenceName, inPoint, outPoint) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    seq.setInPoint(ariaTimeFromSeconds(seq, inPoint));
    seq.setOutPoint(ariaTimeFromSeconds(seq, outPoint));
    return JSON.stringify({ status: "success", result: { inPoint: inPoint, outPoint: outPoint } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @returns {string} JSON number seconds
 */
function getPlayheadPosition(sequenceName) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var t = seq.getPlayerPosition();
    return JSON.stringify({ status: "success", result: ariaSecondsFromTime(seq, t) });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} clipIndex 0-based on audio track
 * @param {number} trackIndex 0-based audio track
 * @param {number} volumeDB
 * @returns {string} JSON
 */
function setClipVolume(sequenceName, clipIndex, trackIndex, volumeDB) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var clip = ariaGetAudioClip(seq, trackIndex, clipIndex);
    if (!clip) return JSON.stringify({ status: "error", message: "Audio clip not found" });
    var comps = clip.getComponents();
    var i;
    for (i = 0; i < comps.numItems; i++) {
      var c = comps[i];
      if (c && c.matchName === "PE.AudioGainEffect") {
        var props = c.properties;
        var p;
        for (p = 0; p < props.numItems; p++) {
          var pr = props[p];
          if (pr && pr.name === "Gain") {
            pr.setValue(volumeDB, true);
            return JSON.stringify({ status: "success", result: { volumeDB: volumeDB } });
          }
        }
      }
    }
    return JSON.stringify({ status: "error", message: "Gain effect not found on clip" });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {number} trackIndex 0-based audio track
 * @param {boolean} muted
 * @returns {string} JSON
 */
function muteTrack(sequenceName, trackIndex, muted) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var tr = seq.audioTracks[trackIndex];
    if (!tr) return JSON.stringify({ status: "error", message: "Audio track not found" });
    tr.setMute(!!muted);
    return JSON.stringify({ status: "success", result: { muted: !!muted } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} sequenceName
 * @param {string} outputPath
 * @param {string} presetName path to .epr preset or preset display name
 * @returns {string} JSON
 */
function exportSequence(sequenceName, outputPath, presetName) {
  try {
    var seq = ariaFindSequence(sequenceName);
    if (!seq) return JSON.stringify({ status: "error", message: "Sequence not found" });
    var presetPath = presetName;
    var workArea = 1;
    seq.exportAsMediaDirect(outputPath, presetPath, workArea);
    return JSON.stringify({ status: "success", result: { outputPath: outputPath } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} action command name from router
 * @param {object} params keyed parameters
 * @returns {string} JSON string
 */
function ariaRouteAction(action, params) {
  var p = params || {};
  try {
    if (action === "cutClipAtTime")
      return cutClipAtTime(p.sequenceName, p.trackIndex, p.timeInSeconds);
    if (action === "trimClip")
      return trimClip(p.sequenceName, p.clipIndex, p.trackIndex, p.newInPoint, p.newOutPoint);
    if (action === "moveClip")
      return moveClip(p.sequenceName, p.clipIndex, p.trackIndex, p.newStartTime);
    if (action === "deleteClip")
      return deleteClip(p.sequenceName, p.clipIndex, p.trackIndex);
    if (action === "splitAllTracksAtTime")
      return splitAllTracksAtTime(p.sequenceName, p.timeInSeconds);
    if (action === "applyEffectToClip")
      return applyEffectToClip(p.sequenceName, p.clipIndex, p.trackIndex, p.effectName);
    if (action === "removeEffectFromClip")
      return removeEffectFromClip(p.sequenceName, p.clipIndex, p.trackIndex, p.effectName);
    if (action === "setEffectParam")
      return setEffectParam(
        p.sequenceName,
        p.clipIndex,
        p.trackIndex,
        p.effectName,
        p.paramName,
        p.value
      );
    if (action === "addTransition")
      return addTransition(p.sequenceName, p.clipIndex, p.trackIndex, p.transitionName, p.duration);
    if (action === "createSequence")
      return createSequence(p.sequenceName, p.width, p.height, p.frameRate, p.presetPath);
    if (action === "getSequenceInfo") return getSequenceInfo(p.sequenceName);
    if (action === "addMarker")
      return addMarker(p.sequenceName, p.timeInSeconds, p.label, p.comment);
    if (action === "setInOutPoints")
      return setInOutPoints(p.sequenceName, p.inPoint, p.outPoint);
    if (action === "getPlayheadPosition") return getPlayheadPosition(p.sequenceName);
    if (action === "setClipVolume")
      return setClipVolume(p.sequenceName, p.clipIndex, p.trackIndex, p.volumeDB);
    if (action === "muteTrack") return muteTrack(p.sequenceName, p.trackIndex, p.muted);
    if (action === "exportSequence")
      return exportSequence(p.sequenceName, p.outputPath, p.presetName);
    return JSON.stringify({ status: "error", message: "Unknown action: " + action });
  } catch (e2) {
    return JSON.stringify({ status: "error", message: String(e2) });
  }
}

$._ariaBridge = {
  /**
   * @param {string} payloadStr JSON string { action, params }
   * @returns {string}
   */
  routeFromPanel: function (payloadStr) {
    try {
      var payload = JSON.parse(payloadStr);
      return ariaRouteAction(payload.action, payload.params);
    } catch (e) {
      return JSON.stringify({ status: "error", message: String(e) });
    }
  },
};
