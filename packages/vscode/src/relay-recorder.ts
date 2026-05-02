// @ts-nocheck — This runs inside page.evaluate(), not in Node.js.
/**
 * Relay Recorder — recording support without Chrome extension.
 *
 * Written as a real function so it's testable (import + call in vitest)
 * and injectable via recorderInit.toString() for page.evaluate().
 *
 * Contains the FULL locator generation and event recording logic from
 * packages/extension/src/content/locator.ts and recorder.ts.
 *
 * Transport: window.__pwRecordAction(JSON.stringify({ type, action }))
 * Cleanup:   window.__pwRecordCleanup()
 */

export function recorderInit() {
  if (window.__pw_recorder_active) return;
  window.__pw_recorder_active = true;

  // ─── Implicit ARIA roles ───────────────────────────────────────────────

  const IMPLICIT_ROLES = {
    A: (el) => el.hasAttribute('href') ? 'link' : null,
    BUTTON: 'button',
    H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
    INPUT: (el) => {
      const t = el.type.toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'reset' || t === 'button') return 'button';
      if (t === 'hidden') return null;
      return 'textbox';
    },
    TEXTAREA: 'textbox',
    SELECT: 'combobox',
    IMG: 'img',
    NAV: 'navigation',
    MAIN: 'main',
    HEADER: 'banner',
    FOOTER: 'contentinfo',
    P: 'paragraph',
    UL: 'list', OL: 'list',
    LI: 'listitem',
    TABLE: 'table',
    TR: 'row',
    TH: 'columnheader',
    TD: 'cell',
    FORM: 'form',
    DIALOG: 'dialog',
    ARTICLE: 'article',
  };

  const NAME_FROM_CONTENT = new Set([
    'button', 'link', 'heading', 'tab', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'radio', 'checkbox', 'switch', 'cell',
    'columnheader', 'rowheader', 'tooltip', 'treeitem',
  ]);

  const CONTAINER_ROLES = new Set(['listitem', 'row', 'article', 'group']);

  const ROLE_SHORTHANDS = { listitem: 'list' };

  function getImplicitRole(el) {
    const explicit = el.getAttribute('role');
    if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit;
    const entry = IMPLICIT_ROLES[el.tagName];
    if (!entry) return null;
    return typeof entry === 'function' ? entry(el) : entry;
  }

  // ─── Accessible name ───────────────────────────────────────────────────

  function accumulatedText(el, exclude?) {
    const tokens = [];
    for (const child of el.childNodes) {
      if (exclude && child === exclude) continue;
      if (child.nodeType === Node.TEXT_NODE) {
        tokens.push(child.textContent || '');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child;
        if (exclude && childEl.contains(exclude)) {
          tokens.push(accumulatedText(childEl, exclude));
        } else {
          const name = getAccessibleName(childEl);
          tokens.push(name || accumulatedText(childEl));
        }
      }
    }
    return tokens.join('').replace(/\s+/g, ' ').trim();
  }

  function getAccessibleName(el) {
    // aria-labelledby (highest priority per ARIA spec)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map(id => {
        const ref = document.getElementById(id);
        return ref ? accumulatedText(ref) : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }

    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // For inputs: associated <label>
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const label = getLabel(el);
      if (label) return label;
    }

    // For roles that get name from content
    const role = getImplicitRole(el);
    if (role && NAME_FROM_CONTENT.has(role)) {
      const text = accumulatedText(el);
      if (text && text.length <= 80) return text;
    }

    // alt for images
    if (el.tagName === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt) return alt.trim();
    }

    return '';
  }

  function getLabel(el) {
    // Explicit label via for attribute
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return accumulatedText(label, el);
    }
    // Implicit label (ancestor)
    const parentLabel = el.closest('label');
    if (parentLabel) {
      return accumulatedText(parentLabel, el);
    }
    return '';
  }

  function getInformalLabel(el) {
    // Table layout: check within the same cell first, then preceding cells
    const row = el.closest('tr');
    if (row) {
      const cell = el.closest('td, th');
      if (cell) {
        // First: preceding siblings within the same cell
        let prev = el.previousElementSibling;
        while (prev) {
          const text = (prev.textContent || '').trim();
          if (text && text.length <= 80) return text;
          prev = prev.previousElementSibling;
        }
        // Then: preceding cell's text in the same row
        prev = cell.previousElementSibling;
        while (prev) {
          const text = (prev.textContent || '').trim();
          if (text && text.length <= 80) return text;
          prev = prev.previousElementSibling;
        }
      }
    }
    // Non-table: preceding sibling's text content
    let prev = el.previousElementSibling;
    while (prev) {
      const text = (prev.textContent || '').trim();
      if (text && text.length <= 80) return text;
      prev = prev.previousElementSibling;
    }
    return '';
  }

  // ─── Ancestor context disambiguation ──────────────────────────────────

  function getContextText(ancestor, exclude) {
    function findText(node) {
      for (const child of node.childNodes) {
        if (child === exclude) continue;
        if (child.nodeType === Node.ELEMENT_NODE && child.contains(exclude)) {
          const inner = findText(child);
          if (inner) return inner;
          continue;
        }
        const text = (child.textContent || '').trim();
        if (text && text.length <= 50) return text;
      }
      return '';
    }
    return findText(ancestor);
  }

  function findContainerAncestor(el) {
    let current = el.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      const role = getImplicitRole(current);
      if (role && CONTAINER_ROLES.has(role)) return { ancestor: current, role };
      current = current.parentElement;
    }
    return null;
  }

  // ─── Heading-based context disambiguation ─────────────────────────────

  function findLeafText(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim();
        if (text && text.length >= 2 && text.length <= 50) return text;
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child;
        if (el.matches('button') || el.closest('button')) continue;
        const text = findLeafText(el);
        if (text) return text;
      }
    }
    return '';
  }

  function findNearestHeading(el) {
    let current = el.parentElement;
    let depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 5) {
      for (const child of current.children) {
        if (child.contains(el)) break;
        if (child.matches('a') || child.querySelector('a')) continue;
        if (child.querySelector('input[type="radio"], input[type="checkbox"]')) continue;
        if (child.matches('input[type="radio"], input[type="checkbox"]')) continue;
        if (child.matches('nav, [role="navigation"], [role="toolbar"], [role="tablist"]')) continue;
        if (child.closest('nav, [role="navigation"], [role="toolbar"], [role="tablist"]')) continue;
        const text = findLeafText(child);
        if (text) return { container: current, text };
      }
      current = current.parentElement;
      depth++;
    }
    return null;
  }

  function tryHeadingContext(el, matches) {
    const result = findNearestHeading(el);
    if (!result) return null;

    let count = 0;
    for (const match of matches) {
      const mResult = findNearestHeading(match);
      if (mResult && mResult.text === result.text) {
        count++;
        if (count > 1) return null;
      }
    }
    return count === 1 ? result.text : null;
  }

  function tryAncestorContext(el, role, name, matches) {
    const container = findContainerAncestor(el);
    if (!container) return null;

    const contextText = getContextText(container.ancestor, el);
    if (!contextText || contextText.length > 50) return null;

    let count = 0;
    for (const match of matches) {
      const mc = findContainerAncestor(match);
      if (!mc || mc.role !== container.role) continue;
      if ((mc.ancestor.textContent || '').includes(contextText)) {
        count++;
        if (count > 1) return null;
      }
    }
    if (count !== 1) return null;

    return `getByRole(${escapeString(container.role)}).filter({ hasText: ${escapeString(contextText)} }).getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
  }

  // ─── Locator disambiguation ───────────────────────────────────────────

  function findByRoleAndName(role, name) {
    const matches = [];
    for (const el of document.querySelectorAll('*')) {
      if (getImplicitRole(el) === role && getAccessibleName(el) === name
          && el.checkVisibility?.() !== false)
        matches.push(el);
    }
    return matches;
  }

  function findAllByRoleAndName(role, name) {
    const matches = [];
    for (const el of document.querySelectorAll('*')) {
      if (getImplicitRole(el) === role && getAccessibleName(el) === name)
        matches.push(el);
    }
    return matches;
  }

  // ─── Hover detection ──────────────────────────────────────────────────

  function findHoverAncestor(el) {
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      if (ancestor.matches(':hover')) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function isHoverRevealed(el) {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (!rule.selectorText.includes(':hover')) continue;
          const s = rule.style;
          const reveals = (s.display && s.display !== 'none') ||
              s.visibility === 'visible' ||
              (s.opacity && s.opacity !== '0');
          if (!reveals) continue;
          try { if (el.matches(rule.selectorText)) return true; } catch { /* invalid selector */ }
        }
      } catch { /* cross-origin stylesheet */ }
    }
    return false;
  }

  // ─── Element classification ───────────────────────────────────────────

  function isTextField(el) {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      return !['checkbox', 'radio', 'submit', 'reset', 'button', 'hidden', 'file', 'image', 'range', 'color'].includes(type);
    }
    if (el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  function isCheckable(el) {
    return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
  }

  // ─── String helpers ───────────────────────────────────────────────────

  function escapeString(s) {
    if (!s.includes("'")) return `'${s}'`;
    if (!s.includes('"')) return `"${s}"`;
    return `'${s.replace(/'/g, "\\'")}'`;
  }

  function buildCssSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${CSS.escape(el.id)}`;
    const classes = [...el.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
    if (classes) return `${tag}${classes}`;

    // Bare tag — build a unique path from the nearest identifiable ancestor
    let current = el;
    const parts = [];
    while (current && current !== document.body && current !== document.documentElement) {
      const t = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`${t}#${CSS.escape(current.id)}`);
        break;
      }
      const cls = [...current.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
      if (cls) {
        parts.unshift(`${t}${cls}`);
        break;
      }
      // Use nth-of-type if siblings share the tag
      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.querySelectorAll(`:scope > ${t}`)];
        parts.unshift(siblings.length > 1
          ? `${t}:nth-of-type(${siblings.indexOf(current) + 1})`
          : t);
      } else {
        parts.unshift(t);
      }
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // ─── Locator generation ───────────────────────────────────────────────

  function generateLocator(el) {
    // 1. Test ID
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return `getByTestId(${escapeString(testId)})`;

    // 2. Role + accessible name
    const role = getImplicitRole(el);
    const name = getAccessibleName(el);
    if (role && name) {
      // Disambiguate when multiple elements share same role + name
      const matches = findByRoleAndName(role, name);
      if (matches.length > 1) {
        // Try ancestor context first (readable chained locators)
        const ancestorLocator = tryAncestorContext(el, role, name, matches);
        if (ancestorLocator) return ancestorLocator;
        // Fallback to nth-based disambiguation
        const base = `getByRole(${escapeString(role)}, { name: ${escapeString(name)}, exact: true })`;
        const idx = matches.indexOf(el);
        return idx === 0 ? base + '.first()' : base + `.nth(${idx})`;
      }
      return `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
    }

    // 3. Label (for form elements)
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const label = getLabel(el);
      if (label) return `getByLabel(${escapeString(label)})`;
    }

    // 4. Placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return `getByPlaceholder(${escapeString(placeholder)})`;

    // 5. Alt text
    const alt = el.getAttribute('alt');
    if (alt && ['IMG', 'APPLET', 'AREA', 'INPUT'].includes(el.tagName))
      return `getByAltText(${escapeString(alt)})`;

    // 6. Title
    const title = el.getAttribute('title');
    if (title) return `getByTitle(${escapeString(title)})`;

    // 7. Text content
    const text = (el.textContent || '').trim();
    if (text && el.tagName !== 'SELECT') {
      if (text.length <= 80) return `getByText(${escapeString(text)}, { exact: true })`;
      const snippet = text.slice(0, 50).replace(/\s+\S*$/, '');
      if (snippet) return `getByText(${escapeString(snippet)})`;
    }

    // 8. Role without name — only when unique on the page
    if (role) {
      const allWithRole = [...document.querySelectorAll('*')].filter(
        e => getImplicitRole(e) === role && (!e.checkVisibility || e.checkVisibility()),
      );
      if (allWithRole.length === 1) return `getByRole(${escapeString(role)})`;
    }

    // 9. CSS fallback
    return `locator(${escapeString(buildCssSelector(el))})`;
  }

  function generateLocatorPair(el) {
    const jsLocator = generateLocator(el);

    // No disambiguation needed — return as-is
    if (!jsLocator.includes('.filter(') && !jsLocator.includes('.nth(') && !jsLocator.includes('.first()')) {
      return { js: jsLocator, pw: jsLocator };
    }

    // JS used ancestor context (.filter chain) — extract ancestor info for PW --in flag
    if (jsLocator.includes('.filter(')) {
      const role = getImplicitRole(el);
      const name = getAccessibleName(el);
      const container = findContainerAncestor(el);
      const contextText = container ? getContextText(container.ancestor, el) : '';

      if (container && contextText) {
        const pwLocator = `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
        const shortRole = ROLE_SHORTHANDS[container.role] ?? container.role;
        return { js: jsLocator, pw: pwLocator, ancestor: { role: shortRole, text: contextText } };
      }

      // .filter() present but no container context — fall back to .nth()
      const matches = findByRoleAndName(role, name);
      const base = `getByRole(${escapeString(role)}, { name: ${escapeString(name)}, exact: true })`;
      const idx = matches.indexOf(el);
      const pwLocator = idx === 0 ? base + '.first()' : base + `.nth(${idx})`;
      return { js: jsLocator, pw: pwLocator };
    }

    // .nth()/.first() — try heading context for PW --in flag
    const role = getImplicitRole(el);
    const name = getAccessibleName(el);
    if (role && name) {
      const matches = findByRoleAndName(role, name);
      const headingText = tryHeadingContext(el, matches);
      if (headingText) {
        const pwLocator = `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
        return { js: jsLocator, pw: pwLocator, ancestor: { role: '', text: headingText } };
      }
    }

    return { js: jsLocator, pw: jsLocator };
  }

  function locatorToPwArgs(locator, role) {
    const q = (s) => `"${s}"`;

    // Extract nth modifier
    let nth = '';
    if (/\.first\(\)/.test(locator)) nth = ' --nth 0';
    else if (/\.last\(\)/.test(locator)) nth = ' --nth -1';
    else {
      const nthMatch = locator.match(/\.nth\((\d+)\)/);
      if (nthMatch) nth = ` --nth ${nthMatch[1]}`;
    }

    // getByRole with name
    const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
    if (roleNameMatch) return `${roleNameMatch[1]} ${q(roleNameMatch[2])}${nth}`;

    // getByRole without name
    const roleMatch = locator.match(/getByRole\(['"](.+?)['"]\)/);
    if (roleMatch) return `${roleMatch[1]}${nth}`;

    // getByTestId
    const testIdMatch = locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return `${q(testIdMatch[1])}${nth}`;

    // getByLabel / getByText / getByPlaceholder / getByTitle / getByAltText
    const getByMatch = locator.match(/getBy\w+\(['"](.+?)['"](,\s*\{[^}]*\})?\)/);
    if (getByMatch) {
      const prefix = role ? `${role} ` : '';
      const exact = getByMatch[0].includes('exact: true') ? ' --exact' : '';
      return `${prefix}${q(getByMatch[1])}${exact}${nth}`;
    }

    // locator('css') fallback
    const locatorMatch = locator.match(/locator\(['"](.+?)['"]\)/);
    if (locatorMatch) return `${q(locatorMatch[1])}${nth}`;

    return q(locator);
  }

  // ─── Command building ─────────────────────────────────────────────────

  function buildCommands(action, el, opts?) {
    const { js: jsLocator, pw: pwLocator, ancestor } = generateLocatorPair(el);
    const jsLoc = `page.${jsLocator}`;
    const role = getImplicitRole(el);
    const pwArgs = locatorToPwArgs(pwLocator, role);
    const q = (s) => `"${s}"`;
    const inFlag = ancestor
      ? ` --in ${ancestor.role ? `${ancestor.role} ` : ''}${q(ancestor.text)}`
      : '';
    const isCssFallback = pwLocator.startsWith('locator(');
    const cssPrefix = isCssFallback ? 'css ' : '';

    switch (action) {
      case 'hover':
        return {
          pw: `hover ${cssPrefix}${pwArgs}${inFlag}`,
          js: `await ${jsLoc}.hover();`,
        };

      case 'click': {
        let clickLoc = pwArgs;
        let clickPrefix = cssPrefix;
        if (el.tagName === 'SELECT') {
          const isBareRoleClick = !isCssFallback && /^[a-z]+$/.test(pwArgs);
          if (isCssFallback || isBareRoleClick) {
            const informal = getInformalLabel(el);
            if (informal) {
              clickLoc = q(informal);
              clickPrefix = '';
            }
          }
        }
        return {
          pw: `click ${clickPrefix}${clickLoc}${inFlag}`,
          js: `await ${jsLoc}.click();`,
        };
      }

      case 'fill': {
        const val = opts?.value ?? '';
        let fillLoc = pwArgs;
        let fillPrefix = cssPrefix;
        const isBareRole = !isCssFallback && /^[a-z]+$/.test(pwArgs);
        if (isCssFallback || isBareRole) {
          const informal = getInformalLabel(el);
          if (informal) {
            fillLoc = q(informal);
            fillPrefix = '';
          } else if (isBareRole) {
            fillLoc = q(buildCssSelector(el));
            fillPrefix = 'css ';
          }
        }
        return {
          pw: `fill ${fillPrefix}${fillLoc} ${q(val)}${inFlag}`,
          js: `await ${jsLoc}.fill(${escapeString(val)});`,
        };
      }

      case 'check':
        return {
          pw: `check ${cssPrefix}${pwArgs}${inFlag}`,
          js: `await ${jsLoc}.check();`,
        };

      case 'uncheck':
        return {
          pw: `uncheck ${cssPrefix}${pwArgs}${inFlag}`,
          js: `await ${jsLoc}.uncheck();`,
        };

      case 'select': {
        const optVal = opts?.option ?? '';
        let selLoc = pwArgs;
        let selPrefix = cssPrefix;
        const isBareRoleSel = !isCssFallback && /^[a-z]+$/.test(pwArgs);
        if (isCssFallback || isBareRoleSel) {
          const informal = getInformalLabel(el);
          if (informal) {
            selLoc = q(informal);
            selPrefix = '';
          } else if (isBareRoleSel) {
            selLoc = q(buildCssSelector(el));
            selPrefix = 'css ';
          }
        }
        return {
          pw: `select ${selPrefix}${selLoc} ${q(optVal)}${inFlag}`,
          js: `await ${jsLoc}.selectOption(${escapeString(optVal)});`,
        };
      }

      case 'press': {
        const key = opts?.key ?? '';
        if (pwArgs) {
          return {
            pw: `press ${cssPrefix}${pwArgs} ${key}${inFlag}`,
            js: `await ${jsLoc}.press(${escapeString(key)});`,
          };
        }
        return {
          pw: `press ${key}`,
          js: `await page.keyboard.press(${escapeString(key)});`,
        };
      }

      default:
        return null;
    }
  }

  // ─── Frame detection ──────────────────────────────────────────────────

  function selectorForFrame(frame) {
    if (frame.id) return `#${CSS.escape(frame.id)}`;
    const tag = frame.tagName.toLowerCase();
    const name = frame.getAttribute('name');
    if (name) return `${tag}[name="${name}"]`;
    const src = frame.getAttribute('src');
    if (src) return `${tag}[src="${src}"]`;
    const parent = frame.parentElement;
    if (parent) {
      const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
      const idx = siblings.indexOf(frame);
      return siblings.length === 1 ? tag : `${tag}:nth-of-type(${idx + 1})`;
    }
    return tag;
  }

  function detectFrameChain() {
    if (window === window.top) return [];

    const chain = [];
    let win = window;
    while (win !== win.top) {
      try {
        const frame = win.frameElement;
        if (frame) {
          chain.push(selectorForFrame(frame));
        } else {
          try {
            const src = win.location.href;
            chain.push((src && src !== 'about:blank') ? `iframe[src="${src}"]` : 'iframe');
          } catch { chain.push('iframe'); }
          break;
        }
      } catch {
        break;
      }
      win = win.parent;
    }
    return chain.reverse();
  }

  const framePath = detectFrameChain();

  function wrapWithFrameContext(cmds) {
    if (framePath.length === 0) return cmds;
    const frameArg = framePath.join(' ');
    const jsChain = framePath.map(sel => `.locator(${JSON.stringify(sel)}).contentFrame()`).join('');
    return {
      pw: `${cmds.pw} --frame "${frameArg}"`,
      js: `await page${jsChain}.${cmds.js.replace(/^await page\./, '')}`,
    };
  }

  // ─── Transport ────────────────────────────────────────────────────────

  function send(msg) {
    if (window.__pwRecordAction) {
      try { window.__pwRecordAction(JSON.stringify(msg)); } catch {}
    }
  }

  // ─── Special keys ─────────────────────────────────────────────────────

  const SPECIAL_KEYS = new Set([
    'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  ]);

  // ─── Fill buffering ───────────────────────────────────────────────────

  let pendingFill = null;
  function flushPendingFill() { pendingFill = null; }

  // ─── Event handlers (capture phase, transparent) ──────────────────────

  function onClickCapture(e) {
    const target = e.target;
    if (!target) return;

    // Media elements (video/audio) — walk up to nearest <a> with href
    if (target.matches('video, audio')) {
      const link = target.closest('a[href]');
      if (link) {
        let href = link.getAttribute('href') || '';
        const ampIdx = href.indexOf('&');
        if (ampIdx > 0) href = href.slice(0, ampIdx);
        if (href) {
          const cmds = {
            pw: `click link "${href}"`,
            js: `await page.locator('a[href^="${href}"]:not([aria-hidden="true"])').click();`,
          };
          send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
          return;
        }
      }
    }

    // Skip clicks on text fields (focus-click noise before fill)
    if (isTextField(target)) return;

    // Skip clicks on checkable elements (handled by change event)
    if (isCheckable(target)) return;

    // Flush any pending fill
    flushPendingFill();

    // Detect hover-revealed elements
    if (isHoverRevealed(target)) {
      const hoverTarget = findHoverAncestor(target);
      if (hoverTarget) {
        const hoverCmds = buildCommands('hover', hoverTarget);
        if (hoverCmds) {
          send({ type: 'recorded-action', action: wrapWithFrameContext(hoverCmds) });
        }
      }
    }

    const cmds = buildCommands('click', target);
    if (cmds) {
      send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
    }
  }

  function onInputCapture(e) {
    const target = e.target;
    if (!target || !isTextField(target)) return;

    const value = target.value ?? '';

    if (pendingFill && pendingFill.el === target) {
      pendingFill.value = value;
      const cmds = buildCommands('fill', target, { value });
      if (cmds) {
        send({ type: 'recorded-fill-update', action: wrapWithFrameContext(cmds) });
      }
    } else {
      flushPendingFill();
      pendingFill = { el: target, value };
      const cmds = buildCommands('fill', target, { value });
      if (cmds) {
        send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
      }
    }
  }

  function onChangeCapture(e) {
    const target = e.target;
    if (!target) return;

    // Checkbox / radio
    if (isCheckable(target)) {
      flushPendingFill();
      const checked = target.checked;
      const cmds = buildCommands(checked ? 'check' : 'uncheck', target);
      if (cmds) {
        send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
      }
      return;
    }

    // Select
    if (target instanceof HTMLSelectElement) {
      flushPendingFill();
      const selected = target.options[target.selectedIndex];
      const option = selected ? selected.text.trim() || target.value : target.value;
      const cmds = buildCommands('select', target, { option });
      if (cmds) {
        send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
      }
      return;
    }
  }

  function onKeyDownCapture(e) {
    if (!SPECIAL_KEYS.has(e.key)) return;

    const target = e.target;

    // Tab changes focus but is navigation noise — flush fill, don't emit
    if (e.key === 'Tab') { flushPendingFill(); return; }

    // Inside a text field, only Enter is a meaningful action
    if (e.key !== 'Enter' && target && isTextField(target)) return;

    // Any special key during fill — flush fill, then fall through to emit press
    flushPendingFill();

    const cmds = target && target !== document.body && target !== document.documentElement
      ? buildCommands('press', target, { key: e.key })
      : { pw: `press ${e.key}`, js: `await page.keyboard.press(${escapeString(e.key)});` };
    if (cmds) {
      send({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
    }
  }

  function onFocusOutCapture(e) {
    if (pendingFill && e.target === pendingFill.el) {
      flushPendingFill();
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  window.__pwRecordCleanup = function () {
    flushPendingFill();
    window.__pw_recorder_active = false;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
    document.removeEventListener('change', onChangeCapture, true);
    document.removeEventListener('keydown', onKeyDownCapture, true);
    document.removeEventListener('focusout', onFocusOutCapture, true);
  };

  // ─── Navigation detection via Navigation API ──────────────────────────

  const nav = window.navigation;
  if (nav) {
    nav.addEventListener('navigate', (e) => {
      if (e.navigationType === 'traverse') {
        if (e.destination.index < (nav.currentEntry?.index ?? 0)) {
          send({ type: 'recorded-action', action: { pw: 'go-back', js: 'await page.goBack();' } });
        } else {
          const url = e.destination.url ?? '';
          send({ type: 'recorded-action', action: { pw: `goto "${url}"`, js: `await page.goto('${url}');` } });
        }
        send({ type: 'nav-handled' });
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────

  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('input', onInputCapture, true);
  document.addEventListener('change', onChangeCapture, true);
  document.addEventListener('keydown', onKeyDownCapture, true);
  document.addEventListener('focusout', onFocusOutCapture, true);
}
