/**
 * Email preview - render templates with mock data for testing
 * Validates props before render; throws with readable validation errors on failure.
 */

import { getTemplate } from '../templates/registry';
import { mergeBrandProps } from '../templates/config';
import { validateProps } from '../templates/schemas';
import { PREVIEW_DATA } from './mocks/preview-data';
import type { TemplateKey } from '../templates/types';

export interface PreviewResult {
    subject: string;
    previewText: string;
    html: string;
    text: string;
}

/**
 * Preview template - validates props, returns result or throws with readable errors
 */
export function previewTemplate(
    key: TemplateKey,
    overrides?: Record<string, unknown>
): PreviewResult {
    const props = { ...PREVIEW_DATA[key], ...overrides };
    const validation = validateProps(key, props);

    if (!validation.success) {
        throw new Error(`Template validation failed: ${validation.message}`);
    }

    const template = getTemplate(key);
    const validatedData = validation.data as Record<string, unknown>;
    const fullProps = mergeBrandProps({ ...validatedData, ...props });

    return {
        subject: template.buildSubject(fullProps as any),
        previewText: template.previewText(fullProps as any),
        html: template.renderHtml(fullProps as any),
        text: template.renderText(fullProps as any),
    };
}
