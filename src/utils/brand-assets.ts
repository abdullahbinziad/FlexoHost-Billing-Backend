import config from "../config";



const WEBP_MIME = 'image/webp';
    const baseUrl = config.frontendUrl;

const BRAND_LOGO_DARK_URL =
`${baseUrl}/_next/image?url=%2Fimg%2Fcompany%2FFlexoHostHorizontalforDark.webp&w=256&q=75`;


console.log('Brand logo URL for dark background:', BRAND_LOGO_DARK_URL);
 


export function getBrandLogoForDarkBackgroundDataUri(): string {
    return BRAND_LOGO_DARK_URL;
}

export function getBrandLogoForLightBackgroundDataUri(): string {
    return BRAND_LOGO_DARK_URL;
}

export function getEmailBrandLogoCid(): string {
    return BRAND_LOGO_DARK_URL;
}

/** Browser-renderable default for admin previews and sent emails. */
export function getBrandLogoUrl(): string {
    return getBrandLogoForDarkBackgroundDataUri();
}
