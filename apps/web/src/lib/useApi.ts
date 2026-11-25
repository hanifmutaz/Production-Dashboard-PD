import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Envelope } from './api';

export interface ApiState<T> {
  readonly data: T | null;
  readonly status: string;
  readonly error: string;
  readonly loading: boolean;
  reload(): void;
}

/** GET data; url null = tidak memuat. Respons lama diabaikan bila url berganti (hindari balapan). */
export function useApi<T>(url: string | null, refreshKey?: string): ApiState<T> {
  const [state, setState] = useState<{ env: Envelope<T> | null; error: string; loading: boolean }>({
    env: null,
    error: '',
    loading: url !== null,
  });
  const seq = useRef(0);
  const load = useCallback(() => {
    if (url === null) return;
    const id = (seq.current += 1);
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get<T>(url)
      .then((env) => {
        if (id === seq.current) setState({ env, error: '', loading: false });
      })
      .catch((e: unknown) => {
        if (id === seq.current) setState({ env: null, error: e instanceof ApiError ? e.message : 'Data gagal dimuat.', loading: false });
      });
  }, [url]);
  useEffect(load, [load, refreshKey]);
  return { data: state.env?.data ?? null, status: state.env?.status ?? '', error: state.error, loading: state.loading, reload: load };
}
