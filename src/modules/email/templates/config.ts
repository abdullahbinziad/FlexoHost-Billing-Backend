/**
 * Default brand config - override via props when sending
 */

import config from '../../../config';
import type { BrandProps } from './types';

export const DEFAULT_BRAND: BrandProps = {
    companyName: 'FlexoHost',
    supportEmail: 'support@flexohost.com',
    websiteUrl: 'https://flexohost.com',
    logoUrl: config.email?.logoUrl,
};

export function mergeBrandProps<T extends Record<string, unknown> = Record<string, unknown>>(
    partial?: T
): T & BrandProps {
    return { ...DEFAULT_BRAND, ...partial } as T & BrandProps;
}
