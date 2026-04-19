import crypto from 'crypto';
import config from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
    const secret =
        (config.security.encryptionKey && config.security.encryptionKey.trim()) ||
        config.jwt.secret ||
        'fallback-do-not-use-in-production';
    if (secret === 'fallback-do-not-use-in-production' && config.env === 'production') {
        throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set in production');
    }
    if (secret === 'fallback-do-not-use-in-production') {
        console.warn('Encryption: set ENCRYPTION_KEY or JWT_SECRET for production');
    }
    return crypto.scryptSync(secret, 'whm-token-salt', KEY_LENGTH);
}

/**
 * Encrypt a string (e.g. WHM API token). Safe for DB storage.
 */
export function encrypt(plainText: string): string {
    if (!plainText) return '';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a string stored by encrypt().
 */
export function decrypt(cipherText: string): string {
    if (!cipherText) return '';
    const key = getEncryptionKey();
    const buf = Buffer.from(cipherText, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Returns true if the value looks like an encrypted blob (base64 with expected length).
 */
export function isEncrypted(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    try {
        const buf = Buffer.from(value, 'base64');
        return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH;
    } catch {
        return false;
    }
}
