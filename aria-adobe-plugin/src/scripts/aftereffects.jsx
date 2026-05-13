/**
 * ARIA Bridge — After Effects ExtendScript host.
 * All operations return JSON strings: { "status":"success","result":... } or { "status":"error","message":"..." }.
 */

if (typeof JSON === "undefined") {
  throw new Error("JSON is required for ARIA Bridge");
}

/**
 * @param {string} name
 * @returns {CompItem|null}
 */
function ariaFindComp(name) {
  var i;
  for (i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) return it;
  }
  return null;
}

/**
 * @param {CompItem} comp
 * @param {string} layerName
 * @returns {Layer|null}
 */
function ariaFindLayer(comp, layerName) {
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    var ly = comp.layer(i);
    if (ly && ly.name === layerName) return ly;
  }
  return null;
}

/**
 * @param {Layer} layer
 * @param {string} propertyPath e.g. "transform.position" or "Effects.Min Blur.Blurriness"
 * @returns {Property|null}
 */
function ariaResolveProperty(layer, propertyPath) {
  var parts = propertyPath.split(".");
  var obj = layer;
  var p;
  for (p = 0; p < parts.length; p++) {
    if (!obj || !obj.property) return null;
    obj = obj.property(parts[p]);
    if (!obj) return null;
  }
  return obj;
}

/**
 * @param {string} name
 * @param {number} width
 * @param {number} height
 * @param {number} frameRate
 * @param {number} duration seconds
 * @returns {string} JSON
 */
