import { createHash, randomBytes, randomInt } from 'node:crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar mudah diketik di iPad

export function newPairingCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  return out;
}
