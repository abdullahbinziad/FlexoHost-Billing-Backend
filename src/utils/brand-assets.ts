import config from '../config';

const BRAND_LOGO_DARK_URL =
    `${config.frontendUrl}/_next/image?url=%2Fimg%2Fcompany%2FFlexoHostHorizontalforDark.webp&w=256&q=75`;

export function getBrandLogoForDarkBackgroundDataUri(): string {
    return BRAND_LOGO_DARK_URL;
}

