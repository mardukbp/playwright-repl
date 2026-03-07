import { useState } from 'react';
import type { ConsoleEntry, ConsoleExecutors } from './types';
import { COMMAND_NAMES, COMMANDS } from '@/lib/commands';
import { addCommand, getCommandHistory, clearHistory } from '@/lib/command-history';

const PW_COMMANDS = new Set(COMMAND_NAMES);

export function useConsole(executors: ConsoleExecutors) {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);

    function addEntry(entry: ConsoleEntry) {
        setEntries(prev => [...prev, entry]);
    }

    function updateEntry(id: string, patch: Partial<ConsoleEntry>) {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    }

    function clear() {
        setEntries([]);
    }

    function detectMode(input: string): 'playwright' | 'js' | 'pw' {
        const t = input.trim();
        if (executors.pw) {
            const firstToken = t.split(/\s+/)[0].toLowerCase();
            if (PW_COMMANDS.has(firstToken)) return 'pw';
        }
        if (t === 'page' || t.startsWith('page.') || t.startsWith('page[') ||
            t.startsWith('await page') ||
            t === 'expect' || t.startsWith('expect(') || t.startsWith('await expect(') ||
            t === 'crxApp' || t.startsWith('crxApp.') ||
            t === 'context' || t.startsWith('context.') || t.startsWith('await context') ||
            t === 'activeTabId') return 'playwright';
        return 'js';
    }

    async function execute(input: string) {
        const trimmed = input.trim();
        if (!trimmed) return;

        const id = Math.random().toString(36).slice(2);

        if (trimmed.startsWith('#')) {
            addEntry({ id, input: trimmed, status: 'done', text: trimmed });
            return;
        }
        if (trimmed.toLowerCase() === 'clear') {
            clear();
            return;
        }
        if (trimmed.toLowerCase() === 'help') {
            const lines = Object.entries(COMMANDS).map(([n, i]) => `  ${n.padEnd(22)} ${i.desc}`).join('\n');
            addEntry({ id, input: trimmed, status: 'done', text: `Available commands:\n${lines}` });
            return;
        }
        if (trimmed.toLowerCase() === 'history clear') {
            clearHistory();
            addEntry({ id, input: trimmed, status: 'done', text: 'History cleared.' });
            return;
        }
        if (trimmed.toLowerCase() === 'history') {
            const h = getCommandHistory();
            addEntry({ id, input: trimmed, status: 'done', text: h.length ? h.join('\n') : '(no history)' });
            return;
        }
        addCommand(trimmed);

        const mode = detectMode(trimmed);
        addEntry({ id, input: trimmed, status: 'pending' });

        try {
            const result = mode === 'playwright'
                ? await executors.playwright(trimmed)
                : mode === 'pw'
                ? await executors.pw!(trimmed)
                : await executors.js(trimmed);
            updateEntry(id, { status: 'done', value: result.value, text: result.text, image: result.image, getProperties: result.getProperties });
        } catch (e: any) {
            const raw = e?.message ?? String(e);
            // Strip stack trace and verbose "Call log:" section from Playwright assertion errors
            const errorText = raw.split('\n    at ')[0].split('\nCall log:')[0].trim();
            updateEntry(id, { status: 'error', errorText });
        }
    }

    function addResult({ input, value, text, image, getProperties }: { input: string; value?: ConsoleEntry['value']; text?: string; image?: string; getProperties?: ConsoleEntry['getProperties'] }) {
        const id = Math.random().toString(36).slice(2);
        addEntry({ id, input, status: 'done', value, text, image, getProperties });
    }

    return { entries, execute, clear, addResult };
}
