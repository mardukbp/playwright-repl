import * as vscode from 'vscode';
import { BrowserManager } from './browser.js';
import { PlaywrightRepl } from './repl.js';

let browserManager: BrowserManager | undefined;
let repl: PlaywrightRepl | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Playwright IDE');
  outputChannel.appendLine('Playwright IDE activated');
  browserManager = new BrowserManager(outputChannel);

  // ─── Launch Browser ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.launchBrowser', async () => {
      if (browserManager!.isRunning()) {
        vscode.window.showInformationMessage('Browser is already running.');
        return;
      }
      try {
        const config = vscode.workspace.getConfiguration('playwright-ide');
        await browserManager!.launch({
          browser: config.get('browser', 'chromium'),
          bridgePort: config.get('bridgePort', 9876),
        });
        outputChannel.show();
        vscode.window.showInformationMessage('Playwright IDE: Browser launched.');

        // Auto-open REPL after launch
        if (!repl || repl.disposed) {
          repl = new PlaywrightRepl(browserManager!);
          repl.show();
        }
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to launch browser: ${(err as Error).message}`);
      }
    })
  );

  // ─── Open REPL ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.openRepl', () => {
      if (!browserManager?.isRunning()) {
        vscode.window.showWarningMessage('Launch browser first (Playwright IDE: Launch Browser).');
        return;
      }
      if (!repl || repl.disposed) {
        repl = new PlaywrightRepl(browserManager!);
      }
      repl.show();
    })
  );

  // ─── Run Test File ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.runTest', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active test file.');
        return;
      }
      if (!browserManager?.isRunning()) {
        vscode.window.showWarningMessage('Launch browser first.');
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const terminal = vscode.window.createTerminal({
        name: 'Playwright Test',
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });
      terminal.show();
      terminal.sendText(
        `npx playwright test "${filePath}" --config=playwright-ide.config.ts`,
        true
      );
    })
  );

  // ─── Stop Browser ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('playwright-ide.stopBrowser', async () => {
      if (browserManager?.isRunning()) {
        await browserManager.stop();
        vscode.window.showInformationMessage('Browser stopped.');
      }
    })
  );

  // ─── Cleanup on deactivation ─────────────────────────────────────────────
  context.subscriptions.push({
    dispose: () => {
      browserManager?.stop();
    }
  });
}

export function deactivate() {
  browserManager?.stop();
}
