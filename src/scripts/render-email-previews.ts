import fs from 'fs';
import path from 'path';
import { TEMPLATE_KEYS } from '../modules/email/templates/registry';
import { previewTemplate } from '../modules/email/preview';
import logger from '../utils/logger';

const outDir = path.resolve(process.cwd(), 'email-previews');

function safeName(value: string): string {
    return value.replace(/[^a-z0-9_.-]/gi, '_');
}

async function main(): Promise<void> {
    fs.mkdirSync(outDir, { recursive: true });
    const indexRows: string[] = [];

    for (const key of TEMPLATE_KEYS) {
        const rendered = previewTemplate(key);
        const filename = `${safeName(key)}.html`;
        fs.writeFileSync(path.join(outDir, filename), rendered.html, 'utf8');
        fs.writeFileSync(path.join(outDir, `${safeName(key)}.txt`), rendered.text, 'utf8');
        indexRows.push(`<li><a href="./${filename}">${key}</a> - ${rendered.subject}</li>`);
    }

    fs.writeFileSync(
        path.join(outDir, 'index.html'),
        `<!doctype html><html><head><meta charset="utf-8"><title>Email Previews</title></head><body><h1>Email Previews</h1><ul>${indexRows.join('\n')}</ul></body></html>`,
        'utf8'
    );
    logger.info(`Rendered ${TEMPLATE_KEYS.length} email previews to ${outDir}`);
}

main().catch((err) => {
    logger.error('Email preview render failed:', err);
    process.exit(1);
});
