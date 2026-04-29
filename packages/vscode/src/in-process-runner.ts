/**
 * In-process test runner for relay mode.
 *
 * Compiles test files via esbuild, aliases @playwright/test to an inline shim,
 * and executes via AsyncFunction('page', 'context', 'expect', script) — the
 * same execution path as BrowserManager._execExpr / runScript.
 *
 * Class-based: each runTestFile() call uses a fresh instance — no module-level
 * mutable state, no leaks between calls.
 */

import { createRequire } from 'node:module';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ─── Public types ────────────────────────────────────────────────────────────

export interface InProcessTestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: string;
  duration: number;
}

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─── Inline shim ─────────────────────────────────────────────────────────────
//
// Loaded by esbuild's virtual-file plugin when test files import '@playwright/test'.
// References page/context/expect from the enclosing AsyncFunction parameters —
// no globalThis pollution.

const SHIM_CODE = `
// ── State (fresh per bundle) ───────────────────────────────────────────
let rootSuite = { name: '', tests: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], children: [] };
let currentSuite = rootSuite;
let hasOnly = false;

class SkipError extends Error { constructor() { super('SKIP'); this.name = 'SkipError'; } }

// ── Registration ───────────────────────────────────────────────────────
function test(name, fnOrOpts, maybeFn) {
  const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn;
  currentSuite.tests.push({ name, fn, only: false, skip: false });
}

test.only = (name, fnOrOpts, maybeFn) => {
  const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn;
  hasOnly = true;
  currentSuite.tests.push({ name, fn, only: true, skip: false });
};

test.skip = (nameOrCond, fnOrOpts, maybeFn) => {
  if (typeof nameOrCond === 'string') {
    const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn;
    currentSuite.tests.push({ name: nameOrCond, fn, only: false, skip: true });
  } else if (nameOrCond) {
    throw new SkipError();
  }
};

test.describe = (name, fn) => {
  const suite = { name, tests: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], children: [] };
  currentSuite.children.push(suite);
  const parent = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = parent;
};
test.describe.configure = () => {};

test.fixme = (condOrName, fn) => {
  if (typeof condOrName === 'string') return test.skip(condOrName, fn);
  if (condOrName) throw new SkipError();
};
test.slow = () => {};
test.info = () => ({ annotations: [] });
test.use = () => {};

test.beforeAll  = (fn) => { currentSuite.beforeAll.push(fn); };
test.afterAll   = (fn) => { currentSuite.afterAll.push(fn); };
test.beforeEach = (fn) => { currentSuite.beforeEach.push(fn); };
test.afterEach  = (fn) => { currentSuite.afterEach.push(fn); };

test.extend = (fixtures) => {
  const ext = (name, fnOrOpts, maybeFn) => {
    const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn;
    currentSuite.tests.push({
      name, only: false, skip: false,
      fn: async (baseFixtures) => {
        const extended = { ...baseFixtures };
        for (const [key, fixtureFn] of Object.entries(fixtures)) {
          if (typeof fixtureFn === 'function') {
            await new Promise((resolve, reject) => {
              Promise.resolve(fixtureFn(
                { ...extended, [key]: extended[key] },
                (value) => { extended[key] = value; resolve(); },
              )).catch(reject);
            });
          }
        }
        await fn(extended);
      },
    });
  };
  ext.only = test.only;
  ext.skip = test.skip;
  ext.describe = test.describe;
  ext.beforeAll = test.beforeAll;
  ext.afterAll = test.afterAll;
  ext.beforeEach = test.beforeEach;
  ext.afterEach = test.afterEach;
  ext.extend = test.extend;
  ext.fixme = test.fixme;
  ext.slow = test.slow;
  ext.info = test.info;
  ext.use = test.use;
  return ext;
};

// ── Runner ─────────────────────────────────────────────────────────────
async function __pwRunSuite(suite, parentBeforeEach, parentAfterEach, prefix, grep, fixtures, timeout) {
  const results = [];
  const allBeforeEach = [...parentBeforeEach, ...suite.beforeEach];
  const allAfterEach  = [...suite.afterEach, ...parentAfterEach];

  for (const fn of suite.beforeAll) await fn(fixtures);

  for (const t of suite.tests) {
    const fullName = prefix ? prefix + ' > ' + t.name : t.name;
    if (t.skip || (hasOnly && !t.only) || (grep && !grep.test(fullName))) {
      results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      continue;
    }
    const start = Date.now();
    try {
      for (const fn of allBeforeEach) await fn(fixtures);
      await Promise.race([
        t.fn(fixtures),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout of ' + timeout + 'ms exceeded')), timeout)),
      ]);
      for (const fn of allAfterEach) await fn(fixtures);
      results.push({ name: fullName, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err) {
      if (err && err.name === 'SkipError') {
        results.push({ name: fullName, passed: true, skipped: true, duration: 0 });
      } else {
        results.push({ name: fullName, passed: false, skipped: false, error: (err && err.message) || String(err), duration: Date.now() - start });
      }
    }
  }

  for (const child of suite.children) {
    const childPrefix = prefix ? prefix + ' > ' + child.name : child.name;
    results.push(...await __pwRunSuite(child, allBeforeEach, allAfterEach, childPrefix, grep, fixtures, timeout));
  }

  for (const fn of suite.afterAll) await fn(fixtures);
  return results;
}

// Install runner on globalThis — only thing we put there.
// page/context/expect come from AsyncFunction params at call time.
globalThis.__pw_runTests = (fixtures, grep, timeout) =>
  __pwRunSuite(rootSuite, [], [], '', grep, fixtures, timeout || 30000);

// ── Exports (consumed by the test file's import) ───────────────────────
export { test };
// __expectFn is defined in the outer AsyncFunction scope before the IIFE runs.
export const expect = (...args) => __expectFn(...args);
`;

