# Backlog

## High Priority

- [x] **Unified `verify` command** — Single `verify` command with sub-types: `verify title "Hello"`, `verify url "/about"`, `verify text "Welcome"`, `verify no-text "Gone"`, `verify element button "Submit"`, `verify no-element button "Submit"`, `verify value e5 "hello"`, `verify list e3 "a" "b"`. Uses `String.includes()` for title/url. Old `verify-*` commands kept as aliases. `query` dropped — `eval` covers the same use cases.
- [x] **History loads in wrong order** — Investigated: current `.reverse()` + `.push()` logic is actually correct (newest at index 0). Not a bug.
- [x] **Dark mode toggle** — Sun/moon SVG toggle in Toolbar, `useEffect` toggles `.theme-dark` class on `<html>`, persisted via `localStorage`.
- [x] **Extension spawn path bug** — `engine.ts:133` resolves `--load-extension` to `packages/extension` instead of `packages/extension/dist`. Chrome needs the folder containing `manifest.json`, which is in `dist/`. Fix: append `/dist` to the resolved path.
- [x] **Auto-inject `expect` in `run-code`** — Implemented via sandbox iframe + `__expect__` chain protocol. `expect(page.locator(...)).toBeVisible()` and `expect(page).toHaveTitle(...)` work. `.not` negation is not yet supported (see Medium Priority).
- [ ] **`expect().not` negation in `run-code`** — `expect(locator).not.toBeVisible()` is broken: `.not` is treated as a matcher name. Fix: detect `.not` in `createExpect()` in `sandbox.html` (return a proxy that sets a `negated` flag), pass `negated` as part of `__expect__` args, and call `expect(target).not[matcher]()` in `background.ts`.

## Big Ideas

- [ ] **Script test runner** — "Run all" button executes the full editor script as a test suite. Each top-level `await` statement runs sequentially; `expect()` results are streamed back line-by-line with pass/fail status. CM6 gutter decorations show green/red per line. No external framework needed — the sandbox + `run-code` infrastructure already executes arbitrary JS; the new piece is splitting the script into statements and collecting per-statement results.

- [ ] **AI test generation** — "Generate test" panel input: user describes what to verify in natural language, the extension sends the current `snapshot` (accessibility tree) + description to the Claude API, streams back `run-code` / `expect()` assertions that are inserted into the editor. Since `run-code` + `expect()` is already fully executable, the generated code can be run immediately with no extra plumbing.

- [ ] **AI browser agent** — Allow an AI model (e.g. Claude) to directly operate the browser. The panel sends the current `snapshot` + user goal to the Claude API; Claude responds with a sequence of `.pw` commands or `swDebugEval` calls (click, fill, goto, verify, etc.); each step is executed via the existing `executeCommand` / `swDebugEval` pipeline and the result fed back to the model for the next step. The agent loop runs until the goal is achieved or an error is hit. UI: "Ask AI" input in the panel, streaming step output in the console.

- [ ] **Step debugger** — Step through a `run-code` script line by line. Implementation: inject `__breakpoint__()` calls between statements before sending to the sandbox; `__breakpoint__` posts a `paused` message to the panel and waits for a `resume` postMessage. UI: step/continue buttons in toolbar, current line highlighted in CM6, a variables panel showing `page.url()`, `page.title()`, and any user-defined vars.

