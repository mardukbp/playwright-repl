#!/usr/bin/env node
/**
 * pw — drop-in replacement for npx playwright test
 *
 * Runs tests via standard Playwright test runner.
 * When VS Code provides a connectWsEndpoint, tests reuse the shared browser.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

// Resolve Playwright CLI from the user's project to avoid duplicate module instances
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
let pwCliPath: string;
try {
  pwCliPath = projectRequire.resolve('@playwright/test/cli');
} catch {
  pwCliPath = _require.resolve('@playwright/test/cli');
}

const args = process.argv.slice(2);
const subcommand = args[0];

// ─── Subcommands ─────────────────────────────────────────────────────────────

if (subcommand === 'repl') {
  const { handleRepl } = await import('./pw-repl.js');
  await handleRepl(args.slice(1));
  // handleRepl keeps process alive via node:repl — don't exit here
}

// ─── Default: test ───────────────────────────────────────────────────────────

if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
  args.unshift('test');
}

// Run tests via standard Playwright test runner
const child = spawn(process.execPath, [pwCliPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
