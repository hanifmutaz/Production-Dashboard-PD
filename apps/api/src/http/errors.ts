import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string): AppError => new AppError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Silakan login terlebih dahulu'): AppError => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Anda tidak punya izin untuk aksi ini'): AppError => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Data tidak ditemukan'): AppError => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message = 'Data sudah diubah pengguna lain. Muat ulang lalu coba lagi.'): AppError =>
  new AppError(409, 'VERSION_CONFLICT', message);

/** Validasi input di batas (zod). Gagal → 400 dengan ringkasan field, tanpa detail internal. */
export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw badRequest(`Input tidak valid — ${detail}`);
  }
  return result.data;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Endpoint tidak ada: ${req.method} ${req.path}`));
};

/** Model error seragam {error:{code,message,requestId}}; tanpa stack/SQL/path internal. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = req.requestId;
  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, 'app error');
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Input tidak valid', requestId } });
    return;
  }
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : 500;
  if (status === 413) {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran data terlalu besar', requestId } });
    return;
  }
  if (status === 400) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Format request tidak valid', requestId } });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Terjadi kesalahan di server', requestId } });
};
