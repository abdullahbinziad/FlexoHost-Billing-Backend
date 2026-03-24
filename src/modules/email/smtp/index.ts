/**
 * SMTP feature module: outbound mail configuration (env), resolve/cache for nodemailer.
 */

export {
    resolveEmailSmtpConfig,
    invalidateEmailSmtpConfigCache,
    type ResolvedSmtpTls,
    type ResolvedEmailTransportConfig,
} from './smtp-config-resolve.service';
