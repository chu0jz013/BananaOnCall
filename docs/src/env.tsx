import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** The three things a reader might actually be deploying. */
export type Env = 'local' | 'aws' | 'docs';

export const ENVS: Env[] = ['local', 'aws', 'docs'];

const KEY = 'bananaoncall.env';

function stored(): Env | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'local' || v === 'aws' || v === 'docs' ? v : null;
  } catch {
    return null;
  }
}

interface EnvValue {
  readonly env: Env;
  readonly setEnv: (e: Env) => void;
}

const EnvContext = createContext<EnvValue | null>(null);

/**
 * One switch rewrites every command on the Deployment page, and the choice
 * follows the reader to the other pages — so a self-hoster is not re-picking
 * "real AWS" on every visit.
 */
export function EnvProvider({ children }: { children: ReactNode }) {
  const [env, setEnvState] = useState<Env>(() => stored() ?? 'local');

  const setEnv = useCallback((e: Env) => {
    setEnvState(e);
    try {
      localStorage.setItem(KEY, e);
    } catch {
      // Not remembering it is no reason to fail to apply it.
    }
  }, []);

  const value = useMemo(() => ({ env, setEnv }), [env, setEnv]);
  return <EnvContext value={value}>{children}</EnvContext>;
}

export function useEnv(): EnvValue {
  const v = useContext(EnvContext);
  if (!v) throw new Error('useEnv must be used inside <EnvProvider>');
  return v;
}
