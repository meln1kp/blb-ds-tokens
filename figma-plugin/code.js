// Figma plugin sandbox — ES6 only (no ??, ?., ??=, .at(), Object.fromEntries)

function rgbToRgba(color) {
  var r = Math.round(color.r * 255);
  var g = Math.round(color.g * 255);
  var b = Math.round(color.b * 255);
  var a = (color.a !== undefined) ? color.a : 1;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Math.round(a * 100) / 100 + ')';
}

var DIM_SCOPES = new Set([
  'GAP', 'WIDTH_HEIGHT', 'CORNER_RADIUS', 'STROKE_FLOAT',
  'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING', 'LETTER_SPACING', 'FONT_SIZE', 'LINE_HEIGHT',
]);

function dtcgType(v) {
  if (v.resolvedType === 'COLOR')   return 'color';
  if (v.resolvedType === 'STRING')  return 'string';
  if (v.resolvedType === 'BOOLEAN') return 'boolean';
  if (v.resolvedType === 'FLOAT') {
    var scopes = v.scopes || [];
    return scopes.some(function(s) { return DIM_SCOPES.has(s); }) ? 'dimension' : 'number';
  }
}

function dtcgValue(v, raw) {
  if (v.resolvedType === 'COLOR')   return rgbToRgba(raw);
  if (v.resolvedType === 'STRING')  return String(raw);
  if (v.resolvedType === 'BOOLEAN') return Boolean(raw);
  if (v.resolvedType === 'FLOAT')   return dtcgType(v) === 'dimension' ? (raw + 'px') : raw;
  return raw;
}

function slug(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function seg(s) {
  return s.trim().replace(/\s+/g, '-');
}

function setPath(obj, parts, val) {
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

// Resolve a raw value, following VARIABLE_ALIAS chains.
// If the referenced variable is hidden from publishing, inline its actual value
// rather than emitting a broken DTCG reference.
function resolveRaw(varObj, raw, varById) {
  if (!raw || raw.type !== 'VARIABLE_ALIAS') {
    return { type: 'value', value: dtcgValue(varObj, raw) };
  }
  var ref = varById[raw.id];
  if (!ref) return null;
  if (ref.hiddenFromPublishing) {
    var modeIds = Object.keys(ref.valuesByMode);
    if (!modeIds.length) return null;
    var refRaw = ref.valuesByMode[modeIds[0]];
    return resolveRaw(ref, refRaw, varById);
  }
  return { type: 'ref', path: ref.name.split('/').map(seg).join('.') };
}

figma.showUI(__html__, { width: 440, height: 460 });

// Restore saved settings on startup so the UI fields are pre-filled
figma.clientStorage.getAsync('settings').then(function(saved) {
  if (saved) figma.ui.postMessage({ type: 'saved-settings', settings: saved });
});

// UI sends 'fetch' when the button is clicked — we respond with the token files
figma.ui.on('message', function(msg) {
  if (!msg || msg.type !== 'fetch') return;

  // Persist settings so they are restored on next open
  if (msg.settings) {
    figma.clientStorage.setAsync('settings', msg.settings);
  }

  try {
    var allVars = figma.variables.getLocalVariables();
    var varById = {};
    for (var vi = 0; vi < allVars.length; vi++) {
      varById[allVars[vi].id] = allVars[vi];
    }

    var files = {};

    var allCols = figma.variables.getLocalVariableCollections();
    for (var ci = 0; ci < allCols.length; ci++) {
      var col = allCols[ci];
      if (col.hiddenFromPublishing) continue;
      var multiMode = col.modes.length > 1;

      for (var mi = 0; mi < col.modes.length; mi++) {
        var mode = col.modes[mi];
        var tokens = {};

        for (var ii = 0; ii < col.variableIds.length; ii++) {
          var v = varById[col.variableIds[ii]];
          if (!v) continue;

          var raw = v.valuesByMode[mode.modeId];
          if (raw == null) continue;

          var parts = v.name.split('/').map(seg);
          var def;

          var result = resolveRaw(v, raw, varById);
          if (!result) continue;
          if (result.type === 'ref') {
            def = { $type: dtcgType(v), $value: '{' + result.path + '}' };
          } else {
            def = { $type: dtcgType(v), $value: result.value };
          }

          if (v.description) def.$description = v.description;
          setPath(tokens, parts, def);
        }

        var filename = multiMode
          ? slug(col.name) + '.' + slug(mode.name) + '.tokens.json'
          : slug(col.name) + '.tokens.json';

        files[filename] = JSON.stringify(tokens, null, 2) + '\n';
      }
    }

    figma.ui.postMessage({ type: 'tokens-ready', files: files });
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: String(err) });
  }
});
