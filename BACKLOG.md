# Backlog

> GitHub issues are the source of truth. This file is a summary of open items.

## Big Ideas

- [ ] **Script test runner** ([#70](https://github.com/stevez/playwright-repl/issues/70)) — "Run all" button streams pass/fail per `await` statement with CM6 gutter decorations.
- [ ] **`explore-page` MCP prompt** ([#134](https://github.com/stevez/playwright-repl/issues/134)) — Prompt template: AI navigates to a URL, takes snapshot + screenshot, summarizes page structure (forms, nav, key elements).
- [ ] **`convert-script` MCP prompt** ([#135](https://github.com/stevez/playwright-repl/issues/135)) — Prompt template: AI converts between `.pw` keyword syntax and Playwright JavaScript (both directions), runs the converted script, and iterates until it passes.

## Medium Priority

- [ ] **Editor context menu** ([#74](https://github.com/stevez/playwright-repl/issues/74)) — Right-click: Run line, Copy, Export to TypeScript.
- [ ] **Extract shared `resolveArgs`** ([#77](https://github.com/stevez/playwright-repl/issues/77)) — Dedup verify/text-locator logic between `extension-server.ts` and `repl.ts`.
- [ ] **Failed commands not recorded** ([#78](https://github.com/stevez/playwright-repl/issues/78)) — CLI `session.record(line)` skips failed commands.
- [ ] **History write errors silently swallowed** ([#79](https://github.com/stevez/playwright-repl/issues/79)) — `catch {}` hides disk-full/permission errors.
- [ ] **Playwright version too loose** ([#80](https://github.com/stevez/playwright-repl/issues/80)) — `>=1.59.0-alpha` should be pinned to `<1.60.0`.
- [ ] **Fix skipped autocomplete keyboard test** ([#81](https://github.com/stevez/playwright-repl/issues/81)) — CM6 + vitest-browser keyboard dispatch mismatch.
- [ ] **Improve test coverage after playwright-crx migration** ([#82](https://github.com/stevez/playwright-repl/issues/82)) — `commands.ts`, `page-scripts.ts`, `App.tsx`, `Toolbar.tsx` at 0%.
- [ ] **E2E tests for recording flow** ([#103](https://github.com/stevez/playwright-repl/issues/103))
- [ ] **Improve help command** ([#106](https://github.com/stevez/playwright-repl/issues/106)) — Descriptions, modes, scripts, JS.
- [ ] **Language mode setting in preferences** ([#115](https://github.com/stevez/playwright-repl/issues/115)) — Add `languageMode` to `PwReplSettings`, exposed as a dropdown in `PreferencesForm`.

## Console

- [ ] **ObjectTree array rendering** ([#85](https://github.com/stevez/playwright-repl/issues/85)) — Inline previews and table layout for homogeneous arrays.
- [ ] **Console input in scroll flow** ([#87](https://github.com/stevez/playwright-repl/issues/87)) — Inline input option (Chrome DevTools style) vs. fixed at bottom.
- [ ] **Snapshot as expandable tree in console** ([#88](https://github.com/stevez/playwright-repl/issues/88)) — Parse snapshot text → collapsible CM6 tree.

## Low Priority

- [ ] **Recorder: merge fill + Enter into `fill --submit`** ([#94](https://github.com/stevez/playwright-repl/issues/94)) — Absorb `press Enter` after `fill` in `recorder.ts`.
- [ ] **CSV/Excel/Markdown format support** ([#4](https://github.com/stevez/playwright-repl/issues/4))
