# Email Module Architecture

Production-grade TypeScript email system for FlexoHost hosting company.

## Folder Structure

```
src/modules/email/
├── index.ts                    # Public API
├── email.service.ts            # Send service (sendTemplatedEmail, legacy methods)
├── email.interface.ts           # Legacy interfaces (IEmailOptions)
├── EMAIL_ARCHITECTURE.md        # This file
│
├── templates/                  # Template definitions
│   ├── index.ts
│   ├── types.ts                # TemplateKey, BaseEmailTemplate, BrandProps
│   ├── config.ts               # DEFAULT_BRAND, mergeBrandProps
│   ├── registry.ts             # TEMPLATE_REGISTRY, getTemplate(), hasTemplate()
│   ├── schemas/                # Zod validation per template
│   ├── utils/
│   │   └── plain-text.ts       # htmlToPlainText for text fallback
│   ├── layouts/
│   │   └── default.layout.ts   # Header + content + footer wrapper
│   ├── blocks/                 # Reusable components (React Email style)
│   │   ├── index.ts
│   │   ├── block.types.ts
│   │   ├── header.ts
│   │   ├── footer.ts
│   │   ├── section-card.ts
│   │   ├── cta-button.ts
│   │   ├── info-table.ts
│   │   ├── alert-box.ts
│   │   ├── status-badge.ts
│   │   ├── greeting-block.ts
│   │   └── signature-block.ts
│   ├── account/                # account.* templates
│   ├── billing/                # billing.* templates
│   ├── order/
│   ├── service/
│   ├── domain/
│   ├── support/
│   └── incident/
│
├── transports/
│   └── nodemailer.transport.ts  # SMTP send, isTransportConfigured
│
├── triggers/
│   └── index.ts               # Business event → template mapping
│
├── preview/
│   ├── index.ts               # previewTemplate()
│   └── mocks/
│       └── preview-data.ts    # Mock data for preview/testing
│
└── __tests__/
    └── email.test.ts
```

## File Purposes

| File/Folder | Purpose |
|-------------|---------|
| `templates/types.ts` | TemplateKey union, BaseEmailTemplate<T>, BrandProps, SendResult |
| `templates/registry.ts` | Central registry, getTemplate(), hasTemplate() |
| `templates/config.ts` | Default brand, mergeBrandProps() |
| `templates/blocks/*` | Reusable HTML blocks (header, footer, CTA, table, alert, etc.) |
| `templates/layouts/default.layout.ts` | Wrapper with header, content area, footer |
| `transports/nodemailer.transport.ts` | Nodemailer SMTP send, stub when not configured |
| `templates/schemas/` | Zod validation per template |
| `triggers/index.ts` | Maps business events (e.g. user.registered) to template keys |
| `preview/` | Render templates with mock data for testing/preview |

## Naming Conventions

- **Template keys**: `category.template_name` (e.g. `billing.payment_success`)
- **Categories**: account, billing, order, service, domain, support, abuse, incident
- **Template files**: `kebab-case.ts` (e.g. `password-reset.ts`)
- **Blocks**: `renderXxx()` functions returning HTML strings

## Template Structure

Each template implements:

```ts
interface BaseEmailTemplate<TProps> {
  key: TemplateKey;
  category: EmailCategory;
  buildSubject: (props: TProps & BrandProps) => string;
  previewText: (props: TProps & BrandProps) => string;
  renderHtml: (props: TProps & BrandProps) => string;
  renderText: (props: TProps & BrandProps) => string;
}
```

## Usage

```ts
import { sendTemplatedEmail, getTemplate, previewTemplate } from './modules/email';

// Send
await sendTemplatedEmail({
  to: 'user@example.com',
  templateKey: 'account.welcome',
  props: { name: 'John', dashboardUrl: 'https://app.example.com/dashboard' },
});

// Preview (for testing)
const result = previewTemplate('billing.payment_success');
console.log(result.subject, result.html);
```

## Scalability

- Add new templates: create file in `templates/{category}/`, add to registry
- Add new category: create folder, add TemplateKey union, add to registry
- 100+ templates: structure supports it; consider splitting registry by category