function createComp(name, width, height, frameRate, duration) {
  try {
    var comp = app.project.items.addComp(name, width, height, 1, duration, frameRate);
    return JSON.stringify({ status: "success", result: { name: comp.name, id: comp.id } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @returns {string} JSON
 */
function getCompInfo(compName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layers = [];
    var i;
    for (i = 1; i <= comp.numLayers; i++) {
      var ly = comp.layer(i);
      layers.push({
        index: i,
        name: ly.name,
        kind: ly instanceof TextLayer ? "text" : ly instanceof ShapeLayer ? "shape" : ly instanceof AVLayer ? "av" : "other",
        width: ly.width,
        height: ly.height,
        startTime: ly.startTime,
        inPoint: ly.inPoint,
        outPoint: ly.outPoint,
      });
    }
    var out = {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate,
      pixelAspect: comp.pixelAspect,
      layers: layers,
    };
    return JSON.stringify({ status: "success", result: out });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {string} JSON
 */
function setCompBackground(compName, r, g, b) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    comp.bgColor = [r / 255, g / 255, b / 255];
    return JSON.stringify({ status: "success", result: { bg: [r, g, b] } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} newName
 * @returns {string} JSON
 */
function duplicateComp(compName, newName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var dup = comp.duplicate();
    dup.name = newName;
    return JSON.stringify({ status: "success", result: { name: dup.name, id: dup.id } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} name
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} width
 * @param {number} height
 * @param {number} duration seconds
 * @returns {string} JSON
 */
function addSolidLayer(compName, name, r, g, b, width, height, duration) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var solid = comp.layers.addSolid([r / 255, g / 255, b / 255], name, width, height, comp.pixelAspect, duration);
    return JSON.stringify({ status: "success", result: { layerName: solid.name } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} text
 * @param {number} fontSize
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} x
 * @param {number} y
 * @returns {string} JSON
 */
function addTextLayer(compName, text, fontSize, r, g, b, x, y) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = comp.layers.addText(text);
    var doc = layer.property("Source Text").value;
    doc.fontSize = fontSize;
    doc.fillColor = [r / 255, g / 255, b / 255];
    layer.property("Source Text").setValue(doc);
    layer.property("Transform").property("Position").setValue([x, y]);
    return JSON.stringify({ status: "success", result: { layerName: layer.name } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} shapeType "rectangle" | "ellipse"
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {string} JSON
 */
function addShapeLayer(compName, shapeType, x, y, width, height, r, g, b) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = comp.layers.addShape();
    var contents = layer.property("Contents");
    if (!contents) contents = layer.property("ADBE Root Vectors Group");
    var group = contents.addProperty("ADBE Vector Group");
    var groupContents = group.property("Contents");
    var shape;
    if (String(shapeType).toLowerCase() === "ellipse") {
      shape = groupContents.addProperty("ADBE Vector Shape - Ellipse");
      shape.property("ADBE Vector Ellipse Size").setValue([width, height]);
    } else {
      shape = groupContents.addProperty("ADBE Vector Shape - Rect");
      shape.property("ADBE Vector Rect Size").setValue([width, height]);
    }
    group.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([x, y]);
    var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue([r / 255, g / 255, b / 255, 1]);
    return JSON.stringify({ status: "success", result: { layerName: layer.name, shapeType: shapeType } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} filePath
 * @returns {string} JSON
 */
function addFootageLayer(compName, filePath) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var io = new ImportOptions(File(filePath));
    if (!io.canImportAs(ImportAsType.FOOTAGE)) {
      return JSON.stringify({ status: "error", message: "Cannot import file as footage" });
    }
    io.importAs = ImportAsType.FOOTAGE;
    var footage = app.project.importFile(io);
    var layer = comp.layers.add(footage);
    return JSON.stringify({ status: "success", result: { layerName: layer.name } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @returns {string} JSON
 */
function deleteLayer(compName, layerName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    layer.remove();
    return JSON.stringify({ status: "success", result: { deleted: layerName } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} newName
 * @returns {string} JSON
 */
function duplicateLayer(compName, layerName, newName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var dup = layer.duplicate();
    dup.name = newName;
    return JSON.stringify({ status: "success", result: { layerName: dup.name } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {number} x
 * @param {number} y
 * @returns {string} JSON
 */
function setLayerPosition(compName, layerName, x, y) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    layer.property("Transform").property("Position").setValue([x, y]);
    return JSON.stringify({ status: "success", result: { position: [x, y] } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {number} opacity 0-100
 * @returns {string} JSON
 */
function setLayerOpacity(compName, layerName, opacity) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    layer.property("Transform").property("Opacity").setValue(opacity);
    return JSON.stringify({ status: "success", result: { opacity: opacity } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {number} scaleX
 * @param {number} scaleY
 * @returns {string} JSON
 */
function setLayerScale(compName, layerName, scaleX, scaleY) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    layer.property("Transform").property("Scale").setValue([scaleX, scaleY]);
    return JSON.stringify({ status: "success", result: { scale: [scaleX, scaleY] } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} property path like "transform.opacity" (case per AE English UI)
 * @param {number} timeInSeconds
 * @param {*} value
 * @returns {string} JSON
 */
function addKeyframe(compName, layerName, property, timeInSeconds, value) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var prop = ariaResolveProperty(layer, property);
    if (!prop || !prop.canSet) return JSON.stringify({ status: "error", message: "Property not found or not settable" });
    prop.setValueAtTime(timeInSeconds, value);
    return JSON.stringify({ status: "success", result: { keyframe: true, time: timeInSeconds } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} property path
 * @param {number} keyframeIndex 1-based keyframe index
 * @param {string} easingType "linear" | "easeIn" | "easeOut" | "ease"
 * @returns {string} JSON
 */
function setKeyframeEasing(compName, layerName, property, keyframeIndex, easingType) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var prop = ariaResolveProperty(layer, property);
    if (!prop || prop.numKeys < keyframeIndex) return JSON.stringify({ status: "error", message: "Keyframe not found" });
    var t = String(easingType).toLowerCase();
    var inEase;
    var outEase;
    if (t === "easein") {
      inEase = new KeyframeEase(80, 80);
      outEase = new KeyframeEase(0, 0);
    } else if (t === "easeout") {
      inEase = new KeyframeEase(0, 0);
      outEase = new KeyframeEase(80, 80);
    } else if (t === "ease") {
      inEase = new KeyframeEase(60, 60);
      outEase = new KeyframeEase(60, 60);
    } else {
      inEase = new KeyframeEase(0, 0);
      outEase = new KeyframeEase(0, 0);
    }
    prop.setInterpolationTypeAtKey(keyframeIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    prop.setTemporalEaseAtKey(keyframeIndex, [inEase], [outEase]);
    return JSON.stringify({ status: "success", result: { easing: easingType } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} effectMatchName
 * @returns {string} JSON
 */
function applyEffect(compName, layerName, effectMatchName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var eff = layer.effect.addProperty(effectMatchName);
    return JSON.stringify({ status: "success", result: { effectName: eff ? eff.name : effectMatchName } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} effectName display or match name
 * @param {string} propertyName
 * @param {*} value
 * @returns {string} JSON
 */
function setEffectProperty(compName, layerName, effectName, propertyName, value) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var fx = layer.effect;
    var i;
    for (i = 1; i <= fx.numProperties; i++) {
      var e = fx.property(i);
      if (e && (e.name === effectName || e.matchName === effectName)) {
        var j;
        for (j = 1; j <= e.numProperties; j++) {
          var cand = e.property(j);
          if (cand && (cand.name === propertyName || cand.matchName === propertyName)) {
            cand.setValue(value);
            return JSON.stringify({ status: "success", result: { set: propertyName } });
          }
        }
        return JSON.stringify({ status: "error", message: "Effect property not found" });
      }
    }
    return JSON.stringify({ status: "error", message: "Effect not found" });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} effectName
 * @returns {string} JSON
 */
function removeEffect(compName, layerName, effectName) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var fx = layer.effect;
    var i;
    for (i = fx.numProperties; i >= 1; i--) {
      var e = fx.property(i);
      if (e && (e.name === effectName || e.matchName === effectName)) {
        e.remove();
        return JSON.stringify({ status: "success", result: { removed: effectName } });
      }
    }
    return JSON.stringify({ status: "error", message: "Effect not found" });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} property path
 * @param {string} expressionString
 * @returns {string} JSON
 */
function setExpression(compName, layerName, property, expressionString) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var prop = ariaResolveProperty(layer, property);
    if (!prop) return JSON.stringify({ status: "error", message: "Property not found" });
    prop.expression = expressionString;
    return JSON.stringify({ status: "success", result: { expression: true } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} layerName
 * @param {string} property path
 * @returns {string} JSON
 */
function removeExpression(compName, layerName, property) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var layer = ariaFindLayer(comp, layerName);
    if (!layer) return JSON.stringify({ status: "error", message: "Layer not found" });
    var prop = ariaResolveProperty(layer, property);
    if (!prop) return JSON.stringify({ status: "error", message: "Property not found" });
    prop.expression = "";
    return JSON.stringify({ status: "success", result: { expressionRemoved: true } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} outputPath
 * @param {string} outputModule template name (e.g. "Lossless")
 * @returns {string} JSON
 */
function renderComp(compName, outputPath, outputModule) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var rqItem = app.project.renderQueue.items.add(comp);
    rqItem.outputModule(1).file = new File(outputPath);
    if (outputModule) {
      try {
        rqItem.outputModule(1).applyTemplate(outputModule);
      } catch (e1) {}
    }
    app.project.renderQueue.render();
    return JSON.stringify({ status: "success", result: { rendering: true, outputPath: outputPath } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} compName
 * @param {string} outputPath
 * @returns {string} JSON
 */
function addToRenderQueue(compName, outputPath) {
  try {
    var comp = ariaFindComp(compName);
    if (!comp) return JSON.stringify({ status: "error", message: "Comp not found" });
    var rqItem = app.project.renderQueue.items.add(comp);
    rqItem.outputModule(1).file = new File(outputPath);
    return JSON.stringify({ status: "success", result: { queueIndex: rqItem.index } });
  } catch (e) {
    return JSON.stringify({ status: "error", message: String(e) });
  }
}

/**
 * @param {string} action
 * @param {object} params
 * @returns {string} JSON string
 */
function ariaRouteAction(action, params) {
  var p = params || {};
  try {
    if (action === "createComp")
      return createComp(p.name, p.width, p.height, p.frameRate, p.duration);
    if (action === "getCompInfo") return getCompInfo(p.compName);
    if (action === "setCompBackground")
      return setCompBackground(p.compName, p.r, p.g, p.b);
    if (action === "duplicateComp") return duplicateComp(p.compName, p.newName);
    if (action === "addSolidLayer")
      return addSolidLayer(p.compName, p.name, p.r, p.g, p.b, p.width, p.height, p.duration);
    if (action === "addTextLayer")
      return addTextLayer(p.compName, p.text, p.fontSize, p.r, p.g, p.b, p.x, p.y);
    if (action === "addShapeLayer")
      return addShapeLayer(p.compName, p.shapeType, p.x, p.y, p.width, p.height, p.r, p.g, p.b);
    if (action === "addFootageLayer") return addFootageLayer(p.compName, p.filePath);
    if (action === "deleteLayer") return deleteLayer(p.compName, p.layerName);
    if (action === "duplicateLayer") return duplicateLayer(p.compName, p.layerName, p.newName);
    if (action === "setLayerPosition")
      return setLayerPosition(p.compName, p.layerName, p.x, p.y);
    if (action === "setLayerOpacity")
      return setLayerOpacity(p.compName, p.layerName, p.opacity);
    if (action === "setLayerScale")
      return setLayerScale(p.compName, p.layerName, p.scaleX, p.scaleY);
    if (action === "addKeyframe")
      return addKeyframe(p.compName, p.layerName, p.property, p.timeInSeconds, p.value);
    if (action === "setKeyframeEasing")
      return setKeyframeEasing(p.compName, p.layerName, p.property, p.keyframeIndex, p.easingType);
    if (action === "applyEffect")
      return applyEffect(p.compName, p.layerName, p.effectMatchName);
    if (action === "setEffectProperty")
      return setEffectProperty(p.compName, p.layerName, p.effectName, p.propertyName, p.value);
    if (action === "removeEffect") return removeEffect(p.compName, p.layerName, p.effectName);
    if (action === "setExpression")
      return setExpression(p.compName, p.layerName, p.property, p.expressionString);
    if (action === "removeExpression")
      return removeExpression(p.compName, p.layerName, p.property);
    if (action === "renderComp")
      return renderComp(p.compName, p.outputPath, p.outputModule);
    if (action === "addToRenderQueue") return addToRenderQueue(p.compName, p.outputPath);
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
