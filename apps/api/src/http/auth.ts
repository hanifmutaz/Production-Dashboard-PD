import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from './errors.js';
import type { Permission, Principal } from './types.js';
import type { AuthService } from '../modules/auth/authService.js';

export const SESSION_COOKIE = 'v3_session';
export const CSRF_HEADER = 'x-v3-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Isi req.principal dari cookie sesi atau header `Authorization: Device <token>`. */
export function authenticate(auth: AuthService): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const cookies = (req as { cookies?: Record<string, string> }).cookies ?? {};
    const sessionToken = cookies[SESSION_COOKIE];
    const run = async (): Promise<void> => {
      if (header.startsWith('Device ')) {
        const p = await auth.resolveDevice(header.slice('Device '.length).trim());
        if (p) {
          if (p.screen === 'hub' || p.screen === 'executive') {
            const common = req.path === '/auth/me' || req.path === '/settings';
            const view = p.screen === 'executive'
              ? req.path === '/executive/month'
              : ['/reporting/summary/range', '/reporting/trend/range'].includes(req.path)
                && req.query['location'] === 'internal' && req.query['line'] === undefined;
            if (req.baseUrl !== '/api/v3' || req.method !== 'GET' || !(common || view)) throw forbidden('Akses terbatas pada layar TV terdaftar');
          }
          req.principal = p;
        }
        return;
      }
      if (sessionToken) {
        const p = await auth.resolveSession(sessionToken);
        if (p) {
          // Proteksi CSRF untuk auth berbasis cookie: request tulis wajib membawa header kustom.
          if (!SAFE_METHODS.has(req.method) && req.get(CSRF_HEADER) !== '1') throw forbidden('Header CSRF tidak ada');
          req.principal = p;
        }
      }
    };
    run().then(() => next(), next);
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.principal ? undefined : unauthorized());
};

/** Otorisasi server-side (INV-004). Perangkat kiosk selalu read-only. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const p = req.principal;
    if (!p) return next(unauthorized());
    if (p.kind === 'device' && !SAFE_METHODS.has(req.method)) return next(forbidden('Perangkat kiosk hanya bisa melihat'));
    if (!p.permissions.has(permission)) return next(forbidden());
    next();
  };
}

/** Cakupan lokasi: kosong = semua lokasi. */
export function canSeeLocation(locations: readonly string[], location: string): boolean {
  return locations.length === 0 || locations.includes(location);
}

/** Ambil principal yang sudah dijamin requireAuth; tanpa non-null assertion. */
export function principalOf(req: { principal?: Principal | undefined }): Principal {
  if (!req.principal) throw unauthorized();
  return req.principal;
}
