/**
 * Configuration for Domain Registrars
 * This file maps TLDs to specific registrars.
 */

export const DOMAIN_CONFIG = {
    // Default registrar if no TLD match is found
    defaultRegistrar: 'Dynadot',

    // Map specific TLDs to Registrars
    // Format: 'tld': 'RegistrarName'
    tldRegistrarMap: {
        'com': 'Dynadot',
        'net': 'Dynadot',
        'org': 'Dynadot',
        'io': 'Dynadot',
        'bd': 'Dynadot',
        'xyz': 'Dynadot',
        // Future providers can be mapped here once their IRegistrarProvider implementation is complete.
        // Example:
        // 'io': 'Namely',
        // 'xyz': 'ConnectReseller',
    } as Record<string, string>,
};
