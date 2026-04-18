/**
 * Static TLD → registrar key fallback when Mongo TLD `autoRegistration.provider` is empty.
 * Default registrar key comes from Mongo (DomainSystemSettings), cached in memory.
 */

import { getDomainSystemDefaultsSync } from './domain-system-settings.service';

export const DOMAIN_CONFIG = {
    get defaultRegistrar(): string {
        return getDomainSystemDefaultsSync().defaultRegistrarKey;
    },

    tldRegistrarMap: {
        com: 'dynadot',
        net: 'dynadot',
        org: 'dynadot',
        io: 'dynadot',
        xyz: 'dynadot',
        // Example: 'com.bd': 'namely',
    } as Record<string, string>,
};
