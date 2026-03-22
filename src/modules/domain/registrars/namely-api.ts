/**
 * Namely Partner API — JSON over HTTPS.
 * Auth: X-Partner-Api-Key (see Postman: Namely Partner API).
 * Never log API keys or raw secrets.
 */

import fetch from 'node-fetch';
import { RegistrarError } from '../registrar/registrar.types';
import registrarConfigService from '../registrar/registrar-config.service';

const REGISTRAR_NAME = 'namely';

export interface NamelyCallOptions {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: Record<string, unknown>;
    timeoutMs?: number;
}

function normalizeBaseUrl(raw: string): string {
    const t = (raw || '').trim().replace(/\/+$/, '');
    if (!t) return 'https://api.namely.com.bd/v1/partner-api';
    if (!t.includes('/v1/partner-api')) {
        const host = t.replace(/\/+$/, '');
        return `${host}/v1/partner-api`;
    }
    return t;
}

export async function callNamely(
    path: string,
    options: NamelyCallOptions = {}
): Promise<Record<string, unknown>> {
    const runtime = await registrarConfigService.getRuntimeRegistrarSettings(REGISTRAR_NAME);
    const apiKey = typeof runtime.apiKey === 'string' ? runtime.apiKey.trim() : '';
    const baseUrl = normalizeBaseUrl(typeof runtime.baseUrl === 'string' ? runtime.baseUrl : '');
    const configuredTimeout = Number(runtime.timeoutMs);
    const timeoutMs =
        options.timeoutMs ??
        (Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000);

    if (!apiKey) {
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command: path,
            message: 'Namely API key is not configured (admin → domain registrars).',
        });
    }

    const rel = path.startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${rel}`;

    const method = options.method ?? (options.body ? 'POST' : 'GET');
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Partner-Api-Key': apiKey,
    };
    if (options.body && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
    }

    let response: import('node-fetch').Response;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        response = await fetch(url, {
            method,
            headers,
            body: options.body && method !== 'GET' ? JSON.stringify(options.body) : undefined,
            signal: controller.signal as any,
        });
        clearTimeout(timeout);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new RegistrarError({
                registrar: REGISTRAR_NAME,
                command: path,
                message: 'Namely API request timed out',
                rawSafeSummary: 'timeout',
            });
        }
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command: path,
            message: err?.message || 'Namely API request failed',
            rawSafeSummary: typeof err?.message === 'string' ? err.message.slice(0, 200) : undefined,
        });
    }

    let data: Record<string, unknown>;
    try {
        const text = await response.text();
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command: path,
            message: 'Namely API returned non-JSON response',
            statusCode: response.status >= 400 ? response.status : 502,
            rawSafeSummary: `HTTP ${response.status}`,
        });
    }

    if (!response.ok) {
        const msg =
            (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            `Namely API error (HTTP ${response.status})`;
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command: path,
            message: msg,
            statusCode: response.status >= 400 ? response.status : 400,
            rawSafeSummary: msg.slice(0, 200),
        });
    }

    if (Object.prototype.hasOwnProperty.call(data, 'success') && data.success === false) {
        const msg =
            (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            'Namely API reported failure';
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command: path,
            message: msg,
            rawSafeSummary: msg.slice(0, 200),
        });
    }

    return data;
}

export function encodeDomainForPath(domain: string): string {
    return encodeURIComponent(domain.trim().toLowerCase());
}
