// Figma plugin sandbox — reads variables, converts to DTCG JSON, hands off to UI for push

function rgbToHex({ r, g, b, a = 1 }) {
  const h = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return a < 1 ? `#${h(r)}${h(g)}${h(b)}${h(a)}` : `#${h(r)}${h(g)}${h(b)}`;
}

const DIM_SCOPES = new Set([
  'GAP', 'WIDTH_HEIGHT', 'CORNER_RADIUS', 'STROKE_FLOAT',
  'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING', 'LETTER_SPACING', 'FONT_SIZE', 'LINE_HEIGHT',
]);

function dtcgType(v) {
  if (v.resolvedType === 'COLOR')   return 'color';
  if (v.resolvedType === 'STRING')  return 'string';
  if (v.resolvedType === 'BOOLEAN') return 'boolean';
  if (v.resolvedType === 'FLOAT')
    return (v.scopes ?? []).some(s => DIM_SCOPES.has(s)) ? 'dimension' : 'number';
}

function dtcgValue(v, raw) {
  if (v.resolvedType === 'COLOR')   return rgbToHex(raw);
  if (v.resolvedType === 'STRING')  return String(raw);
  if (v.resolvedType === 'BOOLEAN') return Boolean(raw);
  if (v.resolvedType === 'FLOAT')   return dtcgType(v) === 'dimension' ? `${raw}px` : raw;
  return raw;
}

const slug = s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seg  = s => s.trim().replace(/\s+/g, '-');

function setPath(obj, parts, val) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] ??= {}; cur = cur[parts[i]]; }
  cur[parts.at(-1)] = val;
}

figma.showUI(__html__, { width: 440, height: 380 });

const varById = Object.fromEntries(figma.variables.getLocalVariables().map(v => [v.id, v]));
const files   = {};

for (const col of figma.variables.getLocalVariableCollections()) {
  if (col.hiddenFromPublishing) continue;
  const multiMode = col.modes.length > 1;

  for (const mode of col.modes) {
    const tokens = {};

    for (const varId of col.variableIds) {
      const v = varById[varId];
      if (!v || v.hiddenFromPublishing) continue;

      const raw = v.valuesByMode[mode.modeId];
      if (raw == null) continue;

      const parts = v.name.split('/').map(seg);
      let def;

      if (raw?.type === 'VARIABLE_ALIAS') {
        const ref = varById[raw.id];
        if (!ref) continue;
        def = { $type: dtcgType(v), $value: `{${ref.name.split('/').map(seg).join('.')}}` };
      } else {
        def = { $type: dtcgType(v), $value: dtcgValue(v, raw) };
      }

      if (v.description) def.$description = v.description;
      setPath(tokens, parts, def);
    }

    const filename = multiMode
      ? `${slug(col.name)}.${slug(mode.name)}.tokens.json`
      : `${slug(col.name)}.tokens.json`;

    files[filename] = JSON.stringify(tokens, null, 2) + '\n';
  }
}

figma.ui.postMessage({ type: 'tokens-ready', files });
