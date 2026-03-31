/**
 * Embed the header brand logo as an inline (CID) attachment so clients don't
 * fetch remote URLs (WebP/ICO often render corrupted in Outlook and some webmail).
 */

import fetch from 'node-fetch';
import logger from '../../utils/logger';
import type { EmailAttachment } from './transport';

/** Nodemailer cid reference — must match <img src="cid:flexohost-brand-logo"> */
export const EMAIL_BRAND_LOGO_CID = 'flexohost-brand-logo';

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

const IMG_WITH_EMAIL_LOGO_RE = /<img\b[^>]*\bclass="[^"]*\bemail-logo\b[^"]*"[^>]*>/gi;

function getAttribute(tag: string, name: string): string | null {
    const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
    return tag.match(re)?.[1] ?? null;
}

function decodeImgSrc(src: string): string {
    return src.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
}

/**
 * Logo `<img>` may list `class` before or after `src`; scan tags with email-logo.
 */
export function extractEmailLogoSrc(html: string): string | null {
    IMG_WITH_EMAIL_LOGO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMG_WITH_EMAIL_LOGO_RE.exec(html)) !== null) {
        const srcRaw = getAttribute(m[0], 'src');
        if (!srcRaw) continue;
        const raw = decodeImgSrc(srcRaw).trim();
        if (raw.toLowerCase().startsWith('http')) return raw;
    }
    return null;
}

function mimeFromExtension(ext: string): string | undefined {
    switch (ext) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        default:
            return undefined;
    }
}

function extensionFromBuffer(buf: Buffer, contentType: string | undefined): string {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('png')) return 'png';
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('gif')) return 'gif';
    if (ct.includes('x-icon') || ct.includes('ico')) return 'ico';

    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF87a') return 'gif';
    if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
    return 'bin';
}

/**
 * Ask Cloudinary to deliver PNG (better Outlook / legacy clients) when inlining.
 */
function cloudinaryFetchUrl(url: string): string {
    const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i);
    if (!m) return url;
    const rest = m[2];
    if (/^f_[^/]+/i.test(rest)) return url;
    return `${m[1]}f_png/${rest}`;
}

/**
 * Replace remote logo URL in HTML with cid: and return attachment; no-op on failure.
 */
export async function inlineEmailBrandLogo(html: string): Promise<{
    html: string;
    attachments: EmailAttachment[];
}> {
    const remoteUrl = extractEmailLogoSrc(html);
    if (!remoteUrl) return { html, attachments: [] };

    const fetchUrl = cloudinaryFetchUrl(remoteUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(fetchUrl, {
            signal: controller.signal as any,
            headers: {
                Accept: 'image/*,*/*;q=0.8',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) {
            logger.warn(`[Email] Logo fetch failed ${res.status} for ${remoteUrl.slice(0, 80)}`);
            return { html, attachments: [] };
        }

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_BYTES) {
            logger.warn(`[Email] Logo fetch empty or too large (${buf.length} bytes): ${remoteUrl.slice(0, 80)}`);
            return { html, attachments: [] };
        }

        const ext = extensionFromBuffer(buf, res.headers.get('content-type') || undefined);
        const filename = ext === 'bin' ? 'logo' : `logo.${ext}`;
        const contentType = mimeFromExtension(ext);

        const cidRef = `cid:${EMAIL_BRAND_LOGO_CID}`;
        const replaced = html.replace(IMG_WITH_EMAIL_LOGO_RE, (tag) =>
            /\bsrc="/i.test(tag) ? tag.replace(/\bsrc="[^"]*"/i, `src="${cidRef}"`) : tag
        );
        IMG_WITH_EMAIL_LOGO_RE.lastIndex = 0;
        if (replaced === html) {
            logger.warn('[Email] Logo img not updated for inline (missing email-logo / src?)');
            return { html, attachments: [] };
        }

        return {
            html: replaced,
            attachments: [
                {
                    filename,
                    content: buf,
                    cid: EMAIL_BRAND_LOGO_CID,
                    ...(contentType ? { contentType } : {}),
                },
            ],
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[Email] Logo inline skipped (${msg}) for ${remoteUrl.slice(0, 80)}`);
        return { html, attachments: [] };
    } finally {
        clearTimeout(timer);
    }
}
