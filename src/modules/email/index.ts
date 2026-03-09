/**
 * Email Module - Public API
 * @see README.md for structure and usage
 */

export { default as emailService } from './email.service';
export {
    sendTemplatedEmail,
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendEmailByTemplate,
} from './email.service';
export type { IEmailOptions, SendTemplatedEmailOptions } from './email.service';
export type { TemplateKey, BaseEmailTemplate, BrandProps, SendResult } from './templates/types';
export {
    getTemplate,
    hasTemplate,
    getAllTemplates,
    TEMPLATE_REGISTRY,
    TEMPLATE_KEYS,
} from './templates/registry';
export type { TemplatePropsMap, TemplateProps } from './templates/props-map';
export { previewTemplate } from './preview';
export { getTemplateForTrigger } from './triggers';
