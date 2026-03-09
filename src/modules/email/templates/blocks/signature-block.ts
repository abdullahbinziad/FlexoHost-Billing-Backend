/**
 * SignatureBlock - Closing signature with optional signer info
 */

import type { SignatureBlockProps } from './block.types';
import { BRAND } from './brand';

export function renderSignatureBlock(props: SignatureBlockProps): string {
    const signerName = props.signerName || 'The FlexoHost Team';
    const signerTitle = props.signerTitle || 'Customer Support';

    return `
<p class="email-signature" style="margin:${BRAND.space.xl}px 0 0; font-size:${BRAND.fontSize.sm}px; color:${BRAND.textMuted}; line-height:1.6;">
  Best regards,<br/>
  <strong style="color:${BRAND.text};">${signerName}</strong><br/>
  ${signerTitle}
</p>`;
}
