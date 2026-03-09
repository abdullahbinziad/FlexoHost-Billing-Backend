/**
 * GreetingBlock - Personalized greeting at top of email
 */

import type { GreetingBlockProps } from './block.types';
import { BRAND } from './brand';

export function renderGreetingBlock(props: GreetingBlockProps): string {
    const { name, greeting = 'Hello' } = props;

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-greeting" style="margin:0 0 ${BRAND.space.xl}px;">
  <tr>
    <td style="padding:${BRAND.space.lg}px ${BRAND.space.xl}px; font-size:${BRAND.fontSize.lg}px; color:${BRAND.text}; line-height:1.6; font-weight:600;">
      ${greeting}, ${name}!
    </td>
  </tr>
</table>`;
}
