import { TLDModel } from './tld.model';
import { ITLD } from './tld.interface';
import ApiError from '../../../utils/apiError';

/** In-memory TTL cache (plan scalability option 1): reduces Mongo reads on hot search paths. Set TLD_EXTENSION_CACHE_TTL_MS=0 to disable. */
const TLD_EXTENSION_CACHE_TTL_MS = Math.max(0, Number(process.env.TLD_EXTENSION_CACHE_TTL_MS ?? 120_000));

class TLDService {
    private readonly tldByExtensionCache = new Map<string, { payload: Record<string, unknown>; expires: number }>();

    /**
     * Canonical storage/lookup form: leading dot, lowercase (e.g. `.com.bd`).
     * Accepts `com.bd` or `.com.bd` from API/admin.
     */
    canonicalTldKey(extension: string): string {
        let e = (extension || '').toLowerCase().trim();
        if (!e) return e;
        if (!e.startsWith('.')) {
            e = `.${e}`;
        }
        return e;
    }

    private normalizeExtensionKey(extension: string): string {
        return this.canonicalTldKey(extension);
    }

    /** Query filter: match canonical or legacy (no leading dot) rows. */
    private extensionMatchFilter(canonical: string): { $or: Array<{ tld: string }> } {
        const noDot = canonical.replace(/^\./, '');
        return { $or: [{ tld: canonical }, { tld: noDot }] };
    }

    private invalidateTldExtensionCache(): void {
        this.tldByExtensionCache.clear();
    }

    async createTLD(data: Partial<ITLD>): Promise<ITLD> {
        const payload = { ...data };
        if (typeof payload.tld === 'string') {
            payload.tld = this.canonicalTldKey(payload.tld);
        }
        const existing = await TLDModel.findOne(this.extensionMatchFilter(payload.tld as string));
        if (existing) {
            throw new ApiError(400, 'TLD already exists');
        }
        const created = await TLDModel.create(payload);
        this.invalidateTldExtensionCache();
        return created;
    }

    async getAllTLDs(query: any = {}): Promise<ITLD[]> {
        // Basic filter implementation
        const filter: any = {};
        if (query.status) filter.status = query.status;
        if (query.isSpotlight) filter.isSpotlight = query.isSpotlight === 'true';

        return await TLDModel.find(filter).sort({ serial: 1 });
    }

    async getTLDByExtension(extension: string): Promise<ITLD> {
        const tld = await this.getTLDByExtensionOrNull(extension);
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    /** Same lookup as {@link getTLDByExtension} but returns null if missing. */
    async getTLDByExtensionOrNull(extension: string): Promise<ITLD | null> {
        const key = this.normalizeExtensionKey(extension);
        const now = Date.now();

        if (TLD_EXTENSION_CACHE_TTL_MS > 0) {
            const hit = this.tldByExtensionCache.get(key);
            if (hit && hit.expires > now) {
                return hit.payload as unknown as ITLD;
            }
        }

        const tld = await TLDModel.findOne(this.extensionMatchFilter(key));
        if (!tld) {
            return null;
        }

        if (TLD_EXTENSION_CACHE_TTL_MS > 0) {
            const plain = tld.toObject ? tld.toObject() : { ...(tld as object) };
            this.tldByExtensionCache.set(key, {
                payload: plain as Record<string, unknown>,
                expires: now + TLD_EXTENSION_CACHE_TTL_MS,
            });
        }

        return tld;
    }

    async getTLDById(id: string): Promise<ITLD> {
        const tld = await TLDModel.findById(id);
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    async updateTLD(id: string, data: Partial<ITLD>): Promise<ITLD | null> {
        const payload = { ...data };
        if (typeof payload.tld === 'string') {
            payload.tld = this.canonicalTldKey(payload.tld);
        }
        const tld = await TLDModel.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        this.invalidateTldExtensionCache();
        return tld;
    }

    async deleteTLD(id: string): Promise<ITLD | null> {
        const tld = await TLDModel.findByIdAndDelete(id);
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        this.invalidateTldExtensionCache();
        return tld;
    }

    /**
     * Option A: non-empty `autoRegistration.provider` selects which registrar API handles this TLD
     * (search, availability, register/transfer routing). `autoRegistration.enabled` is only for automation.
     */
    preferredRegistrarFromTld(tld: Pick<ITLD, 'autoRegistration'> | null | undefined): string | null {
        const p = tld?.autoRegistration?.provider;
        if (typeof p === 'string' && p.trim() !== '') {
            return p.trim();
        }
        return null;
    }

    async getRegistrarForTLD(extension: string): Promise<string | null> {
        try {
            const tld = await this.getTLDByExtension(extension);
            return this.preferredRegistrarFromTld(tld);
        } catch {
            return null;
        }
    }
}

export default new TLDService();
