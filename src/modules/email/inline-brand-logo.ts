/**
 * Embed the fixed backend brand logo as an inline CID attachment.
 * The source asset is copied from the frontend brand images and does not depend on env URLs.
 */

import type { EmailAttachment } from './transport';
import { getBrandLogoForDarkBackground } from '../../utils/brand-assets';

/** Nodemailer cid reference - must match <img src="cid:flexohost-brand-logo"> */
export const EMAIL_BRAND_LOGO_CID = 'flexohost-brand-logo';

const IMG_WITH_EMAIL_LOGO_RE = /<img\b[^>]*\bclass="[^"]*\bemail-logo\b[^"]*"[^>]*>/gi;
const cidRef = `cid:${EMAIL_BRAND_LOGO_CID}`;

export function ensureEmailBrandLogoInline(html: string): {
    html: string;
    attachments: EmailAttachment[];
} {
    IMG_WITH_EMAIL_LOGO_RE.lastIndex = 0;
    if (!IMG_WITH_EMAIL_LOGO_RE.test(html)) {
        return { html, attachments: [] };
    }

    IMG_WITH_EMAIL_LOGO_RE.lastIndex = 0;
    const replaced = html.replace(IMG_WITH_EMAIL_LOGO_RE, (tag) =>
        /\bsrc="/i.test(tag) ? tag.replace(/\bsrc="[^"]*"/i, `src="${cidRef}"`) : tag
    );

    const logo = getBrandLogoForDarkBackground();
    return {
        html: replaced,
        attachments: [
            {
                filename: logo.filename,
                content: logo.content,
                contentType: logo.contentType,
                cid: EMAIL_BRAND_LOGO_CID,
            },
        ],
    };
}
