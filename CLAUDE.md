# CLAUDE.md

## Ink language reference

The official Ink scripting language documentation lives at:
https://raw.githubusercontent.com/inkle/ink/refs/heads/master/Documentation/WritingWithInk.md

This extension provides editor support (syntax highlighting, hover docs, folding, diagnostics) for the Ink language. Consult that document before writing or changing hover text, examples, or diagnostics, to keep syntax explanations and terminology (knots, stitches, threads, diverts, gathers, tunnels, weaves, labels, etc.) accurate to the actual language.

## Localization

Every piece of text shown to the user in the UI (hover popups, diagnostics/warning messages, command titles, configuration descriptions, notifications, webview labels/buttons, etc.) must be translated into every language this extension already supports: English (source), German (`de`), Spanish (`es`), French (`fr`), Italian (`it`), Japanese (`ja`), Korean (`ko`), Russian (`ru`), and Chinese Simplified (`zh-cn`). Never leave a new user-facing string only in English.

- Extension-side strings (hover text, diagnostics, notifications) use `l10n.t(...)`; `package.json` strings use `%key%` placeholders. Both are exported to `l10n/bundle.l10n.*.json` / `package.nls.*.json` — add the new key/translation to *every* language file, not just `l10n/bundle.l10n.json` (English).
- Webview-only UI strings (React components under `src/webview/`) go through the `Locale`-keyed dictionaries in `src/webview/src/i18n.ts` — add the new key to every locale in that file.

## Biome

This project is linted and formatted with Biome (`npm run lint`, `npm run check`, `npm run format`), configured via the root `biome.json`. Before considering any change done, run `npm run lint` (or `npm run check`) and make sure it doesn't report new errors — fix them rather than leaving them for later. The `pixi-vn-ink/` directory is a separate, untracked project with its own `biome.json` and is excluded from the root config; don't try to lint it as part of this repo.
