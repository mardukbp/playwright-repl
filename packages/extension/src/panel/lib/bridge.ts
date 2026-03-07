export type CommandResult = { text: string; isError: boolean; image?: string };
export type { CdpRemoteObject } from '../components/Console/cdpToSerialized';
import type { CdpRemoteObject } from '../components/Console/cdpToSerialized';
export type ConsoleCommandResult = { cdpResult: CdpRemoteObject } | { text: string; image?: string };

export async function cdpEvaluate(expression: string): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'cdp-evaluate', expression });
}

export async function cdpGetProperties(objectId: string): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'cdp-get-properties', objectId });
}

export async function executeCommand(command: string): Promise<CommandResult> {
  const { parseReplCommand } = await import('../../commands');
  const parsed = parseReplCommand(command);

  if ('error' in parsed) return { text: parsed.error, isError: true };
  if ('help' in parsed) return { text: parsed.help, isError: false };

  // DirectExecution — run the generated JS in the SW context where `page` is a live global
  const { swDebugEval } = await import('@/lib/sw-debugger');
  const { jsExpr } = parsed;

  let timer: ReturnType<typeof setTimeout>;
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Command timed out after 15s')), 15000);
      }),
    ]).finally(() => clearTimeout(timer!));

  try {
    const raw = await withTimeout(swDebugEval(jsExpr)) as { result?: { type?: string; value?: unknown; description?: string } };
    const r = raw?.result;

    if (!r || r.type === 'undefined') return { text: 'Done', isError: false };

    if (r.type === 'string') {
      const val = r.value as string;
      // Screenshot result is JSON-encoded { __image, mimeType }
      try {
        const obj = JSON.parse(val);
        if (obj && typeof obj === 'object' && '__image' in obj) {
          return { text: '', image: `data:${obj.mimeType};base64,${obj.__image}`, isError: false };
        }
      } catch { /* not JSON — treat as plain text */ }
      return { text: val, isError: false };
    }

    return { text: (r.description as string) ?? 'Done', isError: false };
  } catch (e: any) {
    return { text: e?.message ?? String(e), isError: true };
  }
}

/**
 * Like executeCommand but preserves the raw CDP result for object/array types.
 * Used by the Console's pw executor to render expandable ObjectTree entries.
 */
export async function executeCommandForConsole(command: string): Promise<ConsoleCommandResult> {
  const { parseReplCommand } = await import('../../commands');
  const parsed = parseReplCommand(command);

  if ('error' in parsed) throw new Error(parsed.error);
  if ('help' in parsed) return { text: parsed.help };

  const { swDebugEval } = await import('@/lib/sw-debugger');
  const { jsExpr } = parsed;

  let timer: ReturnType<typeof setTimeout>;
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Command timed out after 15s')), 15000);
      }),
    ]).finally(() => clearTimeout(timer!));

  const raw = await withTimeout(swDebugEval(jsExpr)) as { result?: CdpRemoteObject };
  const r = raw?.result;

  if (!r || r.type === 'undefined') return { text: 'Done' };

  if (r.type === 'string') {
    const val = r.value as string;
    try {
      const obj = JSON.parse(val);
      if (obj && typeof obj === 'object' && '__image' in obj) {
        return { text: '', image: `data:${(obj as any).mimeType};base64,${(obj as any).__image}` };
      }
    } catch { /* not JSON — treat as plain text */ }
    return { text: val };
  }

  if (r.type === 'number' || r.type === 'boolean') return { text: String(r.value) };

  // object, array, function — return raw CDP result so Console can render ObjectTree
  return { cdpResult: r };
}

export async function attachToTab(tabId: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  return chrome.runtime.sendMessage({ type: 'attach', tabId });
}

/**
 * Connects to the background service worker's recorder port with retry.
 * The port may not be ready immediately after record-start.
 */
export function connectWithRetry(maxRetries = 20, delay = 150): Promise<chrome.runtime.Port> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryConnect() {
      attempt++;
      const port = chrome.runtime.connect();
      let settled = false;
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError?.message;
        if (settled) return;
        settled = true;
        if (attempt < maxRetries) setTimeout(tryConnect, delay);
        else reject(new Error('Could not connect to recorder after retries'));
      });
      setTimeout(() => { if (!settled) { settled = true; resolve(port); } }, 100);
    }
    tryConnect();
  });
}