// ─── Build the execution script ──────────────────────────────────────────────
//
// The compiled IIFE registers tests synchronously. Then we call the runner
// with page/context/expect from the AsyncFunction parameters — same as _execExpr.

function buildScript(compiledIIFE: string, grepSource?: string): string {
  const grepArg = grepSource ? `new RegExp(${JSON.stringify(grepSource)})` : 'null';
  // __expectFn bridges the AsyncFunction's expect param into the IIFE scope.
  // The IIFE registers tests and installs __pw_runTests on globalThis.
  return `
const __expectFn = expect;
${compiledIIFE}
return await globalThis.__pw_runTests({ page, context, expect }, ${grepArg}, 30000);
`;
}

// ─── InProcessRunner ─────────────────────────────────────────────────────────

export class InProcessRunner {
  private _page: unknown;
  private _context: unknown;
  private _expect: unknown;
  private _log: Logger;

  constructor(page: unknown, context: unknown, expect: unknown, log: Logger) {
    this._page = page;
    this._context = context;
    this._expect = expect;
    this._log = log;
  }

  /**
   * Compile and run a single test file against the shared page.
   * Executes via AsyncFunction('page', 'context', 'expect', script) —
   * same path as BrowserManager._execExpr / runScript.
   */
  async runTestFile(filePath: string, grep?: RegExp): Promise<InProcessTestResult[]> {
    const compiled = await this._compile(filePath);
    const script = buildScript(compiled, grep?.source);

    // Execute exactly like _execExpr: AsyncFunction with page/context/expect as params
    const fn = new AsyncFunction('page', 'context', 'expect', script);
    return await fn(this._page, this._context, this._expect);
  }

  // ─── Compilation ─────────────────────────────────────────────────────────

  private async _compile(filePath: string): Promise<string> {
    const esbuild = this._resolveEsbuild(filePath);

    const shimPlugin = {
      name: 'pw-inprocess-shim',
      setup(build: { onResolve: Function; onLoad: Function }) {
        build.onResolve(
          { filter: /^@playwright\/test$/ },
          () => ({ path: '@playwright/test', namespace: 'pw-shim' }),
        );
        build.onLoad(
          { filter: /.*/, namespace: 'pw-shim' },
          () => ({ contents: SHIM_CODE, loader: 'js' }),
        );
      },
    };

    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'node',
      plugins: [shimPlugin],
      // Node built-ins are external — tests may import fs, path, etc.
      external: [
        'fs', 'path', 'child_process', 'os', 'crypto', 'util',
        'stream', 'events', 'net', 'http', 'https', 'url',
        'assert', 'buffer', 'module', 'worker_threads', 'zlib',
      ],
    });

    return result.outputFiles[0].text;
  }

  private _resolveEsbuild(filePath: string): { build: Function } {
    // Try workspace's node_modules first (every @playwright/test project has it)
    const projectRequire = createRequire(filePath);
    try {
      return projectRequire('esbuild');
    } catch {
      // Fallback: try from the extension's own dependencies
      const extRequire = createRequire(__filename);
      try {
        return extRequire('esbuild');
      } catch {
        throw new Error('esbuild not found — install it in your project or globally');
      }
    }
  }
}
