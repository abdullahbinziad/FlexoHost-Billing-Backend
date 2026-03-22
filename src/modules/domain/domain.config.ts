/**
 * Configuration for Domain Registrars
 * This file maps TLDs to specific registrars.
 */

export const DOMAIN_CONFIG = {
    // Default registrar if no TLD match is found
    defaultRegistrar: 'Dynadot',

    // Map specific TLDs to Registrars
    // Format: 'tld': 'RegistrarName'
    /** Fallback when Mongo TLD exists but `autoRegistration.provider` is empty. Do not list ccTLDs here — set provider on the TLD document instead. */
    tldRegistrarMap: {
        com: 'Dynadot',
        net: 'Dynadot',
        org: 'Dynadot',
        io: 'Dynadot',
        xyz: 'Dynadot',
    } as Record<string, string>,
};
