#!/usr/bin/env node
/**
 * Calls GET /v1/files/:key/variables/local, converts Figma's variable graph
 * to DTCG-format JSON, and writes one .tokens.json file per collection/mode.
 *
 * Required env vars:
 *   FIGMA_TOKEN    – personal access token (scope: file_variables:read)
 *   FIGMA_FILE_KEY – the key from the Figma file URL
 */

import { mkdirSync, writeFileSync } from 'fs';

const { FIGMA_TOKEN, FIGMA_FILE_KEY } = process.env;

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('Missing required env vars: FIGMA_TOKEN, FIGMA_FILE_KEY');
  process.exit(1);
}

// Figma RGBA (0-1 floats) → CSS hex
function rgbToHex({ r, g, b, a = 1 }) {
  const ch = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  const base = `#${ch(r)}${ch(g)}${ch(b)}`;
  return a < 1 ? `${base}${ch(a)}` : base;
}

// Figma FLOAT scopes that map to CSS dimensions (keep px, not unitless)
const DIM_SCOPES = new Set([
  'GAP', 'WIDTH_HEIGHT', 'CORNER_RADIUS', 'STROKE_FLOAT',
  'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING', 'LETTER_SPACING',
  'FONT_SIZE', 'LINE_HEIGHT',
]);

function dtcgType(variable) {
  switch (variable.resolvedType) {
    case 'COLOR':   return 'color';
    case 'STRING':  return 'string';
    case 'BOOLEAN': return 'boolean';
    case 'FLOAT':
      return (variable.scopes ?? []).some(s => DIM_SCOPES.has(s))
        ? 'dimension' : 'number';
    default: return undefined;
  }
}

function dtcgValue(variable, raw) {
  switch (variable.resolvedType) {
    case 'COLOR':   return rgbToHex(raw);
    case 'STRING':  return String(raw);
    case 'BOOLEAN': return Boolean(raw);
    case 'FLOAT':
      return dtcgType(variable) === 'dimension' ? `${raw}px` : raw;
    default: return raw;
  }
}

// "Foo Bar/baz" → "Foo-Bar.baz" (safe DTCG path segment)
function segmentify(str) {
  return str.trim().replace(/\s+/g, '-');
}

// collection name → safe filename slug
function slug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// write value at nested path, creating intermediate objects as needed
function setPath(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur)) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)] = value;
}

async function main() {
  console.log(`Fetching variables for file ${FIGMA_FILE_KEY} …`);

  const res = await fetch(
    `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables/local`,
    { headers: { 'X-Figma-Token': FIGMA_TOKEN } },
  );

  if (!res.ok) {
    console.error(`Figma API ${res.status}:`, await res.text());
    process.exit(1);
  }

  const { meta } = await res.json();
  const { variables, variableCollections } = meta;

  const varById = /** @type {Record<string,any>} */ (variables);
  const totalVars = Object.keys(variables).length;
  const totalCols = Object.keys(variableCollections).length;
  console.log(`  ${totalVars} variables across ${totalCols} collections`);

  mkdirSync('tokens', { recursive: true });

  for (const col of Object.values(variableCollections)) {
    if (col.hiddenFromPublishing) continue;

    const colSlug = slug(col.name);
    const multiMode = col.modes.length > 1;

    for (const mode of col.modes) {
      const tokens = {};

      for (const varId of col.variableIds) {
        const variable = variables[varId];
        if (!variable || variable.hiddenFromPublishing) continue;

        const raw = variable.valuesByMode[mode.modeId];
        if (raw === undefined || raw === null) continue;

        const nameParts = variable.name.split('/').map(segmentify);
        let tokenDef;

        if (raw?.type === 'VARIABLE_ALIAS') {
          const ref = varById[raw.id];
          if (!ref) continue;
          const refPath = ref.name.split('/').map(segmentify).join('.');
          tokenDef = { $type: dtcgType(variable), $value: `{${refPath}}` };
        } else {
          tokenDef = { $type: dtcgType(variable), $value: dtcgValue(variable, raw) };
        }

        if (variable.description) tokenDef.$description = variable.description;
        setPath(tokens, nameParts, tokenDef);
      }

      const modeSlug = slug(mode.name);
      const filename = multiMode
        ? `tokens/${colSlug}.${modeSlug}.tokens.json`
        : `tokens/${colSlug}.tokens.json`;

      writeFileSync(filename, JSON.stringify(tokens, null, 2) + '\n');
      console.log(`  wrote ${filename}`);
    }
  }

  console.log('Fetch complete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
