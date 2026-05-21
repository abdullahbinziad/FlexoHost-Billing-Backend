/**
 * Default brand config - override via props when sending.
 * All values loaded from config (no hardcoded URLs or brand strings).
 */

import config from '../../../config';
import { getBrandLogoForDarkBackgroundDataUri } from '../../../utils/brand-assets';
import type { BrandProps } from './types';

export const DEFAULT_BRAND: BrandProps = {
    companyName: config.app.companyName,
    supportEmail: config.app.supportEmail,
    websiteUrl: config.websiteUrl,
    logoUrl: getBrandLogoForDarkBackgroundDataUri(),
};

export function mergeBrandProps<T extends Record<string, unknown> = Record<string, unknown>>(
    partial?: T
): T & BrandProps {
    return { ...DEFAULT_BRAND, ...partial } as T & BrandProps;
}
