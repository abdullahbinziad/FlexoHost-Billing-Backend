import { Types } from 'mongoose';
import ApiError from '../../../utils/apiError';
import { decrypt, encrypt, isEncrypted } from '../../../utils/encryption';
import RegistrarConfig from './registrar-config.model';
import { normalizeRegistrarKey } from './registrar-registry';

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
        name: 'Namely',
        logoText: 'namely',
        description:
            'Namely Partner API (.bd / .com.bd): availability check, registration, renewal, nameservers, DNS, TLD pricing. Auth: X-Partner-Api-Key from the Namely Partner Portal.',
        implemented: true,
        fields: [
            {
                key: 'apiKey',
                label: 'Partner API Key',
                type: 'password',
                sensitive: true,
                helperText: 'Header X-Partner-Api-Key — create under Partner Portal → Settings → API & Integrations.',
                placeholder: 'Paste Namely Partner API key',
            },
            {
                key: 'apiSecret',
                label: 'API Secret (optional)',
                type: 'password',
                sensitive: true,
                helperText: 'Reserved for future signing or webhooks; not required for standard Partner API calls.',
                placeholder: 'Optional secret',
            },
            {
                key: 'baseUrl',
                label: 'API base URL',
                type: 'text',
                helperText:
                    'Host only (https://api.namely.com.bd) or full prefix ending with /v1/partner-api. Paths such as /domains/check are appended automatically.',
                placeholder: 'https://api.namely.com.bd',
            },
            {
                key: 'timeoutMs',
                label: 'Timeout (ms)',
                type: 'text',
                helperText: 'HTTP timeout for Namely API requests.',
                placeholder: '30000',
            },
            {
                key: 'defaultPurpose',
                label: 'Default registration purpose',
                type: 'text',
                helperText: 'Namely register API field `purpose` when the order does not send one (e.g. Business/E-commerce).',
                placeholder: 'Business/E-commerce',
            },
            {
                key: 'defaultCustomerId',
                label: 'Default customer ID',
                type: 'text',
                helperText: 'Namely `customer_id` when the request has no customerId (numeric string).',
                placeholder: '1',
            },
            {
                key: 'defaultRegistrantName',
                label: 'Default registrant — full name',
                type: 'text',
                helperText: 'Used when Namely register payload has no namelyRegistrant block.',
                placeholder: 'Registrant Name',
            },
            {
                key: 'defaultRegistrantEmail',
                label: 'Default registrant — email',
                type: 'text',
                helperText: 'Used when namelyRegistrant is omitted.',
                placeholder: 'email@example.com',
            },
            {
                key: 'defaultRegistrantPhone',
                label: 'Default registrant — phone',
                type: 'text',
                helperText: 'E.164 style recommended (e.g. +8801712345678).',
                placeholder: '+8801712345678',
            },
            {
                key: 'defaultRegistrantAddress',
                label: 'Default registrant — address',
                type: 'textarea',
                helperText: 'Street address for Namely registrant object.',
                placeholder: '123 Road, Dhaka',
            },
            {
                key: 'defaultRegistrantNid',
                label: 'Default registrant — NID',
                type: 'text',
                helperText: 'National ID or document id if required by registry.',
                placeholder: '',
            },
            {
                key: 'defaultRegistrantCity',
                label: 'Default registrant — city',
                type: 'text',
                placeholder: 'Dhaka',
            },
            {
                key: 'defaultRegistrantCountry',
                label: 'Default registrant — country',
                type: 'text',
                helperText: 'ISO 3166-1 alpha-2 (e.g. BD).',
                placeholder: 'BD',
            },
            {
                key: 'documentListUrl',
                label: 'Document list URL',
                type: 'text',
                helperText: 'Optional link for staff when manual documents are required.',
                placeholder: 'https://example.com/required-documents',
            },
            {
                key: 'testMode',
                label: 'Test mode',
                type: 'checkbox',
                helperText: 'Reserved for future sandbox routing; keep off for production.',
            },
        ],
    },
];



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
            apiSecret: '',
            baseUrl: 'https://api.namely.com.bd',
            timeoutMs: '30000',
            defaultPurpose: 'Business/E-commerce',
            defaultCustomerId: '1',
            defaultRegistrantName: '',
            defaultRegistrantEmail: '',
            defaultRegistrantPhone: '',
            defaultRegistrantAddress: '',
            defaultRegistrantNid: '',
            defaultRegistrantCity: 'Dhaka',
            defaultRegistrantCountry: 'BD',
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
    if (normalizedKey === 'namely') {
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
