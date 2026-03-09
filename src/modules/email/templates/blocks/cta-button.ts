/**
 * CTAButton - Primary call-to-action button with brand gradient
 */

import type { CTAButtonProps } from './block.types';
import { BRAND } from './brand';

export function renderCTAButton(props: CTAButtonProps): string {
    const { href, label } = props;

    return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-cta-wrapper" style="margin:${BRAND.space.xl}px 0;">
  <tr>
    <td>
      <a href="${href}" class="email-cta" style="display:inline-block; padding:${BRAND.space.md}px ${BRAND.space.xxl}px; background:${BRAND.gradient}; background-color:${BRAND.primaryDark}; color:#ffffff; text-decoration:none; font-size:${BRAND.fontSize.base}px; font-weight:600; border-radius:8px; box-shadow:0 2px 8px rgba(36,91,217,0.3); min-width:140px; text-align:center;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}
