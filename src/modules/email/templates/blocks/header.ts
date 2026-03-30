/**
 * EmailHeader - Brand header with gradient, logo and slogan
 */

import { escapeHtml } from '../../../../utils/string.util';
import type { BlockProps } from './block.types';
import { BRAND } from './brand';

const SLOGAN = '✅ FLEXIBLE, RELIABLE, AFFORDABLE - Web Hosting';

export function renderEmailHeader(props: BlockProps): string {
    const companyName = props.companyName || 'FlexoHost';
    const logoUrl = props.logoUrl;
    const websiteUrl = props.websiteUrl || '#';

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${BRAND.gradient}; background-color:${BRAND.gradientFallback};">
  <tr>
    <td align="center" class="email-header-padding" style="padding:${BRAND.space.xxl}px ${BRAND.space.xl}px ${BRAND.space.sm}px;">
      <a href="${websiteUrl}" target="_blank" style="text-decoration:none; display:inline-block;">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="${escapeHtml(companyName)}" class="email-logo" width="200" style="display:block;border:0;outline:none;text-decoration:none;max-width:200px;width:200px;height:auto;-ms-interpolation-mode:bicubic;" />`
        : `<span style="font-size:24px; font-weight:700; color:#ffffff;">${escapeHtml(companyName)}</span>`} 
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" class="email-slogan" style="padding:0 ${BRAND.space.xl}px ${BRAND.space.xxl}px; font-size:${BRAND.fontSize.xs}px; color:rgba(255,255,255,0.95); font-weight:600; letter-spacing:0.5px;">
      ${SLOGAN}
    </td>
  </tr>
</table>`;
}
