import { useState } from 'react';
import { ObjectTree } from './ObjectTree';
import Lightbox from '../Lightbox';
import type { ConsoleEntry as Entry } from './types';

export function ConsoleEntry({ entry }: { entry: Entry }) {
    const [lightbox, setLightbox] = useState(false);

    return (
        <div className="flex items-start gap-1 py-0.5 pb-1 border-b border-(--border-primary) last:border-b-0" data-status={entry.status}>
            <span className="text-(--color-prompt) shrink-0">{'>'}</span>
            <div className="flex-1 min-w-0">
                {entry.input.split('\n').map((line, i) => (
                    <div key={i} className="text-(--color-command)">{line}</div>
                ))}
                {entry.status === 'pending' && (
                    <div className="text-(--text-dim) pt-0.5">…</div>
                )}
                {entry.status === 'done' && (
                    <div className="pt-0.5">
                        {entry.value !== undefined ? (
                            <ObjectTree data={entry.value} getProperties={entry.getProperties} />
                        ) : entry.codeBlock !== undefined ? (
                            <div className="relative border border-(--border-primary) rounded p-2 my-1 bg-(--color-surface)">
                                <button
                                    className="absolute top-1 right-1 text-xs px-1 py-0.5 border border-(--border-primary) rounded hover:opacity-70 cursor-pointer"
                                    onClick={() => navigator.clipboard.writeText(entry.codeBlock!)}
                                >Copy</button>
                                <pre className="overflow-auto text-xs whitespace-pre max-h-64 pr-12">{entry.codeBlock}</pre>
                            </div>
                        ) : entry.image !== undefined ? (
                            <>
                                <img
                                    src={entry.image}
                                    className="max-w-100 cursor-zoom-in rounded"
                                    onClick={() => setLightbox(true)}
                                />
                                {lightbox && <Lightbox image={entry.image} onClose={() => setLightbox(false)} />}
                            </>
                        ) : (
                            <span className="text-(--color-success)">{entry.text}</span>
                        )}
                    </div>
                )}
                {entry.status === 'error' && (
                    <div className="pt-0.5 text-(--color-error) whitespace-pre-wrap">{entry.errorText}</div>
                )}
            </div>
        </div>
    );
}
