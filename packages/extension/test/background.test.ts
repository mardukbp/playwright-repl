import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockPage: any;
let mockCrxApp: any;

vi.mock('@playwright-repl/playwright-crx/test', () => ({
  expect: vi.fn().mockReturnValue(new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@playwright-repl/playwright-crx', () => {
  mockPage = { url: vi.fn().mockReturnValue('https://example.com') };
  const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
  mockCrxApp = {
    attach: vi.fn().mockResolvedValue(mockPage),
    detach: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockReturnValue(mockContext),
    recorder: {
      show: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { crx: { start: vi.fn().mockResolvedValue(mockCrxApp) } };
});

vi.mock('../src/panel/lib/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ openAs: 'sidepanel' }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("background.ts message handlers", () => {
  let onMessageListener: (msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Reset playwright-crx mocks
    mockPage = { url: vi.fn().mockReturnValue('https://example.com') };
    const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
    mockCrxApp = {
      attach: vi.fn().mockResolvedValue(mockPage),
      detach: vi.fn().mockResolvedValue(undefined),
      context: vi.fn().mockReturnValue(mockContext),
      recorder: {
        show: vi.fn().mockResolvedValue(undefined),
        hide: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Override factory for this test
    const { crx } = await import('@playwright-repl/playwright-crx');
    (crx.start as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrxApp);

    // Set up chrome stubs
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 42, url: 'https://example.com' });
    (chrome.tabs as any).query = vi.fn().mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };

    const listeners: typeof onMessageListener[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn) => listeners.push(fn)) };

    vi.resetModules();

    await import('../src/background.js');
    onMessageListener = listeners[0];
  });

  function sendMessage(msg: any): Promise<any> {
    return new Promise((resolve) => {
      const ret = onMessageListener(msg, {}, resolve);
      if (ret === false) {
        // synchronous — resolve has already been called
      }
    });
  }

  // ─── health ───────────────────────────────────────────────────────────────

  it("health returns ok:false when crxApp not yet started", async () => {
    const result = await sendMessage({ type: 'health' });
    expect(result).toEqual({ ok: false });
  });

  it("health returns ok:true after successful attach", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    const result = await sendMessage({ type: 'health' });
    expect(result).toEqual({ ok: true });
  });

  // ─── attach ───────────────────────────────────────────────────────────────

  it("attach starts crxApp and attaches to tab", async () => {
    const { crx } = await import('@playwright-repl/playwright-crx');
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(crx.start).toHaveBeenCalled();
    expect(mockCrxApp.attach).toHaveBeenCalledWith(42);
    expect(result).toEqual({ ok: true, url: 'https://example.com' });
  });

  it("attach rejects chrome:// URLs", async () => {
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 1, url: 'chrome://settings' });
    const result = await sendMessage({ type: 'attach', tabId: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot attach to internal pages');
  });

  it("attach returns error when crxApp.attach throws", async () => {
    mockCrxApp.attach.mockRejectedValue(new Error('CDP failed'));
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CDP failed');
  });

  it("attach detaches from previous tab before attaching to new one", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    mockCrxApp.attach.mockResolvedValue({ url: vi.fn().mockReturnValue('https://new.com') });
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 99, url: 'https://new.com' });
    await sendMessage({ type: 'attach', tabId: 99 });
    expect(mockCrxApp.detach).toHaveBeenCalledWith(42);
  });

  // ─── record-start / record-stop ───────────────────────────────────────────

  it("record-start starts crxApp and calls recorder.show", async () => {
    const result = await sendMessage({ type: 'record-start' });
    expect(mockCrxApp.recorder.show).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'recording', language: 'javascript' })
    );
    expect(result).toEqual({ ok: true, url: expect.any(String) });
  });

  it("record-start returns ok:false when crx.start throws", async () => {
    const { crx } = await import('@playwright-repl/playwright-crx');
    (crx.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('crx init failed'));
    const result = await sendMessage({ type: 'record-start' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('crx init failed');
  });

  it("record-stop calls recorder.hide and returns ok:true", async () => {
    await sendMessage({ type: 'record-start' });
    const result = await sendMessage({ type: 'record-stop' });
    expect(mockCrxApp.recorder.hide).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
