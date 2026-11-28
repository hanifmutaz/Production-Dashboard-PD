import { eachDate, isIsoDate, TEMPAT_LIST, validLocationScope } from '@v3/shared';
import { z } from 'zod';

export const isoDate = z.string().refine(isIsoDate, 'format tanggal harus YYYY-MM-DD dan valid');
export const tempat = z.enum(TEMPAT_LIST as [string, ...string[]]);
export const locationScope = z.array(tempat).refine(validLocationScope, 'Pilih satu lokasi atau seluruh lokasi secara eksplisit');
export const lineCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, 'hanya huruf, angka, _ dan -');
export const year = z.coerce.number().int().min(2000).max(2100);
export const month = z.coerce.number().int().min(1).max(12);

const MAX_RANGE_DAYS = 366;

export const rangeQuery = z
  .object({ start: isoDate, end: isoDate, location: tempat.optional(), line: lineCode.optional() })
  .refine((q) => q.start <= q.end, 'start harus ≤ end')
  .refine((q) => eachDate(q.start, q.end).length <= MAX_RANGE_DAYS, `rentang maksimal ${MAX_RANGE_DAYS} hari`);

export const versionField = z.number().int().positive().optional();
