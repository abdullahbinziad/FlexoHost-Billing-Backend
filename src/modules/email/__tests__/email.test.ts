/**
 * Email module tests - run with: npx jest src/modules/email/__tests__/email.test.ts
 * Or use as reference for manual verification
 */

import { getTemplate, hasTemplate } from '../templates/registry';
import { previewTemplate } from '../preview';
import type { TemplateKey } from '../templates/types';

// Simple assertions (no jest dependency)
function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

export function runEmailModuleTests() {
    const template = getTemplate('account.welcome');
    assert(!!template, 'Template should exist');
    assert(template.key === 'account.welcome', 'Template key should match');
    assert(typeof template.buildSubject === 'function', 'buildSubject should be function');
    assert(typeof template.renderHtml === 'function', 'renderHtml should be function');

    assert(hasTemplate('account.welcome') === true, 'hasTemplate should return true');
    assert(hasTemplate('unknown') === false, 'hasTemplate should return false for unknown');

    const preview = previewTemplate('account.welcome');
    assert(preview.subject.includes('Welcome'), 'Preview subject should contain Welcome');
    assert(preview.html.includes('John Doe'), 'Preview html should contain name');
    assert(preview.text.length > 0, 'Preview text should not be empty');

    console.log('Email module tests passed');
}
