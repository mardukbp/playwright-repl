// Attaches the panel's debugger client to the extension's service worker target
// and evaluates expressions in the service worker's JS runtime.
// The panel is a separate context so it CAN see the SW in getTargets().

let swTargetId: string | null = null;

chrome.debugger.onDetach.addListener((source) => {
    if (source.targetId === swTargetId) swTargetId = null;
});

function findSwTarget(): Promise<string | null> {
    return new Promise(resolve => {
        chrome.debugger.getTargets(targets => {
            const sw = targets.find(t =>
                t.type === 'service_worker' &&
                t.extensionId === chrome.runtime.id
            );
            resolve(sw?.id ?? null);
        });
    });
}

async function ensureAttached(): Promise<string> {
    const targetId = await findSwTarget();
    if (!targetId) throw new Error('Service worker target not found. Try reloading the extension.');
    if (swTargetId === targetId) return targetId;
    await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ targetId }, '1.3', () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else { swTargetId = targetId; resolve(); }
        });
    });
    return targetId;
}

export async function swDebugEval(expression: string): Promise<unknown> {
    const targetId = await ensureAttached();
    const isMultiLine = expression.includes('\n');
    const wrapped = isMultiLine
        ? `(async () => {\n${expression}\n})()`
        : `(async () => { return (${expression}) })()`;
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.evaluate',
            { expression: wrapped, awaitPromise: true, returnByValue: false, generatePreview: true, objectGroup: 'console' },
            (result: any) => {
                if (chrome.runtime.lastError) {
                    swTargetId = null;
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (result?.exceptionDetails) {
                    const msg = result.exceptionDetails.exception?.description
                        ?? result.exceptionDetails.text
                        ?? 'Unknown error';
                    reject(new Error(msg));
                    return;
                }
                resolve(result);
            }
        );
    });
}