## Medium Priority
- [x] **CLI `clear` command** — Add `clear` to the CLI REPL to clear terminal output, matching the extension behavior. ([#15](https://github.com/stevez/playwright-repl/issues/15))
- [x] **Chaining selectors with `>>`** — When args contain `>>`, use `page.locator(<chained>)` instead of ref-based lookup. ([#16](https://github.com/stevez/playwright-repl/issues/16))
- [x] **Upgrade editor to CodeMirror 6** — Replace plain `<textarea>` in `EditorPane.tsx` with CodeMirror 6 (~30KB gzipped). Gains: syntax highlighting, proper selections, undo/redo, search. Potential custom `.pw` syntax mode later.
- [x] **Toolbar icons** — Replace text buttons (Open, Save, Export) with SVG icons in `Toolbar.tsx`, similar to existing sun/moon toggle in `Icons.tsx`.
- [ ] **Editor context menu** — Right-click menu in the editor with: Run line, Copy, Export to TypeScript, Copy to clipboard.
- [ ] **Record into editor (dual mode)** — Editor has two modes toggled in the toolbar: **`.pw` mode** records interactions as keyword commands (`click`, `fill`, `goto`, etc.) streamed live into the editor buffer; **`JS` mode** records interactions as Playwright JS (`await page.click(...)`) and also executes each line immediately via `swDebugEval` as it is appended (live REPL-style). Stop button ends the session. Currently recording only populates the editor on session end via JSONL replay; this makes it live and incremental in both modes.
- [ ] **Capture locator** — "Pick element" mode: user clicks on the page, extension captures a Playwright locator string (`getByRole(...)`, `getByText(...)`) via `chrome.scripting.executeScript` overlay, similar to recorder.
- [ ] **Extract shared `resolveArgs`** — The verify-command translation, text-locator resolution, and run-code auto-wrap logic is duplicated between `extension-server.ts` and `repl.ts`. Extract to a shared `core` utility.
- [ ] **Failed commands not recorded** — `packages/cli/src/repl.ts`: `session.record(line)` only runs after success; replay files miss failed commands
- [ ] **History write errors silently swallowed** — `packages/cli/src/repl.ts`: `catch {}` hides disk-full or permission errors
- [ ] **Playwright version too loose** — `packages/cli/package.json`: `>=1.59.0-alpha` accepts any future version; pin to `<1.60.0` or similar
- [x] **Publish CLI to npm** — Published `@playwright-repl/core@0.7.10` and `playwright-repl@0.7.10` to npm. Closes #37.

- [x] **Command timeout** — `executeCommand` in `server.ts` has no timeout; a stuck Playwright command (e.g. `goto` with "Frame was detached") hangs the fetch forever, blocking all subsequent commands and requiring a full browser restart. Add a 30s `AbortController` timeout so the fetch aborts and returns an error instead.
- [ ] **Client-initiated reattach** ([#39](https://github.com/stevez/playwright-repl/issues/39)) — After a "Frame was detached" error (e.g. `goto` to a site with aggressive redirects), the Playwright backend loses its page reference and subsequent commands fail. Add a `/reattach` endpoint to the server that re-selects the current page via `browser_tabs`, and a "Reconnect" button or automatic retry in the extension panel to call it.
- [ ] **Fix skipped autocomplete keyboard test** — `test/components/CommandInput.browser.test.tsx`: "should accept autocomplete item on Enter when dropdown is open" is skipped. After `waitForVisible`, subsequent `userEvent.keyboard` events don't reach CM6's autocomplete handler (CDP focus vs JS focus mismatch). Needs investigation into vitest-browser keyboard dispatch and CM6 completion state.
- [ ] **Improve test coverage after playwright-crx migration** — Coverage dropped significantly after migrating from HTTP server to playwright-crx: `commands.ts` and `page-scripts.ts` are at 0%, `App.tsx` at 0%, `Toolbar.tsx` at 0% in unit tests. Add: (1) unit tests for `commands.ts` and `page-scripts.ts`; (2) component test for `App.tsx` (auto-attach on mount, tab switch listener); (3) E2E tests for attach status indicator (shows connected after panel loads) and port-based recording JSONL → editor pipeline. Also recover the 2 dropped E2E panel tests: "shows attached status" and "recorded commands appear in editor".

- [x] **Fix failing recording component tab** — Recording via the record button fails to capture interactions on the component tab. Investigate why the recorder port/JSONL pipeline doesn't pick up actions on that tab and restore correct recording behaviour.
- [ ] **Auto-attach fails when only one tab open** — On fresh panel load with only one tab (e.g. `chrome://extensions`), the extension shows "Not attached". Adding a second regular tab (e.g. github.com) makes it work. Likely `getActiveTabId()` returns a chrome:// tab which is rejected, and there's no fallback to retry on next tab. Investigate and add a retry or clearer error.

- [ ] **Replace sandbox.html with `swDebugEval` for `run-code`** — The sandbox iframe + page-proxy architecture was needed because user code couldn't access the real `page` object. Now that `swDebugEval` evaluates directly in the background worker's runtime (where `page`, `crxApp`, `expect`, `activeTabId` are live globals), `run-code` can be replaced with a direct `swDebugEval(code)` call. Eliminates `sandbox.html`, `sandbox-runner.ts`, the `page-call` / `page-evaluate` message protocol, and all proxy machinery in `background.ts`. Multi-line support already works via async IIFE wrapping. Note: `expect().not` negation (currently broken in sandbox) would also need porting.

## Console (Phase 2)

- [ ] **CDP remote object inspection** — `document`, `window`, and other DOM objects currently serialize as `"ref: <Document>"` because `page.evaluate()` can't cross the serialization boundary. Use `chrome.debugger` `Runtime.evaluate` → `Runtime.getProperties` to get lazy remote object handles and build an expandable tree without full serialization.
- [ ] **Console autocomplete** — Autocomplete in ConsoleInput: pw keywords when input starts with a command word, JS property completions (via `Runtime.completionsForExpression` CDP call) for `page.` chains and JS expressions.
- [ ] **Console input in scroll flow** — Option to render the input row inline with entries (Chrome DevTools "input flows with output" style) vs. fixed at bottom. Currently fixed at bottom.
- [ ] **Richer console output types** — Console currently renders text, object trees, and screenshots. Add: `info` banners (blue tint), `warning`, `code-block` (syntax-highlighted CM6 read-only view for snapshot/HTML output), image rendering for `screenshot` results. Match all output types that the terminal pane already shows.
- [ ] **Terminal → console output parity** — `.pw` commands run via `executeCommand` (the terminal tab flow) should also stream their results into the console: text responses, screenshots, snapshot trees. Goal: everything visible in the terminal is also visible in the console, so the two panels stay in sync.
- [ ] **Editor JS mode** — Add a mode toggle in `EditorPane` (`.pw` / `JS`). In JS mode, the editor uses `@codemirror/lang-javascript` highlighting and the "Run" button sends the full script via `swDebugEval` instead of `run-code` + sandbox. Removes the need for the `run-code` command prefix in scripts.
- [ ] **Console recording / export** — Commands typed in the console can be exported as a `.pw` script or JS file. Button in console toolbar: "Copy session" dumps all input entries in order. Enables using the console as a scratchpad and promoting the session to the editor.

## Console (Phase 3 — terminal replacement)

- [ ] **Drop terminal tab** — Once console has full feature parity (all output types, JS mode, recording, autocomplete), remove the terminal tab entirely and make the console the single interaction surface. Migration path: (1) verify parity checklist above, (2) move `run-code` / editor "Run" to `swDebugEval`, (3) redirect `executeCommand` output to console, (4) remove `ConsolePane` / terminal reducer state, (5) rename Console → REPL in UI.

## Low Priority

- [ ] **Recorder: merge fill + Enter into `fill --submit`** — When recording, absorb `press Enter` after a `fill` into a single `fill "loc" "value" --submit` command. The `--submit` flag already exists in the engine. Change is in `recorder.ts` `handleKeydown`.
- [x] **`highlight` command** — `highlight <locator>` as shortcut for `page.locator(<locator>).highlight()`. Useful for visualizing non-unique locator matches. ([#14](https://github.com/stevez/playwright-repl/issues/14))
- [ ] **Migrate monorepo to pnpm** — Replace npm workspaces with pnpm. Use `workspace:*` protocol for internal dependencies so version bumps no longer require updating dep versions in each package. Migration: `pnpm import`, delete `package-lock.json`, update CI/scripts to use `pnpm`.
- [ ] **Improve README structure** — Consider splitting README into per-package docs (`packages/cli/README.md`, `packages/extension/README.md`) with a concise root README linking to both.
- [x] **Convert to TypeScript** — All packages migrated to TypeScript.
- [x] **Extension server (Phase 8)** — `playwright-repl --extension` starts HTTP server; extension connects as thin CDP relay.
- [x] **Restructure the extension code structure** — Extension has `src/` folder with React components, Vite build step.
- [x] **Tailwind CSS migration** — Extension panel styles migrated from custom CSS to Tailwind v4 utility classes.
