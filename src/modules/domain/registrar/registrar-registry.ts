import { DOMAIN_CONFIG } from '../domain.config';
import type { IRegistrarProvider } from './registrar.types';
import { dynadotRegistrarProvider } from '../registrars/dynadot-registrar.provider';
import { namelyRegistrarProvider } from '../registrars/namely-registrar.provider';

const REGISTRAR_ALIASES: Record<string, string> = {
    dynadot: 'dynadot',
    namely: 'namely',
    connectreseller: 'connectreseller',
};

const registrarProviders = new Map<string, IRegistrarProvider>([
    ['dynadot', dynadotRegistrarProvider],
    ['namely', namelyRegistrarProvider],
]);

export function normalizeRegistrarKey(value?: string | null): string {
    const normalized = (value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
    return REGISTRAR_ALIASES[normalized] ?? normalized;
}

export function registerRegistrarProvider(key: string, provider: IRegistrarProvider): void {
    registrarProviders.set(normalizeRegistrarKey(key), provider);
}

export function getRegistrarProvider(key: string): IRegistrarProvider | null {
    return registrarProviders.get(normalizeRegistrarKey(key)) ?? null;
}

export function getAllRegistrarProviders(): IRegistrarProvider[] {
    return Array.from(registrarProviders.values());
}

export function resolveRegistrarKeyForDomain(domainName: string, preferredRegistrar?: string | null): string {
    const preferred = normalizeRegistrarKey(preferredRegistrar);
    if (preferred && registrarProviders.has(preferred)) {
        return preferred;
    }

    const tld = domainName.toLowerCase().split('.').slice(1).join('.');
    const mappedRegistrar = normalizeRegistrarKey(DOMAIN_CONFIG.tldRegistrarMap[tld] || DOMAIN_CONFIG.defaultRegistrar);
    if (mappedRegistrar && registrarProviders.has(mappedRegistrar)) {
        return mappedRegistrar;
    }

    // Fallback to the default registered provider so unsupported mappings do not break the system.
    return registrarProviders.has('dynadot') ? 'dynadot' : Array.from(registrarProviders.keys())[0] || '';
}

export function resolveRegistrarProviderForDomain(domainName: string, preferredRegistrar?: string | null): IRegistrarProvider {
    const key = resolveRegistrarKeyForDomain(domainName, preferredRegistrar);
    const provider = getRegistrarProvider(key);
    if (!provider) {
        throw new Error(`No registrar provider registered for key: ${key || '(empty)'}`);
    }
    return provider;
}
