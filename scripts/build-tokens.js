#!/usr/bin/env node
/**
 * Builds CSS custom-property files from the DTCG token JSON using Style Dictionary v4.
 *
 * Reads:  tokens/**\/*.tokens.json   (written by fetch-tokens.js)
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
  console.error('No token files found – run `npm run fetch` first.');
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

// Shared hooks for both builds:
//   - dimension/px  keeps dimension values as px strings (skips the built-in pxToRem)
//   - css/px        same as the built-in 'css' group minus size/pxToRem
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
  },
  transformGroups: {
    // 'css' group minus 'size/rem', replaced by 'dimension/px' to keep px values
    'css/px': [
      'attribute/cti',
      'name/kebab',
      'time/seconds',
      'html/icon',
      'color/css',
      'dimension/px',
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
      prefix: 'blb',
      buildPath: 'dist/',
      files: [{
        destination: 'tokens.css',
        format: 'css/variables',
        options: {
          selector: ':root',
          outputReferences: true,
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
        prefix: 'blb',
        buildPath: 'dist/',
        files: [{
          destination: 'tokens.dark.css',
          format: 'css/variables',
          filter: (token) => token.isSource === true,
          options: {
            selector: '[data-theme="dark"]',
            outputReferences: true,
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
