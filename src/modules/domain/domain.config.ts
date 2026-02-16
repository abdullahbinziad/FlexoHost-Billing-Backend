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
        'io': 'Namely', // Example: Namely might be cheaper or better for .io
        'bd': 'Namely', // Example: Specific local registrar for .bd
        'xyz': 'ConnectReseller', // Example
        // Add more mappings here
    } as Record<string, string>,
};
