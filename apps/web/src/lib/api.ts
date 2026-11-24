// Klien API v3. Cookie sesi httpOnly; request tulis wajib header CSRF (ADR-003).
/** Token perangkat kiosk (hasil pairing iPad). Disimpan di perangkat, dikirim sebagai header Authorization. */
export function deviceToken(): string | null {
  try {
    return localStorage.getItem('v3DeviceToken');
  } catch {
    return null;
  }
}

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
  const device = deviceToken();
  if (device) headers['authorization'] = `Device ${device}`;
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
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** POST yang mengembalikan file (ekspor). Error tetap memakai model {error}. */
export async function downloadFile(url: string, body: unknown): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-v3-csrf': '1' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.');
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Ekspor gagal.');
  }
  const cd = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? 'export';
  return { blob: await res.blob(), filename };
}
