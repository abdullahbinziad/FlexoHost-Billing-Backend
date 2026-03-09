/**
 * EmailFooter - Legal links, support contact, copyright
 */

import type { BlockProps } from './block.types';
import { BRAND } from './brand';

export function renderEmailFooter(props: BlockProps): string {
    const companyName = props.companyName || 'FlexoHost';
    const supportEmail = props.supportEmail || 'support@flexohost.com';
    const websiteUrl = props.websiteUrl || '#';

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BRAND.bgMuted}; margin-top:${BRAND.space.xxl}px; border-top:1px solid ${BRAND.border};">
  <tr>
    <td align="center" class="email-footer" style="padding:${BRAND.space.xl}px ${BRAND.space.lg}px;">
      <p style="margin:0 0 ${BRAND.space.xs}px; font-size:${BRAND.fontSize.xs}px; color:${BRAND.textMuted}; line-height:1.6;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </p>
      <p style="margin:0; font-size:${BRAND.fontSize.xs}px; color:${BRAND.textMuted};">
        <a href="mailto:${supportEmail}" style="color:${BRAND.primary}; text-decoration:none; font-weight:500;">Contact Support</a>
        &nbsp;|&nbsp;
        <a href="${websiteUrl}" style="color:${BRAND.primary}; text-decoration:none; font-weight:500;">Visit Website</a>
      </p>
    </td>
  </tr>
</table>`;
}
