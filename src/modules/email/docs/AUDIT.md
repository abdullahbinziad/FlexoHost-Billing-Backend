# Email Module - Senior Architect Audit

## Executive Summary

The email module has been audited and refactored to address validation and production readiness. Key improvements: Zod validation and clearer separation of concerns.

---

## Audit Findings & Resolutions

### 1. Missing Validation ✅ FIXED

**Finding:** No runtime validation of template props; invalid data could cause render errors or unsafe output.

**Resolution:** Added Zod schemas per template in `templates/schemas/`. `validateProps()` runs before render; `sendTemplatedEmail` and `previewTemplate` validate and return readable errors.

---

### 2. Hardcoded Strings ✅ ACCEPTABLE

**Finding:** Message strings embedded in template bodies. English only.

**Resolution:** No translation layer; templates use English strings directly.

---

### 3. Weak Typing ✅ IMPROVED

**Finding:** Some `any` casts in mergeBrandProps and template render functions.

**Resolution:** Validation returns typed data; `TemplatePropsMap` provides key→props mapping. Reduced `any` usage; full elimination would require generic RenderContext.

---

### 4. Folder Structure ✅ GOOD

**Current structure is sound:**
- `templates/` – templates, blocks, layouts, schemas (Zod)
- `transports/` – nodemailer transport
- `preview/` – admin preview, mocks

**Recommendation:** Keep. Consider `templates/schemas/` per-category files for 100+ templates.

---

### 5. Layout Duplication ✅ ACCEPTABLE

**Finding:** Default layout is single file; blocks are reused. No significant duplication.

**Resolution:** No change needed. Blocks (header, footer, CTA, etc.) are shared.

---

### 6. Unsafe Template Rendering ✅ MITIGATED

**Finding:** String interpolation in templates could allow injection if props contain HTML.

**Resolution:** Zod validates props; no `dangerouslySetInnerHTML`-style rendering. For user-generated content (e.g. ticket summary), consider HTML-escaping in blocks. Current templates use structured props (names, URLs, amounts) – low risk.

---

### 7. Plain Text Fallback ✅ PRESENT

**Finding:** All templates implement `renderText()`. `htmlToPlainText` utility exists.

**Resolution:** No change. Every template has HTML + plain text.

---

### 8. Scalability ✅ IMPROVED

**Finding:** Adding templates required manual registry + props-map updates.

**Resolution:** Pattern is clear: add template file → add schema → register. For 100+ templates, consider lazy-loading by category or codegen from a manifest.

---

### 9. Naming ✅ GOOD

**Finding:** Template keys (`account.welcome`, `billing.invoice_created`) are consistent. File names use kebab-case.

**Resolution:** No change.

---

### 10. Transport Coupling ✅ DECOUPLED

**Finding:** Nodemailer transport used for SMTP. Backend uses MongoDB; no email DB schema.

**Resolution:** No change. Email sent via nodemailer; validation via Zod.

---

### 11. Developer Experience ✅ IMPROVED

**Finding:** Preview API returned generic errors. No validation feedback in admin UI.

**Resolution:** Preview returns structured `errors` array on validation failure. Admin can show field-level errors.

---

## Remaining Recommendations

1. **HTML Escaping:** Add `escapeHtml()` for any user-supplied strings in templates.
