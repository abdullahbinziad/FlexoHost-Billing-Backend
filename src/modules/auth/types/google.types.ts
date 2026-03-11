/**
 * Raw profile shape returned by Google OAuth userinfo API.
 * Used only by Google strategy; other providers have their own types.
 */
export interface GoogleProfile {
    id: string;
    email: string;
    verified_email: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
}
