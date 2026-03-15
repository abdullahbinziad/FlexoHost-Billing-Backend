import { Types } from 'mongoose';
import ApiError from '../../../utils/apiError';
import { decrypt, encrypt, isEncrypted } from '../../../utils/encryption';
import RegistrarConfig from './registrar-config.model';

export type RegistrarConfigFieldType = 'text' | 'password' | 'checkbox' | 'textarea';

export interface RegistrarConfigFieldDefinition {
    key: string;
    label: string;
    type: RegistrarConfigFieldType;
    helperText?: string;
    placeholder?: string;
    sensitive?: boolean;
}

export interface RegistrarDefinition {
    key: string;
    name: string;
    logoText?: string;
    description: string;
    implemented: boolean;
    fields: RegistrarConfigFieldDefinition[];
}

export interface AdminRegistrarField extends RegistrarConfigFieldDefinition {
    value: string | boolean;
    hasValue?: boolean;
}

export interface AdminRegistrarConfig {
    key: string;
    name: string;
    logoText?: string;
    description: string;
    implemented: boolean;
    isActive: boolean;
    configFields: AdminRegistrarField[];
}

const REGISTRAR_DEFINITIONS: RegistrarDefinition[] = [
    {
        key: 'dynadot',
        name: 'Dynadot',
        logoText: 'Dynadot',
        description: 'Dynadot API integration for domain search, registration, renewals, and domain management.',
        implemented: true,
        fields: [
            {
                key: 'apiKey',
                label: 'API Key',
                type: 'password',
                sensitive: true,
                helperText: 'Used for Dynadot API3 requests (key parameter).',
                placeholder: 'Enter Dynadot API key',
            },
            {
                key: 'apiSecret',
                label: 'API Secret',
                type: 'password',
                sensitive: true,
                helperText: 'Secret key for HMAC signing (required for some Dynadot operations).',
                placeholder: 'Enter Dynadot API secret',
            },
            {
                key: 'api3Url',
                label: 'API URL',
                type: 'text',
                helperText: 'Override only if you need a custom Dynadot API endpoint.',
                placeholder: 'https://api.dynadot.com/api3.json',
            },
            {
                key: 'timeoutMs',
                label: 'Timeout (ms)',
                type: 'text',
                helperText: 'Request timeout for Dynadot API calls.',
                placeholder: '30000',
            },
            {
                key: 'defaultCoupon',
                label: 'Default Coupon',
                type: 'textarea',
                helperText: 'Optional coupon list, one per line. The first valid value can be used by registrar flows later.',
                placeholder: 'OCTCOM25',
            },
        ],
    },
    {
        key: 'namely',
        name: 'Namely Partner',
        logoText: 'namely',
        description: 'Namely Partner registrar integration. Configuration can be saved now; live registrar actions are still coming soon.',
        implemented: false,
        fields: [
            {
                key: 'apiKey',
                label: 'API Key',
                type: 'password',
                sensitive: true,
                helperText: 'Stored securely for future Namely provider support.',
                placeholder: 'Enter Namely API key',
            },
            {
                key: 'baseUrl',
                label: 'Base URL',
                type: 'text',
                helperText: 'Namely API base URL.',
                placeholder: 'https://api.namely.com.bd/v1/partner-api',
            },
            {
                key: 'documentListUrl',
                label: 'Document List URL',
                type: 'text',
                helperText: 'Shown to staff when this registrar requires documents during manual processing.',
                placeholder: 'https://example.com/required-documents',
            },
            {
                key: 'testMode',
                label: 'Test Mode',
                type: 'checkbox',
                helperText: 'Keep disabled for live registrar traffic.',
            },
        ],
    },
];

const REGISTRAR_ALIASES: Record<string, string> = {
    dynadot: 'dynadot',
    namely: 'namely',
    connectreseller: 'connectreseller',
};

