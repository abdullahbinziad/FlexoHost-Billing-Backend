/**
 * Email design system - colors, spacing, typography
 * Single source of truth for all template styling
 */

export const BRAND = {
    primary: '#3a9cfd',
    primaryDark: '#245bd9',
    gradient: 'linear-gradient(135deg,rgb(26, 138, 249) 0%,rgb(0, 49, 164) 100%)',
    gradientFallback: '#245bd9',

    text: '#1f2937',
    textMuted: '#6b7280',
    textLight: '#9ca3af',
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    bg: '#ffffff',
    bgMuted: '#f9fafb',
    bgPage: '#f1f5f9',

    space: {
        xs: 8,
        sm: 12,
        md: 16,
        lg: 20,
        xl: 24,
        xxl: 32,
    },

    fontFamily: "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
    },
} as const;
