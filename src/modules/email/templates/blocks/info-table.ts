/**
 * InfoTable - Key-value pairs in a clean table layout
 */

import type { InfoTableProps } from './block.types';
import { BRAND } from './brand';

export function renderInfoTable(props: InfoTableProps): string {
    const { rows, title } = props;

    const rowsHtml = rows
        .map(
            (row) => `
  <tr>
    <td style="padding:${BRAND.space.sm}px ${BRAND.space.md}px; font-size:${BRAND.fontSize.sm}px; color:${BRAND.textMuted}; border-bottom:1px solid ${BRAND.borderLight};">${row.label}</td>
    <td style="padding:${BRAND.space.sm}px ${BRAND.space.md}px; font-size:${BRAND.fontSize.sm}px; color:${BRAND.text}; font-weight:500; border-bottom:1px solid ${BRAND.borderLight};">${row.value}</td>
  </tr>`
        )
        .join('');

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-info-table" style="margin:${BRAND.space.md}px 0; border:1px solid ${BRAND.border}; border-radius:8px; overflow:hidden;">
  ${title ? `<tr><td colspan="2" class="email-info-title" style="padding:${BRAND.space.sm}px ${BRAND.space.md}px; background-color:${BRAND.bgMuted}; font-size:${BRAND.fontSize.sm}px; font-weight:600; color:${BRAND.text};">${title}</td></tr>` : ''}
  ${rowsHtml}
</table>`;
}
