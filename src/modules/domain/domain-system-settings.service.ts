import mongoose from 'mongoose';
import DomainSystemSettings, {
    DEFAULT_DOMAIN_SYSTEM_SETTINGS,
} from './models/domain-system-settings.model';

const SETTINGS_KEY = 'global';

export interface DomainSystemSettingsDto {
    defaultRegistrarKey: string;
    nameserver1: string;
    nameserver2: string;
    nameserver3: string;
    nameserver4: string;
}

/** In-memory snapshot for synchronous reads (e.g. DOMAIN_CONFIG.defaultRegistrar). */
let memorySnapshot: { defaultRegistrarKey: string; nameservers: string[] } | null = null;

function normalizeRegistrarKeyLocal(value: string): string {
    return (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function docToDto(doc: Record<string, unknown>): DomainSystemSettingsDto {
    return {
        defaultRegistrarKey:
            normalizeRegistrarKeyLocal(String(doc.defaultRegistrarKey || '')) ||
            DEFAULT_DOMAIN_SYSTEM_SETTINGS.defaultRegistrarKey,
        nameserver1: String(doc.nameserver1 ?? '').trim(),
        nameserver2: String(doc.nameserver2 ?? '').trim(),
        nameserver3: String(doc.nameserver3 ?? '').trim(),
        nameserver4: String(doc.nameserver4 ?? '').trim(),
    };
}

function dtoToMemory(dto: DomainSystemSettingsDto): void {
    const ns = [dto.nameserver1, dto.nameserver2, dto.nameserver3, dto.nameserver4]
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    memorySnapshot = {
        defaultRegistrarKey: dto.defaultRegistrarKey,
        nameservers: ns,
    };
}

async function getOrCreateDoc(): Promise<Record<string, unknown>> {
    let doc = (await DomainSystemSettings.findOne({ key: SETTINGS_KEY }).lean().exec()) as Record<
        string,
        unknown
    > | null;
    if (!doc) {
        const created = await DomainSystemSettings.create({
            key: SETTINGS_KEY,
            ...DEFAULT_DOMAIN_SYSTEM_SETTINGS,
        });
        doc = created.toObject() as unknown as Record<string, unknown>;
    }
    return doc;
}

/** Used by DOMAIN_CONFIG and registrar fallback — sync, no DB. */
export function getDomainSystemDefaultsSync(): { defaultRegistrarKey: string; nameservers: string[] } {
    if (memorySnapshot) {
        return {
            defaultRegistrarKey: memorySnapshot.defaultRegistrarKey,
            nameservers: [...memorySnapshot.nameservers],
        };
    }
    return {
        defaultRegistrarKey: DEFAULT_DOMAIN_SYSTEM_SETTINGS.defaultRegistrarKey,
        nameservers: [],
    };
}

export async function refreshDomainSystemSettingsCache(): Promise<void> {
    const doc = await getOrCreateDoc();
    const dto = docToDto(doc);
    dtoToMemory(dto);
}

export async function getDomainSystemSettingsForAdmin(): Promise<DomainSystemSettingsDto> {
    const doc = await getOrCreateDoc();
    const dto = docToDto(doc);
    dtoToMemory(dto);
    return dto;
}

export async function updateDomainSystemSettings(
    updates: Partial<DomainSystemSettingsDto>,
    updatedBy?: string
): Promise<DomainSystemSettingsDto> {
    const $set: Record<string, unknown> = {};
    if (updates.defaultRegistrarKey !== undefined) {
        const k = normalizeRegistrarKeyLocal(updates.defaultRegistrarKey);
        $set.defaultRegistrarKey = k || DEFAULT_DOMAIN_SYSTEM_SETTINGS.defaultRegistrarKey;
    }
    for (const field of ['nameserver1', 'nameserver2', 'nameserver3', 'nameserver4'] as const) {
        if (updates[field] !== undefined) {
            $set[field] = String(updates[field]).trim();
        }
    }
    if (updatedBy && mongoose.Types.ObjectId.isValid(updatedBy)) {
        $set.updatedBy = new mongoose.Types.ObjectId(updatedBy);
    }
    await DomainSystemSettings.findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $set },
        { new: true, upsert: true }
    ).exec();
    const doc = await getOrCreateDoc();
    const dto = docToDto(doc);
    dtoToMemory(dto);
    return dto;
}

/** Provisioning: default NS when order has fewer than two hosts. */
export async function getEffectiveDefaultNameserversForProvision(): Promise<string[]> {
    if (!memorySnapshot) {
        await refreshDomainSystemSettingsCache();
    }
    return [...(memorySnapshot?.nameservers ?? [])];
}
