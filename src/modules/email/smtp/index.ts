/**
 * SMTP feature module: outbound mail configuration (env + dashboard), password crypto, resolve/cache for nodemailer.
 */

export {
    encryptSmtpPasswordForStorage,
    decryptSmtpPasswordForUse,
    isSmtpPasswordEncrypted,
} from './smtp-password-crypto';

export {
    resolveEmailSmtpConfig,
    invalidateEmailSmtpConfigCache,
    type ResolvedSmtpTls,
    type ResolvedEmailTransportConfig,
} from './smtp-config-resolve.service';
