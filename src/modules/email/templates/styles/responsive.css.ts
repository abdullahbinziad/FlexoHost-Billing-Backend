/**
 * Responsive email styles - mobile-first compatible
 * Media queries for screens < 600px (typical mobile breakpoint)
 */

export const RESPONSIVE_STYLES = `
  /* Base - prevent text size adjustment on mobile */
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { color: inherit; text-decoration: none; }

  /* Mobile breakpoint - max-width 600px */
  @media only screen and (max-width: 600px) {
    .email-wrapper { padding: 12px 16px !important; }
    .email-container { width: 100% !important; max-width: 100% !important; }
    .email-content { padding: 20px 16px !important; font-size: 15px !important; line-height: 1.6 !important; }
    .email-header-padding { padding: 24px 16px !important; }
    .email-logo-wrap { padding: 12px 18px !important; }
    .email-logo { max-width: 180px !important; width: 100% !important; height: auto !important; }
    .email-slogan { font-size: 11px !important; padding: 0 16px 24px !important; }
    .email-greeting { font-size: 17px !important; padding: 16px !important; }
    .email-section { padding: 16px !important; font-size: 15px !important; }
    .email-cta-wrapper { margin: 16px 0 !important; }
    .email-cta { display: block !important; width: 100% !important; max-width: 100% !important; padding: 14px 20px !important; font-size: 15px !important; text-align: center !important; box-sizing: border-box !important; }
    .email-info-table { margin: 12px 0 !important; }
    .email-info-table td { padding: 10px 12px !important; font-size: 14px !important; }
    .email-info-table .email-info-title { padding: 10px 12px !important; font-size: 13px !important; }
    .email-order-table { font-size: 13px !important; }
    .email-order-table td { padding: 8px 10px !important; font-size: 13px !important; }
    .email-alert { padding: 12px !important; font-size: 14px !important; }
    .email-footer { padding: 20px 16px !important; font-size: 12px !important; }
    .email-signature { font-size: 14px !important; margin-top: 20px !important; }
    .email-status-badge { font-size: 11px !important; padding: 6px 10px !important; }
  }

  /* Extra small - max-width 480px */
  @media only screen and (max-width: 480px) {
    .email-wrapper { padding: 8px 12px !important; }
    .email-content { padding: 16px 12px !important; font-size: 14px !important; }
    .email-header-padding { padding: 20px 12px !important; }
    .email-logo-wrap { padding: 10px 14px !important; }
    .email-logo { max-width: 160px !important; }
    .email-section { padding: 12px !important; font-size: 14px !important; }
    .email-cta { padding: 12px 16px !important; font-size: 14px !important; }
    .email-footer { padding: 16px 12px !important; }
    .email-order-table td { padding: 6px 8px !important; font-size: 12px !important; }
  }
`;
