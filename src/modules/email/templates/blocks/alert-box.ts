/**
 * AlertBox - Highlighted message box (info, warning, error, success)
 */

import type { AlertBoxProps } from './block.types';
import { BRAND } from './brand';

const VARIANT_STYLES: Record<AlertBoxProps['variant'], { bg: string; border: string; text: string }> = {
    info: { bg: '#e8f4fd', border: BRAND.primary, text: '#1e40af' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
    success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
};

export function renderAlertBox(props: AlertBoxProps): string {
    const { message, variant } = props;
    const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-alert" style="margin:${BRAND.space.md}px 0; background-color:${styles.bg}; border-left:4px solid ${styles.border}; border-radius:6px;">
  <tr>
    <td style="padding:${BRAND.space.md}px; font-size:${BRAND.fontSize.sm}px; color:${styles.text}; line-height:1.6;">
      ${message}
    </td>
  </tr>
</table>`;
}
