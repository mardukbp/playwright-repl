# CodeMirror 6 Migration — Phase 1: Replace EditorPane textarea

## Context

The extension uses a plain `<textarea>` for the editor pane. Replace it with CodeMirror 6 for built-in undo/redo, search (Ctrl+F), proper selections, and a foundation for syntax highlighting (Phase 2). No React wrapper — vanilla CM6 with `useRef`/`useEffect`.

## Phases Overview

| Phase | Scope | PR |
|-------|-------|----|
| **1 (this PR)** | Replace textarea with CM6, preserve behavior | Current |
| 2 | Custom `.pw` syntax highlighting | Future |
| 3 | Replace CommandInput with CM6 single-line | Future |
| 4 | JS highlighting for export/run-code | Future |

---

## Step-by-step Tasks

### Step 1: Install CodeMirror 6 dependencies

```bash
npm install codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/search -w packages/extension
```

Packages:
- `codemirror` — meta-package (re-exports core)
- `@codemirror/state` — editor state, transactions
- `@codemirror/view` — EditorView, decorations, gutters
- `@codemirror/commands` — default keybindings, undo/redo
- `@codemirror/language` — bracket matching, indentation
- `@codemirror/search` — Ctrl+F search panel

### Step 2: Create shared CM6 setup (`codemirror-setup.ts`)

**New file**: `packages/extension/src/panel/lib/codemirror-setup.ts`

Contents:
- **`pwTheme`** — CM6 theme mapping CSS custom properties:
  - `&` → `--bg-editor`, `--text-default`
  - `.cm-gutters` → `--bg-editor`, `--border-primary`
  - `.cm-lineNumbers .cm-gutterElement` → `--text-line-numbers`
  - `.cm-cursor` → `--color-caret`
  - `.cm-content` → font-family matching existing monospace stack
  - `.cm-scroller` → scrollbar styles
- **`baseExtensions`** — array of CM6 extensions:
  - `lineNumbers()`
  - `highlightActiveLineGutter()`
  - `history()` (undo/redo)
  - `bracketMatching()`
  - `search()` (Ctrl+F)
  - `keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap])`
  - `EditorView.lineWrapping` disabled (whitespace: pre)
  - `pwTheme`
  - `placeholder("# Type or open a .pw script...")`
  - Tab size = 2

### Step 3: Create line decoration extension

**In `codemirror-setup.ts`**, add:

- **`setRunLineEffect`** — `StateEffect<number>` to set current run line
- **`setLineResultsEffect`** — `StateEffect<(string|null)[]>` to set pass/fail markers
- **`runLineField`** — `StateField<number>` tracking current run line (-1 = none)
- **`lineResultsField`** — `StateField<(string|null)[]>` tracking pass/fail per line
- **`runLineHighlight`** — line decoration applying `--bg-line-highlight` background
- **`lineResultGutter`** — gutter with ✓/✗ markers colored by pass/fail
- Export helper: `dispatchRunState(view, runLine, lineResults)` called from React

### Step 4: Rewrite `EditorPane.tsx`

Replace textarea + manual line numbers with CM6 `EditorView`:

```
Before:
┌─────────┬──────────────────┐
│ LineNums │ <textarea>       │
│ (manual) │ (controlled)     │
│ div      │                  │
└─────────┴──────────────────┘

After:
┌─────────────────────────────┐
│ CodeMirror EditorView       │
│ (gutters + content area)    │
│ (manages its own state)     │
└─────────────────────────────┘
```

**Implementation details:**

1. `useRef<HTMLDivElement>` for CM6 mount point
2. `useRef<EditorView>` to hold the view instance
3. **Mount effect** (`[]` deps): create EditorView with baseExtensions + updateListener that dispatches `EDIT_EDITOR_CONTENT` on doc change. Cleanup: `view.destroy()`
4. **External sync effect** (`[editorContent]` deps): when editorContent changes externally (file open, record), push full-doc replacement transaction — skip if CM6 doc already matches (avoid echo loops)
5. **Run state effect** (`[currentRunLine, lineResults]` deps): dispatch `setRunLineEffect` and `setLineResultsEffect` into CM6 to update decorations
6. Remove: `lineNumbersRef`, `handleEditorScroll`, manual line number rendering, `#line-highlight` overlay

**Props unchanged**: `editorContent`, `currentRunLine`, `lineResults`, `dispatch`, `ref`

### Step 5: Clean up `panel.css`

Remove styles no longer needed:
- `#line-numbers .line-pass::before`, `.line-fail::before` pseudo-elements (replaced by CM6 gutter markers)
- Scrollbar styles: retarget from `#editor` to `.cm-scroller`

Add CM6 overrides:
- `.cm-editor { height: 100%; }` — fill pane
- `.cm-scroller { overflow: auto; }` — scrollable
- `.cm-focused { outline: none; }` — no focus ring (matches textarea behavior)

### Step 6: Update E2E tests

Tests that interact with `#editor` (textarea):

| Current selector | New selector | Change |
|---|---|---|
| `#editor` (fill) | `.cm-content` (click + type) | Can't `fill()` contenteditable |
| `#editor` (inputValue) | `.cm-content` (textContent) | Different read API |
| `#line-numbers div` | `.cm-lineNumbers .cm-gutterElement` | CM6 gutter elements |

Create test helper:
```ts
async function fillEditor(page: Page, text: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
}
```

### Step 7: Run tests and build

1. `npm test` — all unit + vitest tests pass
2. `npm run build` — extension builds
3. Note bundle size delta (CM6 adds ~30KB gzipped)
4. E2E tests pass with updated selectors

### Step 8: Visual verification

- [ ] Editor renders with line numbers
- [ ] Typing, undo/redo (Ctrl+Z/Y), search (Ctrl+F)
- [ ] File open/save works
- [ ] Run: line highlights + pass/fail markers
- [ ] Step: indicator advances correctly
- [ ] Recording: appended commands appear
- [ ] Dark/light theme toggle
- [ ] Export still works
- [ ] Placeholder text when empty

---

## Files to modify

| File | Change |
|---|---|
| `packages/extension/package.json` | Add 6 codemirror dependencies |
| `packages/extension/src/panel/lib/codemirror-setup.ts` | **New** — theme, extensions, line decoration StateFields |
| `packages/extension/src/panel/components/EditorPane.tsx` | Replace textarea with CM6 EditorView |
| `packages/extension/src/panel/panel.css` | Remove textarea styles, add CM6 overrides |
| `packages/extension/e2e/panel/panel.test.ts` | Update editor selectors |

## Files NOT changed

| File | Why |
|---|---|
| `reducer.ts` | State shape unchanged — editorContent stays as string |
| `Toolbar.tsx` | Reads editorContent from reducer, not CM6 |
| `CommandInput.tsx` | Phase 3 |
| `ConsolePane.tsx` | No editor dependency |
| `autocomplete.ts` | Phase 2/3 — reuse later for CM6 completion source |
