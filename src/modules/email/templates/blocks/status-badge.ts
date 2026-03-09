/**
 * StatusBadge - Inline status indicator
 */

import type { StatusBadgeProps } from './block.types';
import { BRAND } from './brand';

const VARIANT_STYLES: Record<StatusBadgeProps['variant'], { bg: string; color: string }> = {
    success: { bg: '#dcfce7', color: '#166534' },
    warning: { bg: '#fef3c7', color: '#92400e' },
    error: { bg: '#fee2e2', color: '#991b1b' },
    info: { bg: '#e8f4fd', color: BRAND.primaryDark },
};

export function renderStatusBadge(props: StatusBadgeProps): string {
    const { status, variant } = props;
    const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

    return `
<span class="email-status-badge" style="display:inline-block; padding:${BRAND.space.xs}px ${BRAND.space.sm}px; background-color:${styles.bg}; color:${styles.color}; font-size:${BRAND.fontSize.xs}px; font-weight:600; border-radius:9999px;">
  ${status}
</span>`;
}
