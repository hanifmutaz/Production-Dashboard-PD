import 'pino-http';
import type { Logger } from 'pino';

export type Permission =
  | 'dashboard.view'
  | 'dashboard.investigate'
  | 'meeting.use'
  | 'export.run'
  | 'config.edit'
  | 'users.manage'
  | 'devices.manage'
  | 'audit.view';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'dashboard.investigate',
  'meeting.use',
  'export.run',
  'config.edit',
  'users.manage',
  'devices.manage',
  'audit.view',
];

export interface Principal {
  readonly kind: 'user' | 'device';
  readonly id: number;
  readonly name: string;
  readonly roleCode: string;
  readonly permissions: ReadonlySet<Permission>;
  /** Lokasi yang boleh dilihat. Kosong = semua lokasi. */
  readonly locations: readonly string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    principal?: Principal;
  }
}

export type { Logger };
