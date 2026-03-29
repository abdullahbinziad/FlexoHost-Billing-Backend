/**
 * AES-256-GCM encryption for SMTP passwords stored in BillingSettings.
 * Legacy plaintext values (no prefix) are still supported for read/decrypt.
 */

import crypto from 'crypto';
import config from '../../../config';

const PREFIX = 'enc:v1:';

function deriveKey(): Buffer | null {
    const secret = config.security.settingsEncryptionKey?.trim();
    if (!secret) {
        return null;
    }
    return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypt before persisting. If SETTINGS_ENCRYPTION_KEY is unset, returns plaintext (development only — set the key in production).
 */
export function encryptSmtpPasswordForStorage(plain: string): string {
    if (!plain) return plain;
    const key = deriveKey();
    if (!key) {
        return plain;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, enc]);
    return PREFIX + payload.toString('base64');
}

/**
 * Decrypt for sending mail. Legacy plaintext (no prefix) is returned as-is.
 */
export function decryptSmtpPasswordForUse(stored: string | undefined | null): string {
    if (stored == null || stored === '') {
        return '';
    }
    if (!stored.startsWith(PREFIX)) {
        return stored;
    }
    const key = deriveKey();
    if (!key) {
        return '';
    }
    try {
        const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const data = raw.subarray(28);
        const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
        dec.setAuthTag(tag);
        return Buffer.concat([dec.update(data), dec.final()]).toString('utf8');
    } catch {
        return '';
    }
}

export function isSmtpPasswordEncrypted(stored: string | undefined | null): boolean {
    return typeof stored === 'string' && stored.startsWith(PREFIX);
}
