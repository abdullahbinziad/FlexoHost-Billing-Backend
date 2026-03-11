/**
 * OAuth strategies – one per provider.
 * To add Facebook/GitHub: create facebook.strategy.ts, github.strategy.ts
 * and add normalizers to the registry below.
 */
import type { OAuthProfile } from '../types/oauth.types';
import type { GoogleProfile } from '../types/google.types';
import { normalizeGoogleProfile } from './google.strategy';

export type OAuthNormalizer<T = unknown> = (profile: T) => OAuthProfile;

const normalizers: Record<string, OAuthNormalizer> = {
    google: normalizeGoogleProfile as OAuthNormalizer<GoogleProfile>,
    // facebook: normalizeFacebookProfile,
    // github: normalizeGithubProfile,
};

export function getOAuthNormalizer(provider: string): OAuthNormalizer | undefined {
    return normalizers[provider];
}

export { normalizeGoogleProfile } from './google.strategy';
