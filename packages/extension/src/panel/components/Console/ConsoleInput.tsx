import { useRef, useEffect, useImperativeHandle, Ref } from 'react';
import { EditorView } from '@codemirror/view';
import { useHistory } from './useHistory';
import { consoleExtensions } from '../../lib/cm-console-setup';

export interface ConsoleInputHandle {
    focus: () => void;
}

interface Props {
    onSubmit: (value: string) => void;
    onClear:  () => void;
    ref?:     Ref<ConsoleInputHandle>;
}

export function ConsoleInput({ onSubmit, onClear, ref }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef      = useRef<EditorView | null>(null);
    const hist         = useHistory();

    // Refs so CM6 key handlers always call the latest callbacks
    const submitRef = useRef(onSubmit);
    const clearRef  = useRef(onClear);
    useEffect(() => { submitRef.current = onSubmit; }, [onSubmit]);
    useEffect(() => { clearRef.current  = onClear;  }, [onClear]);

    useEffect(() => {
        const view = new EditorView({
            extensions: consoleExtensions({
                onSubmit:    (v) => { hist.push(v); submitRef.current(v); },
                onClear:     ()  => clearRef.current(),
                histBack:    (c) => hist.goBack(c),
                histForward: ()  => hist.goForward(),
            }),
            parent: containerRef.current!,
        });
        viewRef.current = view;
        return () => view.destroy();
    }, []); // mount once — hist is stable (all refs internally)

    useImperativeHandle(ref, () => ({
        focus: () => viewRef.current?.focus(),
    }));

    return <div ref={containerRef} className="flex-1 min-w-0" />;
}
