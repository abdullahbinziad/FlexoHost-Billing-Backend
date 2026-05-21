import fs from 'fs';
import path from 'path';

const WEBP_MIME = 'image/webp';

function resolveBrandAsset(filename: string): string {
    const candidates = [
        path.resolve(process.cwd(), 'assets/brand', filename),
        path.resolve(process.cwd(), 'src/assets/brand', filename),
        path.resolve(__dirname, '../assets/brand', filename),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) throw new Error(`Brand asset not found: ${filename}`);
    return found;
}

function readBrandAsset(filename: string): Buffer {
    return fs.readFileSync(resolveBrandAsset(filename));
}

function dataUri(filename: string): string {
    return `data:${WEBP_MIME};base64,${readBrandAsset(filename).toString('base64')}`;
}

export function getBrandLogoForDarkBackground(): { filename: string; content: Buffer; contentType: string } {
    return {
        filename: 'FlexoHostHorizontalforDark.webp',
        content: readBrandAsset('FlexoHostHorizontalforDark.webp'),
        contentType: WEBP_MIME,
    };
}

export function getBrandLogoForDarkBackgroundDataUri(): string {
    return dataUri('FlexoHostHorizontalforDark.webp');
}

export function getBrandLogoForLightBackgroundDataUri(): string {
    return dataUri('FlexoHostHorizontalforLight.webp');
}

export function getEmailBrandLogoCid(): string {
    return 'cid:flexohost-brand-logo';
}

/** Browser-renderable default for admin previews; actual emails are converted to CID before sending. */
export function getBrandLogoUrl(): string {
    return getBrandLogoForDarkBackgroundDataUri();
}
