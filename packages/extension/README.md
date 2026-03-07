# playwright-repl Extension

Chrome side panel extension for the playwright-repl REPL. Runs the same 55+ commands as the CLI, directly in your browser — no external server, no Node process, no backend required.

## What Makes This Unique

Most browser automation tools require a Node.js backend. Playwright normally runs in Node and controls Chrome via a WebSocket (CDP). The CLI version of playwright-repl works the same way.

**This extension is different.** It runs the full Playwright API — `page`, `context`, `expect`, locators, assertions — entirely inside Chrome, with zero backend. No server. No subprocess. Just the extension.

### How is that possible?

Two technologies make it work:

#### 1. playwright-crx — Playwright inside the browser

[playwright-crx](https://github.com/ruifigueiredo19/playwright-crx) is a fork of Playwright that runs entirely in a Chrome extension's service worker. Normally Playwright opens a WebSocket to drive Chrome via CDP. playwright-crx replaces that WebSocket with `chrome.debugger` — a Chrome extension API that gives direct CDP access from within the browser itself.

When you click **Attach**, the extension calls `crxApp.attach(tabId)`, which:
- Uses `chrome.debugger.attach()` to connect to the tab's CDP session
- Starts a `BrowserContext` and `Page` — real Playwright objects
- Sets them as globals on `globalThis` in the service worker runtime

From that point, `page.click()`, `page.goto()`, `expect(locator).toBeVisible()` — all of it works, in the browser, against the real live tab.

#### 2. swDebugEval — evaluating code in the service worker via chrome.debugger

The panel (React UI) and the service worker run in separate JavaScript contexts. To execute Playwright code, the panel uses `chrome.debugger` a second time — this time to attach to the **service worker itself** as a debug target and evaluate expressions in its runtime.

```
Panel context                        Service Worker context
─────────────────                    ──────────────────────────
chrome.debugger                  →   globalThis.page    (Playwright Page)
  .sendCommand(                       globalThis.context (BrowserContext)
    'Runtime.evaluate',               globalThis.crxApp  (CrxApp)
    { expression: jsExpr }            globalThis.expect  (Playwright expect)
  )
```

This is the key insight: the service worker's runtime holds live Playwright objects. `chrome.debugger` lets the panel reach into that runtime and call them directly — no `chrome.runtime.sendMessage` roundtrip, no serialization of Playwright internals.

The panel generates a JS expression (`jsExpr`) from the user's command and evaluates it in the SW context. The result comes back as a CDP `Runtime.RemoteObject`.

#### Why not chrome.runtime.sendMessage?

`chrome.runtime.sendMessage` can only pass JSON-serializable data. Playwright objects (`Page`, `Locator`, `BrowserContext`) are not serializable — they hold WebSocket connections, CDP sessions, internal state. They can't cross message boundaries.

`chrome.debugger.Runtime.evaluate` works differently: the expression runs *inside* the target context where those objects are live. The result is either a primitive value (returned as-is) or a handle to the remote object. No serialization of Playwright internals needed.

### The Playwright Console — a DevTools console that understands Playwright

The extension includes a **Console tab** that is unlike anything in Chrome DevTools or any other Playwright tool. It is a single input that automatically detects what you typed and routes it to the right executor:

```
> await page.locator('h1').textContent()    ← Playwright mode → swDebugEval in SW context
→ "Introduction"

> document.title                             ← JS mode → cdp-evaluate in page context
→ "Playwright"

> goto https://playwright.dev               ← pw mode → keyword command
→ Done
```

**Three modes, zero syntax switching:**

| What you type | Mode | Execution |
|---|---|---|
| `page.*`, `await page.*`, `expect(...)`, `context.*`, `crxApp.*` | Playwright | `swDebugEval` in service worker — live Playwright objects |
| Any pw-repl keyword (`goto`, `click`, `snapshot`, ...) | pw | `runAndDispatch` — same as REPL tab |
| Anything else (`document.*`, `fetch(...)`, expressions) | JS | `cdp-evaluate` in the page context |

**CDP object tree with lazy expansion:**

Results are not just strings. The Console renders a full expandable object tree backed by CDP `Runtime.getProperties`, matching the DevTools console experience:

```
> page.mainFrame()
▶ Frame {
    _name: ""
    _url: "https://playwright.dev/"
  ▶ _page: Page { ... }
    ...
  }
```

Objects with an `objectId` (CDP remote object handle) can be expanded lazily — clicking a collapsed node fetches its properties on demand without re-evaluating the expression.

**`expect()` in the console:**

Because Playwright mode evaluates in the service worker context where `expect` is a live global, assertions run interactively:

```
> await expect(page.locator('h1')).toBeVisible()
→ (passes silently)

> await expect(page.locator('h1')).toHaveText('wrong text')
→ Error: expect(locator).toHaveText(expected)
  Expected: "wrong text"
  Received: "Introduction"
```

No test runner. No `describe` block. Just type an assertion and see if it passes.

**No other tool has this.** Chrome DevTools Console runs JS in the page — you get `document`, `window`, but no Playwright. Playwright Inspector is Node-only. playwright-crx exposes the API in the SW but has no console UI. This is the first interactive console that lets you mix `document.querySelectorAll`, `page.locator()`, `expect()`, and pw commands in a single input.

### Comparison

| | Node + Playwright | Chrome DevTools | **playwright-repl extension** |
|---|---|---|---|
| Runs Playwright | ✅ Node process | ❌ | ✅ **Service worker** |
| Full `page.*` API | ✅ | ❌ | ✅ |
| `expect()` in console | ✅ (test runner only) | ❌ | ✅ **interactively** |
| JS in page context | via `page.evaluate` | ✅ | ✅ |
| CDP object tree | ❌ | ✅ | ✅ |
| Both in one console | ❌ | ❌ | ✅ |
| Real attached tab | ❌ (separate launch) | ✅ | ✅ |

## Architecture

### Command Execution Pipeline

All commands follow a single path from user input to the browser tab:

```
┌──────────────────────────────────────────────────────────┐
│  Side Panel (React)                                      │
│  CommandInput.tsx → runAndDispatch() in run.ts           │
└─────────────────────────┬────────────────────────────────┘
                          │  string: e.g. "click Submit"
                          ▼
┌──────────────────────────────────────────────────────────┐
│  commands.ts — parseReplCommand()                        │
│  Parses keyword + args, produces a jsExpr string         │
│                                                          │
│  "click Submit"                                          │
│    → return await refAction(page, 'Submit', 'click')     │
│                                                          │
│  "goto https://example.com"                              │
│    → return await page.goto("https://example.com")       │
│                                                          │
│  "tab-list"                                              │
│    → return await (tabList.toString())(page)             │
└─────────────────────────┬────────────────────────────────┘
                          │  jsExpr string
                          ▼
┌──────────────────────────────────────────────────────────┐
│  bridge.ts — executeCommand()                            │
│  Calls swDebugEval(jsExpr)                               │
└─────────────────────────┬────────────────────────────────┘
                          │  chrome.debugger.sendCommand
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Service Worker runtime (background.ts)                  │
│  Live globals set by playwright-crx after attach:        │
│    globalThis.page     — active Playwright Page          │
│    globalThis.context  — BrowserContext                  │
│    globalThis.crxApp   — CrxApp instance                 │
│    globalThis.expect   — Playwright expect               │
└─────────────────────────┬────────────────────────────────┘
                          │  playwright-crx (CDP)
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Chrome tab                                              │
└──────────────────────────────────────────────────────────┘
```

### Why jsExpr Strings?

The panel and service worker live in different JavaScript contexts. `chrome.debugger` lets the panel evaluate arbitrary JS in the SW's runtime — where `page`, `context`, and `expect` are live Playwright objects.

`commands.ts` compiles each keyword into a self-contained JS expression that runs in that context. There is no `chrome.runtime.sendMessage` for commands — only a direct `chrome.debugger.sendCommand('Runtime.evaluate', ...)` call via `swDebugEval`.

### page-scripts.ts — Serializable Helper Functions

Text locators, assertions, and tab operations are implemented as plain functions in `src/page-scripts.ts`. Each function is **self-contained** — no imports, no closures — so it can be serialized via `.toString()` and sent as part of the jsExpr:

```typescript
// commands.ts
import { tabList } from './page-scripts';

// Compiles to:
// return await (async function tabList(page) { ... })(page)
return { jsExpr: call(tabList) };
```

The `call()` helper generates: `` `return await (${fn.toString()})(page, ...args)` ``

Functions that need `context` (for tab operations) access it via `globalThis.context` directly, since `context` is a global in the SW runtime.

### background.ts — Lifecycle Only

`background.ts` no longer executes commands. Its only responsibilities are:

| Message type | Action |
|---|---|
| `attach` | `crxApp.attach(tabId)` — connects playwright-crx to the active tab, sets `page`/`context`/`crxApp` globals |
| `record-start` | Injects recorder into the active tab, returns `{ ok, error }` |
| `record-stop` | Disconnects recorder port |
| `health` | Returns `{ ok: !!crxApp }` — status indicator in the toolbar |
| `cdp-evaluate` | Raw CDP `Runtime.evaluate` for the Console pane object tree |
| `cdp-get-properties` | Raw CDP `Runtime.getProperties` for the Console pane |
| `ping` | Keep-alive check |

### Tab Operations

Tab commands (`tab-list`, `tab-new`, `tab-close`, `tab-select`) use Playwright's BrowserContext APIs, matching how Playwright MCP implements tabs:

```
tab-list   → context.pages() → index-based list
             - 0: (current) [title](url)
             - 1: [title](url)

tab-new    → context.newPage() + page.goto(url)

tab-close  → pages[index].close()

tab-select → pages[index].bringToFront()
             + globalThis.page = pages[index]  ← updates active page for all subsequent commands
```

### Local Commands

Some commands are handled directly in `run.ts` without going through `swDebugEval`:

| Command | Handler |
|---|---|
| `#comment` | Dispatches `ADD_LINE` with type `comment` |
| `clear` | Dispatches `CLEAR_CONSOLE` |
| `help` | Prints command list from `COMMANDS` map |
| `history` / `history clear` | Reads/clears persistent command history |
| `run-code <js>` | Calls `swDebugEval(code)` directly — no jsExpr compilation |

## File Structure

```
src/
├── background.ts           # Service worker — lifecycle (attach, record, health, CDP, ping)
├── commands.ts             # Keyword → jsExpr compiler (parseReplCommand)
├── page-scripts.ts         # Serializable helper functions (refAction, textLocator, tab*, verify*, etc.)
└── panel/
    ├── panel.html          # Extension page entry
    ├── panel.tsx           # React root
    ├── App.tsx             # Root component — auto-attach, tab listener
    ├── reducer.ts          # useReducer — console lines, loading state
    ├── types.ts            # Shared TypeScript types
    ├── components/
    │   ├── Toolbar.tsx     # Record button, attach status, tab switcher
    │   ├── CommandInput.tsx # CodeMirror 6 REPL input with autocomplete + history
    │   ├── ConsolePane.tsx  # Output lines (success, error, comment, screenshot, snapshot)
    │   ├── EditorPane.tsx   # Multi-line script editor (Run button, Save, Export)
    │   └── Console/        # CDP object tree renderer
    └── lib/
        ├── bridge.ts       # executeCommand — parses + calls swDebugEval
        ├── run.ts          # runAndDispatch — local commands + bridge + dispatch
        ├── sw-debugger.ts  # swDebugEval — chrome.debugger evaluation in SW context
        ├── cm-input-setup.ts # CodeMirror 6 extensions (autocomplete, keymaps, history)
        ├── command-history.ts # Persistent localStorage command history
        ├── filter.ts       # Response filtering (snapshot truncation, etc.)
        └── server.ts       # Health-check polling for auto-attach
```

## Build & Test

```bash
# Build
cd packages/extension
npm run build

# Unit tests (Vitest browser mode)
npm run test

# E2E tests (Playwright — loads real extension in Chromium)
npm run test:e2e              # all suites
npx playwright test e2e/panel # panel UI tests (mocked chrome.runtime)
npx playwright test e2e/commands # command integration tests (real playwright-crx)
npx playwright test e2e/recording # recorder tests
```

### Test Architecture

**Panel tests** (`e2e/panel/`) load `panel.html` and mock `chrome.runtime.sendMessage` to return fixture responses for lifecycle calls (`health`, `attach`, `record-start`, `record-stop`). Command execution goes through the real `swDebugEval` path — no mocking of the command pipeline.

**Command tests** (`e2e/commands/`) load the full extension with a real service worker. Commands are submitted via the CodeMirror UI (type + Enter) and results are read from the `[data-type]` output elements. No globals are exposed from panel code.

**Recording tests** (`e2e/recording/`) verify the recorder injection and port messaging with a real attached tab.
