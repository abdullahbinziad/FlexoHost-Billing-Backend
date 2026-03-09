/**
 * Default email layout - header, content area, footer
 * Mobile responsive with fluid layout and media queries
 */

import { renderEmailHeader } from '../blocks/header';
import { renderEmailFooter } from '../blocks/footer';
import { BRAND } from '../blocks/brand';
import { RESPONSIVE_STYLES } from '../styles/responsive.css';
import type { BrandProps } from '../types';

export interface LayoutProps extends BrandProps {
    content: string;
}

export function renderDefaultLayout(props: LayoutProps): string {
    const { content, ...brandProps } = props;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    ${RESPONSIVE_STYLES}
    a { color: ${BRAND.primary}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bgPage}; font-family:${BRAND.fontFamily}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${BRAND.bgPage}; min-width:100%;">
    <tr>
      <td align="center" class="email-wrapper" style="padding:${BRAND.space.xxl}px ${BRAND.space.md}px;">
        <!--[if mso]>
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr><td>
        <![endif]-->
        <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; width:100%; background-color:${BRAND.bg}; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td>
              ${renderEmailHeader(brandProps)}
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-content" style="padding:${BRAND.space.xl}px; font-size:${BRAND.fontSize.base}px; line-height:1.65; color:${BRAND.text};">
                <tr>
                  <td style="font-size:${BRAND.fontSize.base}px; line-height:1.65; color:${BRAND.text};">
                    ${content}
                  </td>
                </tr>
              </table>
              ${renderEmailFooter(brandProps)}
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
