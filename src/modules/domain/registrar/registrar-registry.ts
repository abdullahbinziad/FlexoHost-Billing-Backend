import { DOMAIN_CONFIG } from '../domain.config';
import ApiError from '../../../utils/apiError';
import type { IRegistrarProvider } from './registrar.types';
import { dynadotRegistrarProvider } from '../registrars/dynadot-registrar.provider';
import { namelyRegistrarProvider } from '../registrars/namely-registrar.provider';

const registrarProviders = new Map<string, IRegistrarProvider>([
    ['dynadot', dynadotRegistrarProvider],
    ['namely', namelyRegistrarProvider],
]);

export function normalizeRegistrarKey(value?: string | null): string {
    return (value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
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

/**
 * Sync fallback when `preferredRegistrar` is missing (e.g. legacy paths). Prefer
 * {@link registrarRoutingService.resolveRegistrarKeyForDomainName} for billing flows.
 */
export function resolveRegistrarKeyForDomain(domainName: string, preferredRegistrar?: string | null): string {
    const preferred = normalizeRegistrarKey(preferredRegistrar);
    if (preferred && registrarProviders.has(preferred)) {
        return preferred;
    }

    const suffix = domainName.toLowerCase().split('.').slice(1).join('.');
    const mapped = DOMAIN_CONFIG.tldRegistrarMap[suffix as keyof typeof DOMAIN_CONFIG.tldRegistrarMap];
    const mappedRegistrar = normalizeRegistrarKey(mapped || DOMAIN_CONFIG.defaultRegistrar);
    if (mappedRegistrar && registrarProviders.has(mappedRegistrar)) {
        return mappedRegistrar;
    }

    return registrarProviders.has('dynadot') ? 'dynadot' : Array.from(registrarProviders.keys())[0] || '';
}

export function resolveRegistrarProviderForDomain(domainName: string, preferredRegistrar?: string | null): IRegistrarProvider {
    const key = resolveRegistrarKeyForDomain(domainName, preferredRegistrar);
    const provider = getRegistrarProvider(key);
    if (!provider) {
        throw new ApiError(503, `No registrar provider registered for key: ${key || '(empty)'}`);
    }
    return provider;
}
