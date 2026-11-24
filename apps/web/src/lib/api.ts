// Klien API v3. Cookie sesi httpOnly; request tulis wajib header CSRF (ADR-003).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Envelope<T> {
  readonly data: T | null;
  readonly status: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<Envelope<T>> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-v3-csrf'] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers, credentials: 'same-origin', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.');
  }
  if (res.status === 204) return { data: null, status: 'ok' };
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Terjadi kesalahan. Coba lagi.');
  }
  return json as Envelope<T>;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
};
