/**
 * Email block component props - shared across reusable blocks
 */

export interface BlockProps {
    companyName?: string;
    supportEmail?: string;
    websiteUrl?: string;
    logoUrl?: string;
}

export interface CTAButtonProps extends BlockProps {
    href: string;
    label: string;
}

export interface InfoTableRow {
    label: string;
    value: string;
}

export interface InfoTableProps extends BlockProps {
    rows: InfoTableRow[];
    title?: string;
}

export interface AlertBoxProps extends BlockProps {
    message: string;
    variant: 'info' | 'warning' | 'error' | 'success';
}

export interface StatusBadgeProps extends BlockProps {
    status: string;
    variant: 'success' | 'warning' | 'error' | 'info';
}

export interface GreetingBlockProps extends BlockProps {
    name: string;
    greeting?: string;
}

export interface SignatureBlockProps extends BlockProps {
    signerName?: string;
    signerTitle?: string;
}
