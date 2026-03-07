export type SerializedValue =
  | { __type: 'null' }
  | { __type: 'undefined' }
  | { __type: 'string';   v: string }
  | { __type: 'number';   v: number }
  | { __type: 'boolean';  v: boolean }
  | { __type: 'function'; name: string }
  | { __type: 'object';   cls: string; props: Record<string, SerializedValue>; objectId?: string }
  | { __type: 'array';    cls: string; len: number; props: Record<string, SerializedValue>; objectId?: string }
  | { __type: 'ref';      cls: string; objectId?: string }
  | { __type: 'circular' }
  | { __type: 'error' };

export interface ConsoleEntry {
  id: string;
  input: string;
  status: 'pending' | 'done' | 'error';
  value?: SerializedValue;
  text?: string;
  image?: string;
  codeBlock?: string;
  errorText?: string;
  getProperties?: (objectId: string) => Promise<unknown>;
}

type ExecutorResult = { value?: SerializedValue; text?: string; image?: string; codeBlock?: string; getProperties?: (objectId: string) => Promise<unknown> };

export interface ConsoleExecutors {
  playwright: (code: string) => Promise<ExecutorResult>;
  js: (expression: string) => Promise<ExecutorResult>;
  pw?: (command: string) => Promise<ExecutorResult>;
}

export interface ConsoleHandle {
  clear: () => void;
  addResult: (result: ExecutorResult & { input: string }) => void;
}

export interface ConsoleProps {
  executors: ConsoleExecutors;
  className?: string;
}
