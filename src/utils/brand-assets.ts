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
    if (!found) {
        throw new Error(`Brand asset not found: ${filename}`);
    }
    return found;
}

export function getBrandLogoForDarkBackground(): { filename: string; content: Buffer; contentType: string } {
    return {
        filename: 'FlexoHostHorizontalforDark.webp',
        content: fs.readFileSync(resolveBrandAsset('FlexoHostHorizontalforDark.webp')),
        contentType: WEBP_MIME,
    };
}

export function getBrandLogoForLightBackgroundDataUri(): string {
    const content = fs.readFileSync(resolveBrandAsset('FlexoHostHorizontalforLight.webp'));
    return `data:${WEBP_MIME};base64,${content.toString('base64')}`;
}

export function getEmailBrandLogoCid(): string {
    return 'cid:flexohost-brand-logo';
}
