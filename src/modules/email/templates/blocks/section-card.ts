/**
 * SectionCard - Content container with subtle border and padding
 */

import { BRAND } from './brand';

export function renderSectionCard(content: string): string {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-section" style="background-color:${BRAND.bg}; border:1px solid ${BRAND.border}; border-radius:8px; margin-bottom:${BRAND.space.xl}px;">
  <tr>
    <td style="padding:${BRAND.space.xl}px; font-size:${BRAND.fontSize.base}px; line-height:1.65; color:${BRAND.text};">
      ${content}
    </td>
  </tr>
</table>`;
}
