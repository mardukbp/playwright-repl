import { useImperativeHandle, useRef, useEffect, useMemo, Ref } from 'react';
import { useConsole } from './useConsole';
import { ConsoleOutput } from './ConsoleOutput';
import { ConsoleInput, type ConsoleInputHandle } from './ConsoleInput';
import type { ConsoleHandle, ConsoleProps, ConsoleEntry } from './types';
import type { OutputLine } from '@/types';

export { type ConsoleHandle } from './types';

function outputLinesToEntries(lines: OutputLine[]): ConsoleEntry[] {
    const entries: ConsoleEntry[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const id = `ol-${i}`;
        if (line.type === 'command') {
            const next = lines[i + 1];
            if (next && next.type !== 'command' && next.type !== 'comment') {
                const entry: ConsoleEntry = { id, input: line.text, status: next.type === 'error' ? 'error' : 'done' };
                if (next.type === 'success') entry.text = next.text;
                else if (next.type === 'error') entry.errorText = next.text;
                else if (next.type === 'snapshot' || next.type === 'code-block') entry.codeBlock = next.text;
                else if (next.type === 'screenshot') entry.image = next.image;
                entries.push(entry);
                i += 2;
            } else {
                entries.push({ id, input: line.text, status: 'done' });
                i++;
            }
        } else if (line.type === 'comment') {
            entries.push({ id, input: line.text, status: 'done' });
            i++;
        } else if (line.type === 'info') {
            entries.push({ id, input: '', status: 'done', text: line.text });
            i++;
        } else {
            i++;
        }
    }
    return entries;
}

interface Props extends ConsoleProps {
    ref?: Ref<ConsoleHandle>;
}

export function Console({ outputLines, className, ref }: Props) {
    const { entries, execute, clear, addResult } = useConsole();
    const historicalEntries = useMemo(() => outputLinesToEntries(outputLines ?? []), [outputLines]);
    const inputRef = useRef<ConsoleInputHandle>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({ clear, addResult }));

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }, [entries]);

    return (
        <div className={`flex flex-col flex-1 min-h-20 overflow-hidden ${className ?? ''}`} data-testid="console-pane">
            <div className="flex-1 overflow-y-auto py-1 px-2">
                <ConsoleOutput entries={[...historicalEntries, ...entries]} />
                <div className="flex items-start gap-1 py-0.5">
                    <span className="text-(--color-prompt) shrink-0">&gt;</span>
                    <ConsoleInput ref={inputRef} onSubmit={execute} onClear={clear} />
                </div>
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
