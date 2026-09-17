import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;

// Shared by every place a new/replacement password is accepted (admin
// create/reset in lib/actions/users.ts, self-service change in
// lib/actions/account.ts) so the rule can't drift between them.
export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

// Node's own recommendation for password hashing without a third-party
// dependency (bcrypt/argon2) — this project has stayed dependency-minimal
// throughout (e.g. the CSV export in src/lib/reporting.ts is hand-built
// rather than pulling in an xlsx library). Stored as "salt:hash", both hex,
// so verifyPassword needs nothing but the one stored string.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Constant-time comparison (timingSafeEqual) so a failed check doesn't leak
// how many leading bytes matched via response-time differences. Malformed
// stored hashes (wrong shape, wrong length) fail closed rather than
// throwing.
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== KEY_LENGTH) return false;
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derivedKey, storedBuffer);
}