function normalizeRegistrarKey(value?: string | null): string {
    const normalized = (value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
    return REGISTRAR_ALIASES[normalized] ?? normalized;
}

const DEFINITIONS_BY_KEY = new Map(
    REGISTRAR_DEFINITIONS.map((definition) => [definition.key, definition] as const)
);

function getDefinitionOrThrow(registrarKey: string): RegistrarDefinition {
    const normalizedKey = normalizeRegistrarKey(registrarKey);
    const definition = DEFINITIONS_BY_KEY.get(normalizedKey);
    if (!definition) {
        throw ApiError.notFound(`Unknown registrar: ${registrarKey}`);
    }
    return definition;
}

/** Default settings when nothing is stored. Credentials come ONLY from admin dashboard, not .env */
function getDefaultSettings(registrarKey: string): Record<string, unknown> {
    const normalizedKey = normalizeRegistrarKey(registrarKey);
    if (normalizedKey === 'dynadot') {
        return {
            apiKey: '',
            apiSecret: '',
            api3Url: 'https://api.dynadot.com/api3.json',
            timeoutMs: '30000',
            defaultCoupon: '',
        };
    }

    if (normalizedKey === 'namely') {
        return {
            apiKey: '',
            baseUrl: 'https://api.namely.com.bd/v1/partner-api',
            documentListUrl: '',
            testMode: false,
        };
    }

    return {};
}

function decryptIfNeeded(value: unknown): unknown {
    if (typeof value === 'string' && value && isEncrypted(value)) {
        try {
            return decrypt(value);
        } catch {
            return '';
        }
    }
    return value;
}

function buildMergedSettings(
    registrarKey: string,
    storedSettings: Record<string, unknown> | undefined
): Record<string, unknown> {
    const defaults = getDefaultSettings(registrarKey);
    const merged: Record<string, unknown> = { ...defaults };
    for (const [key, value] of Object.entries(storedSettings || {})) {
        merged[key] = decryptIfNeeded(value);
    }
    return merged;
}

function buildAdminField(
    field: RegistrarConfigFieldDefinition,
    mergedSettings: Record<string, unknown>
): AdminRegistrarField {
    const rawValue = mergedSettings[field.key];

    if (field.type === 'checkbox') {
        return {
            ...field,
            value: Boolean(rawValue),
        };
    }

    if (field.sensitive) {
        return {
            ...field,
            value: '',
            hasValue: typeof rawValue === 'string' && rawValue.length > 0,
        };
    }

    return {
        ...field,
        value: typeof rawValue === 'string' ? rawValue : '',
    };
}

function getDefaultActiveState(registrarKey: string, mergedSettings: Record<string, unknown>): boolean {
    const normalizedKey = normalizeRegistrarKey(registrarKey);
    if (normalizedKey === 'dynadot') {
        return typeof mergedSettings.apiKey === 'string' && mergedSettings.apiKey.length > 0;
    }
    return false;
}

class RegistrarConfigService {
    getDefinitions(): RegistrarDefinition[] {
        return REGISTRAR_DEFINITIONS;
    }

    async getAdminRegistrarConfigs(): Promise<AdminRegistrarConfig[]> {
        const storedConfigs = await RegistrarConfig.find({
            registrarKey: { $in: REGISTRAR_DEFINITIONS.map((definition) => definition.key) },
        }).lean();
        const storedByKey = new Map(
            storedConfigs.map((item) => [normalizeRegistrarKey(item.registrarKey), item] as const)
        );

        return REGISTRAR_DEFINITIONS.map((definition) => {
            const stored = storedByKey.get(definition.key);
            const mergedSettings = buildMergedSettings(definition.key, stored?.settings as Record<string, unknown> | undefined);

            return {
                key: definition.key,
                name: definition.name,
                logoText: definition.logoText,
                description: definition.description,
                implemented: definition.implemented,
                isActive: stored?.isActive ?? getDefaultActiveState(definition.key, mergedSettings),
                configFields: definition.fields.map((field) => buildAdminField(field, mergedSettings)),
            };
        });
    }

    async updateRegistrarConfig(
        registrarKey: string,
        payload: { isActive?: boolean; settings?: Record<string, unknown> },
        actorId?: string
    ): Promise<AdminRegistrarConfig> {
        const definition = getDefinitionOrThrow(registrarKey);

        if (payload.isActive && !definition.implemented) {
            throw ApiError.badRequest(`${definition.name} cannot be activated yet because its provider is not implemented.`);
        }

        const existing = await RegistrarConfig.findOne({ registrarKey: definition.key });
        const nextSettings: Record<string, unknown> = {
            ...((existing?.settings as Record<string, unknown> | undefined) ?? {}),
        };

        for (const field of definition.fields) {
            if (!(field.key in (payload.settings || {}))) {
                continue;
            }

            const incoming = payload.settings?.[field.key];

            if (field.type === 'checkbox') {
                nextSettings[field.key] = Boolean(incoming);
                continue;
            }

            if (incoming === null) {
                delete nextSettings[field.key];
                continue;
            }

            const nextValue = typeof incoming === 'string' ? incoming : '';

            if (field.sensitive) {
                if (!nextValue.trim()) {
                    continue;
                }
                nextSettings[field.key] = encrypt(nextValue);
                continue;
            }

            nextSettings[field.key] = nextValue;
        }

        const doc = await RegistrarConfig.findOneAndUpdate(
            { registrarKey: definition.key },
            {
                $set: {
                    registrarKey: definition.key,
                    isActive: payload.isActive ?? existing?.isActive ?? false,
                    settings: nextSettings,
                    ...(actorId && Types.ObjectId.isValid(actorId)
                        ? { updatedBy: new Types.ObjectId(actorId) }
                        : {}),
                },
            },
            { new: true, upsert: true }
        );

        const mergedSettings = buildMergedSettings(definition.key, doc.settings as Record<string, unknown>);

        return {
            key: definition.key,
            name: definition.name,
            logoText: definition.logoText,
            description: definition.description,
            implemented: definition.implemented,
            isActive: doc.isActive,
            configFields: definition.fields.map((field) => buildAdminField(field, mergedSettings)),
        };
    }

    async getRuntimeRegistrarSettings(registrarKey: string): Promise<Record<string, unknown>> {
        const definition = getDefinitionOrThrow(registrarKey);
        const stored = await RegistrarConfig.findOne({ registrarKey: definition.key }).lean<any>();
        return buildMergedSettings(definition.key, stored?.settings as Record<string, unknown> | undefined);
    }
}

export default new RegistrarConfigService();
