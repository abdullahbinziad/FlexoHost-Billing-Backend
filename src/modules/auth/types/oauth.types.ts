/**
 * OAuth / Social login types – provider-agnostic for scalability.
 * Add new providers (Facebook, GitHub, etc.) by implementing OAuthProfile and a strategy.
 */

export const OAUTH_PROVIDERS = ['google', 'facebook', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export interface OAuthProfile {
    provider: OAuthProvider;
    providerId: string;
    email: string;
    firstName: string;
    lastName: string;
    picture?: string;
    verified?: boolean;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
    return OAUTH_PROVIDERS.includes(value as OAuthProvider);
}
