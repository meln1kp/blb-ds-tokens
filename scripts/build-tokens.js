#!/usr/bin/env node
/**
 * Builds CSS custom-property files from the DTCG token JSON using Style Dictionary v4.
 *
 * Reads:  tokens/**\/*.tokens.json   (pushed by the Figma plugin)
 * Writes:
 *   dist/tokens.css       – all light/default tokens in :root
 *   dist/tokens.dark.css  – dark semantic overrides in [data-theme="dark"]
 *   dist/tokens.all.css   – both concatenated (single CDN import)
 */

import StyleDictionary from 'style-dictionary';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

mkdirSync('dist', { recursive: true });

const allFiles = globSync('tokens/**/*.tokens.json');
if (allFiles.length === 0) {
  console.error('No token files found in tokens/ — sync from Figma first.');
  process.exit(1);
}

const darkFiles = allFiles.filter(f => f.includes('.dark.'));

// For multi-mode non-dark collections (e.g. responsive.normal/fullscreen/mobile),
// keep only the first encountered mode to prevent token-path collisions.
const seenBases = new Set();
const lightFiles = allFiles
  .filter(f => !f.includes('.dark.'))
  .filter(f => {
    const stem = path.basename(f).replace(/\.tokens\.json$/, '');
    const dot = stem.indexOf('.');
    if (dot === -1) return true;
    const base = stem.slice(0, dot);
    if (seenBases.has(base)) return false;
    seenBases.add(base);
    return true;
  });
console.log(`Building from ${lightFiles.length} light + ${darkFiles.length} dark token files…`);

// Abbreviation map — sorted longest-first to avoid partial-match conflicts
const ABBREV_MAP = [
  ['letter-spacing', 'ls'],
  ['line-height',    'lh'],
  ['font-family',    'ff'],
  ['font-weight',    'fw'],
  ['interactive',    'int'],
  ['font-style',     'fst'],
  ['typography',     'ty'],
  ['component',      'cmp'],
  ['font-size',      'fs'],
  ['feedback',       'fb'],
  ['viewport',       'vp'],
  ['surface',        'surf'],
  ['opacity',        'op'],
  ['layout',         'lay'],
  ['border',         'bdr'],
  ['color',          'clr'],
  ['space',          'sp'],
];

function applyAbbrev(name) {
  for (const [from, to] of ABBREV_MAP) {
    name = name.replace(
      new RegExp('(^|-)' + from + '(-|$)', 'g'),
      (_, pre, suf) => pre + to + suf,
    );
  }
  return name;
}

// rgba(r, g, b, 1) → #rrggbb  (opaque colors only; semi-transparent kept as rgba)
function rgbaToHex(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1\s*\)$/);
  if (!m) return value;
  return '#' + [m[1], m[2], m[3]]
    .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
    .join('');
}

// Shared hooks for both light and dark builds
const sharedHooks = {
  transforms: {
    'dimension/px': {
      type: 'value',
      filter: (token) => token.$type === 'dimension',
      transform: (token) => {
        const v = token.$value;
        return typeof v === 'number' ? `${v}px` : String(v);
      },
    },
    'name/abbrev': {
      type: 'name',
      transform: (token) => applyAbbrev(token.path.join('-').toLowerCase()),
    },
    'color/hex': {
      type: 'value',
      filter: (token) => token.$type === 'color',
      transform: (token) => rgbaToHex(token.$value),
    },
  },
  transformGroups: {
    // 'css' group with name/abbrev + color/hex instead of name/kebab + size/rem + color/css
    'css/px': [
      'attribute/cti',
      'name/abbrev',
      'time/seconds',
      'html/icon',
      'dimension/px',
      'color/hex',
      'asset/url',
      'fontFamily/css',
      'cubicBezier/css',
      'strokeStyle/css/shorthand',
      'border/css/shorthand',
      'typography/css/shorthand',
      'transition/css/shorthand',
      'shadow/css/shorthand',
    ],
  },
};

// ── Light build ──────────────────────────────────────────────────────────────
// All non-dark token files → :root
const sdLight = new StyleDictionary({
  source: lightFiles,
  usesDtcg: true,
  hooks: sharedHooks,
  platforms: {
    css: {
      transformGroup: 'css/px',
      buildPath: 'dist/',
      files: [{
        destination: 'tokens.css',
        format: 'css/variables',
        options: {
          selector: ':root',
          outputReferences: true,
          showFileHeader: false,
        },
      }],
    },
  },
  log: { verbosity: 'default', errors: { brokenReferences: 'warn' } },
});

await sdLight.buildAllPlatforms();

// ── Dark build ───────────────────────────────────────────────────────────────
// Dark files → [data-theme="dark"]; light files loaded as `include` so
// VARIABLE_ALIAS references resolve, but only dark tokens are emitted.
if (darkFiles.length > 0) {
  const sdDark = new StyleDictionary({
    include: lightFiles,
    source: darkFiles,
    usesDtcg: true,
    hooks: sharedHooks,
    platforms: {
      css: {
        transformGroup: 'css/px',
        buildPath: 'dist/',
        files: [{
          destination: 'tokens.dark.css',
          format: 'css/variables',
          filter: (token) => token.isSource === true,
          options: {
            selector: '[data-theme="dark"]',
            outputReferences: true,
            showFileHeader: false,
          },
        }],
      },
    },
    log: { verbosity: 'default', errors: { brokenReferences: 'warn' } },
  });

  await sdDark.buildAllPlatforms();
}

// ── Combine ──────────────────────────────────────────────────────────────────
const parts = [];
for (const f of ['dist/tokens.css', 'dist/tokens.dark.css']) {
  try { parts.push(readFileSync(f, 'utf-8').trim()); } catch { /* file absent */ }
}
if (parts.length > 0) {
  writeFileSync('dist/tokens.all.css', parts.join('\n\n') + '\n');
  console.log('Built dist/tokens.all.css');
}
