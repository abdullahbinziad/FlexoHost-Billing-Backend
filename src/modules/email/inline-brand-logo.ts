/**
 * Keep the fixed backend brand logo as a direct image URL.
 * The source image is served by the frontend and should not be read from backend disk.
 */

import type { EmailAttachment } from './transport';

/** Kept for compatibility with older imports; new emails use a direct logo URL. */
export const EMAIL_BRAND_LOGO_CID = 'flexohost-brand-logo';

export function ensureEmailBrandLogoInline(html: string): {
    html: string;
    attachments: EmailAttachment[];
} {
    return {
        html,
        attachments: [],
    };
}
