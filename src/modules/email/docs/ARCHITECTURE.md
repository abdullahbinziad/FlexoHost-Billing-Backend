# Email Module Architecture

## Overview

Production-grade transactional email system for FlexoHost Billing. Supports 16+ templates across account, billing, order, service, domain, support, and incident categories.

## Design Principles

1. **Validation-first**: Zod schemas validate props before render; readable errors returned to callers
2. **Transport-agnostic**: Send service abstracts SMTP/Resend/Postmark
3. **Typed registry**: Template key → props mapping with full TypeScript inference
4. **HTML + plain text**: Every template renders both; plain text fallback for accessibility

## Folder Structure

```
email/
├── docs/
│   └── ARCHITECTURE.md
├── templates/
│   ├── schemas/           # Zod validation
│   │   ├── index.ts       # Schema registry, validate()
│   │   └── *.schema.ts    # Per-template schemas
│   ├── blocks/            # Reusable layout blocks
│   ├── layouts/           # Default layout
│   ├── account/           # account.* templates
│   ├── billing/
│   ├── order/
│   ├── service/
│   ├── domain/
│   ├── support/
│   ├── incident/
│   ├── types.ts
│   ├── props-map.ts
│   ├── config.ts
│   └── registry.ts
├── transports/            # nodemailer.transport.ts (SMTP)
├── preview/               # Admin preview, mock data
└── triggers/              # Business event → template mapping
```

## Validation Flow

```
sendTemplateEmail(to, key, props)
  → validateProps(key, props)  // Zod
  → mergeBrandProps(props)
  → getTemplate(key).buildSubject(fullProps)
  → getTemplate(key).renderHtml(fullProps)
  → getTemplate(key).renderText(fullProps)
  → transport.send(...)
```

## Scalability

- Add template: create `templates/{category}/{name}.ts`, add schema, register
- 100+ templates: same pattern; consider lazy-loading per category if needed
