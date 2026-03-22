/**
 * Single place for: FQDN → extension → Mongo TLD → registrar key.
 * Mongo TLD document is required for domain operations; static map fills in when `autoRegistration.provider` is empty.
 */

import { DOMAIN_CONFIG } from '../domain.config';
import ApiError from '../../../utils/apiError';
import tldService from '../tld/tld.service';
import type { ITLD } from '../tld/tld.interface';
import { getRegistrarProvider, normalizeRegistrarKey } from './registrar-registry';

export type RegistrarRoutingSource = 'tld_document' | 'static_map' | 'default';

/** Everything after the first label, with a leading dot (e.g. foo.com.bd → .com.bd). */
export function resolveExtensionFromFqdn(fqdn: string): string | null {
    const normalized = (fqdn || '').trim().toLowerCase();
    if (!normalized) return null;
    const parts = normalized.split('.');
    if (parts.length < 2) return null;
    return `.${parts.slice(1).join('.')}`;
}

function ensureRegistrarImplemented(registrarKey: string, configuredAs?: string): void {
    if (!getRegistrarProvider(registrarKey)) {
        throw new ApiError(
            503,
            `Registrar "${configuredAs ?? registrarKey}" is not configured or not implemented.`
        );
    }
}

class RegistrarRoutingService {
    /**
     * Resolve registrar for search/register/transfer when a TLD row exists in Mongo.
     * Precedence: `autoRegistration.provider` → static `tldRegistrarMap` → `defaultRegistrar`.
     */
    private resolveRegistrarFromTldRow(
        extension: string,
        tld: Pick<ITLD, 'autoRegistration'>
    ): { registrarKey: string; source: RegistrarRoutingSource } {
        const suffix = extension.replace(/^\./, '');
        const fromDoc = tldService.preferredRegistrarFromTld(tld);
        if (fromDoc) {
            const registrarKey = normalizeRegistrarKey(fromDoc);
            ensureRegistrarImplemented(registrarKey, fromDoc);
            return { registrarKey, source: 'tld_document' };
        }
        const staticMapped = DOMAIN_CONFIG.tldRegistrarMap[suffix];
        if (staticMapped) {
            const registrarKey = normalizeRegistrarKey(staticMapped);
            ensureRegistrarImplemented(registrarKey, staticMapped);
            return { registrarKey, source: 'static_map' };
        }
        const defKey = normalizeRegistrarKey(DOMAIN_CONFIG.defaultRegistrar);
        ensureRegistrarImplemented(defKey, DOMAIN_CONFIG.defaultRegistrar);
        return { registrarKey: defKey, source: 'default' };
    }

    /**
     * Full resolution for billing domain flows. Requires a TLD document in Mongo.
     */
    async resolveRegistrarKeyForDomainName(fqdn: string): Promise<{
        registrarKey: string;
        source: RegistrarRoutingSource;
        extension: string;
        tld: ITLD;
    }> {
        const extension = resolveExtensionFromFqdn(fqdn);
        if (!extension) {
            throw ApiError.badRequest('Invalid domain format');
        }

        const tld = await tldService.getTLDByExtensionOrNull(extension);
        if (!tld) {
            throw ApiError.notFound(
                'TLD not configured. Add this extension under TLD settings in the admin panel.'
            );
        }

        const { registrarKey, source } = this.resolveRegistrarFromTldRow(extension, tld);
        return { registrarKey, source, extension, tld };
    }

    /**
     * Bulk search: same rules as {@link resolveRegistrarKeyForDomainName} per domain.
     */
    async resolveRegistrarKeysForDomainNames(
        fqdns: string[]
    ): Promise<Array<{ domain: string; registrarKey: string; source: RegistrarRoutingSource; extension: string; tld: ITLD }>> {
        return Promise.all(
            fqdns.map(async (fqdn) => {
                const ctx = await this.resolveRegistrarKeyForDomainName(fqdn);
                return {
                    domain: fqdn.trim().toLowerCase(),
                    registrarKey: ctx.registrarKey,
                    source: ctx.source,
                    extension: ctx.extension,
                    tld: ctx.tld,
                };
            })
        );
    }
}

export const registrarRoutingService = new RegistrarRoutingService();
export default registrarRoutingService;
