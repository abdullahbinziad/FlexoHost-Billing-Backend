# Email Module

Transactional email system for FlexoHost billing. Industry-standard structure for scalability.

## Structure

```
email/
├── index.ts              # Public API
├── email.service.ts      # Core service - send templated/raw emails
├── email.routes.ts       # HTTP routes (preview, etc.)
├── email.interface.ts    # Module interface
│
├── constants/            # Design system & defaults
│   ├── index.ts
│   └── brand.ts         # Colors, spacing, typography
│
├── types/               # Module-level type re-exports
│   └── index.ts
│
├── transport/           # Delivery layer (singular)
│   ├── index.ts
│   └── nodemailer.transport.ts
│
├── templates/           # Template engine
│   ├── index.ts
│   ├── types.ts         # TemplateKey, BaseEmailTemplate, BrandProps
│   ├── config.ts        # Default brand, mergeBrandProps
│   ├── registry.ts      # Template lookup
│   ├── props-map.ts     # TemplateKey → Props mapping
│   │
│   ├── blocks/          # Reusable UI blocks (header, footer, CTA, etc.)
│   ├── layouts/         # Page layouts (default)
│   ├── styles/          # Responsive CSS
│   ├── schemas/         # Zod validation per template
│   ├── utils/           # plain-text, etc.
│   │
│   ├── account/         # account.welcome, verify_email, password_reset
│   ├── billing/         # invoice_created, payment_success, etc.
│   ├── domain/          # registration_confirmation, renewal_reminder
│   ├── order/           # confirmation
│   ├── service/         # hosting_ready, suspension_warning
│   ├── support/         # ticket_opened
│   └── incident/        # maintenance_notice
│
├── triggers/            # Event → template mapping
├── preview/             # Admin preview API
└── __tests__/
```

## Adding a New Template

1. Create `templates/{category}/{template-name}.ts`
2. Add schema in `templates/schemas/{category}.schemas.ts`
3. Register in `templates/registry.ts`
4. Add to `TemplateKey` in `templates/types.ts`
5. Add to `TemplatePropsMap` in `templates/props-map.ts`

## Usage

```ts
import { sendTemplatedEmail } from '@/modules/email';

await sendTemplatedEmail({
  to: 'user@example.com',
  templateKey: 'billing.payment_success',
  props: { customerName, invoiceNumber, ... },
});
```
