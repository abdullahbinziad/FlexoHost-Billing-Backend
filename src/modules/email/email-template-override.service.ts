import mongoose from 'mongoose';
import EmailTemplateOverride from './email-template-override.model';
import { getAllTemplates, hasTemplate } from './templates/registry';
import { mergeBrandProps } from './templates/config';
import { PREVIEW_DATA } from './preview/mocks/preview-data';
import type { TemplateKey } from './templates/types';

export interface TemplateOverrideInput {
    enabled?: boolean;
    subject?: string;
    previewText?: string;
    html?: string;
    text?: string;
    updatedBy?: string;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function getValue(path: string, data: Record<string, unknown>): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key];
        return undefined;
    }, data);
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] || ch));
}

export function renderTemplateString(template: string, data: Record<string, unknown>, options?: { escape?: boolean }): string {
    return template.replace(PLACEHOLDER_RE, (_match, key) => {
        const value = getValue(String(key), data);
        const text = value == null ? '' : String(value);
        return options?.escape === false ? text : escapeHtml(text);
    });
}

export async function getOverride(templateKey: TemplateKey) {
    return EmailTemplateOverride.findOne({ templateKey, enabled: true }).lean();
}

export async function listTemplatesWithOverrides() {
    const [templates, overrides] = await Promise.all([
        Promise.resolve(getAllTemplates()),
        EmailTemplateOverride.find({}).lean().exec(),
    ]);
    const overrideMap = new Map(overrides.map((item) => [item.templateKey, item]));

    return templates.map(({ key, template }) => {
        const placeholderProps = buildPlaceholderProps(key);
        const fullProps = mergeBrandProps(placeholderProps) as any;
        return {
            key,
            category: template.category,
            defaultSubjectPreview: template.buildSubject(fullProps),
            defaultPreviewText: template.previewText(fullProps),
            defaultHtml: template.renderHtml(fullProps),
            defaultText: template.renderText(fullProps),
            availableVariables: collectVariablePaths(PREVIEW_DATA[key] || {}),
            override: overrideMap.get(key) || null,
        };
    });
}

function collectVariablePaths(value: unknown, prefix = ''): string[] {
    if (Array.isArray(value)) {
        return value.length > 0 ? collectVariablePaths(value[0], prefix ? `${prefix}.0` : '0') : [];
    }
    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
            collectVariablePaths(child, prefix ? `${prefix}.${key}` : key)
        );
    }
    return prefix ? [prefix] : [];
}

function buildPlaceholderProps(templateKey: TemplateKey): Record<string, unknown> {
    return toPlaceholderObject(PREVIEW_DATA[templateKey] || {}, '') as Record<string, unknown>;
}

function toPlaceholderObject(value: unknown, prefix: string): unknown {
    if (Array.isArray(value)) {
        return value.length > 0
            ? [toPlaceholderObject(value[0], prefix)]
            : [];
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, childValue]) => [
                key,
                toPlaceholderObject(childValue, prefix ? `${prefix}.${key}` : key),
            ])
        );
    }
    return prefix ? `{{${prefix}}}` : '';
}

export async function saveOverride(templateKey: string, input: TemplateOverrideInput) {
    if (!hasTemplate(templateKey)) throw new Error('Unknown email template');

    return EmailTemplateOverride.findOneAndUpdate(
        { templateKey },
        {
            $set: {
                enabled: input.enabled ?? true,
                subject: input.subject?.trim() || undefined,
                previewText: input.previewText?.trim() || undefined,
                html: input.html || undefined,
                text: input.text || undefined,
                updatedBy: input.updatedBy && mongoose.Types.ObjectId.isValid(input.updatedBy)
                    ? new mongoose.Types.ObjectId(input.updatedBy)
                    : undefined,
            },
        },
        { upsert: true, new: true, runValidators: true }
    ).lean();
}

export async function deleteOverride(templateKey: string) {
    if (!hasTemplate(templateKey)) throw new Error('Unknown email template');
    await EmailTemplateOverride.deleteOne({ templateKey }).exec();
}
