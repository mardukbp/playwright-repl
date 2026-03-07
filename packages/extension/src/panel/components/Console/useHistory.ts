import { goUp, goDown } from '../../lib/command-history';

export function useHistory() {
    function goBack(_current: string): string | null {
        return goUp() ?? null;
    }

    function goForward(): string | null {
        const v = goDown();
        return v !== undefined ? v : null;
    }

    return { goBack, goForward };
}