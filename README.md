# blb-ds-tokens

Design token source of truth for the [Bloob.io](https://bloob.io) Design System.

Tokens are authored in **Figma Variables**, exported to DTCG-format JSON via a custom Figma plugin, and built into CSS custom properties by a GitHub Action. The resulting CSS is served via jsDelivr CDN.

---

## Using the tokens

Add one `<link>` tag to your HTML — no build step required on the consumer side:

```html
<!-- All tokens: light defaults + dark overrides -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/meln1kp/blb-ds-tokens@main/dist/tokens.all.css">
```

Or import individual files:

```html
<!-- Light / default tokens only -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/meln1kp/blb-ds-tokens@main/dist/tokens.css">

<!-- Dark overrides only (requires tokens.css to be loaded first) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/meln1kp/blb-ds-tokens@main/dist/tokens.dark.css">
```

### Dark mode

Apply `data-theme="dark"` to `<html>` (or any ancestor element) to activate dark token overrides:

```html
<html data-theme="dark">
```

### Token naming

All tokens are prefixed with `--blb-` and follow kebab-case:

```css
color: var(--blb-color-brand-default);
background: var(--blb-color-surface-base);
font-size: var(--blb-font-size-03);
border-radius: var(--blb-radius-m);
```

---

## Token collections

| File | Description |
|------|-------------|
| `color-primitives.tokens.json` | Raw palette — all named colors with rgba values |
| `color-semantic.light.tokens.json` | Semantic color roles for light mode |
| `color-semantic.dark.tokens.json` | Semantic color roles for dark mode |
| `typography-primitives.tokens.json` | Font families, sizes, weights, line heights |
| `typography.tokens.json` | Semantic typography roles |
| `sizing.tokens.json` | Spacing and sizing scale |
| `opacity.tokens.json` | Opacity levels |
| `responsive.normal.tokens.json` | Layout tokens for normal viewport |
| `responsive.fullscreen.tokens.json` | Layout tokens for fullscreen viewport |
| `responsive.mobile.tokens.json` | Layout tokens for mobile viewport |

Token values follow the [DTCG](https://tr.designtokens.org/) format (`$type`, `$value`, `$description`). Colors are exported as `rgba(r, g, b, a)`.

---

## Updating tokens

1. Make changes to Figma Variables in the Bloob.io Figma file
2. Open **Plugins → BLB Tokens → GitHub** in Figma
3. Click **Sync tokens to GitHub**

The plugin pushes updated JSON files to `tokens/` on `main`. The GitHub Action detects the change, rebuilds `dist/`, and commits it — CDN reflects the update within minutes.

> **First time setup:** paste a GitHub fine-grained PAT with `contents:write` on this repo into the plugin. It is saved locally via `figma.clientStorage` and pre-filled on subsequent opens.

---

## How it works

```
Figma Variables
      │  Figma plugin (figma-plugin/)
      ▼
tokens/*.tokens.json   ← DTCG JSON, committed by plugin via GitHub API
      │  GitHub Action (.github/workflows/sync-tokens.yml)
      │  Style Dictionary v4 (scripts/build-tokens.js)
      ▼
dist/tokens.css        ← :root CSS custom properties
dist/tokens.dark.css   ← [data-theme="dark"] overrides
dist/tokens.all.css    ← both combined (recommended import)
      │
      ▼
jsDelivr CDN  →  consumer apps
```

---

## Local development

```bash
npm install
npm run build        # rebuilds dist/ from tokens/
```

Requires Node ≥ 20.

---

## Repo structure

```
figma-plugin/        Figma plugin source (manifest, code.js, ui.html)
scripts/
  build-tokens.js    Style Dictionary v4 build script
tokens/              DTCG JSON files — written by plugin, not edited by hand
dist/                Built CSS — written by CI, not edited by hand
.github/workflows/
  sync-tokens.yml    Triggers build on push to tokens/**
```
