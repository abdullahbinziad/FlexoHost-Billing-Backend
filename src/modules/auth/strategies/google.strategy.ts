import type { OAuthProfile } from '../types/oauth.types';
import type { GoogleProfile } from '../types/google.types';

/**
 * Normalize Google OAuth userinfo to our generic OAuthProfile.
 * Keeps auth layer provider-agnostic for easy addition of Facebook, GitHub, etc.
 */
export function normalizeGoogleProfile(profile: GoogleProfile): OAuthProfile {
    const firstName = profile.given_name || profile.name?.split(/\s+/)[0] || profile.email?.split('@')[0] || 'User';
    const lastName = profile.family_name || profile.name?.split(/\s+/).slice(1).join(' ').trim() || '';
    return {
        provider: 'google',
        providerId: profile.id,
        email: profile.email,
        firstName: (firstName.trim() || 'User').slice(0, 50),
        lastName: (lastName || 'User').slice(0, 50),
        picture: profile.picture,
        verified: profile.verified_email,
    };
}
