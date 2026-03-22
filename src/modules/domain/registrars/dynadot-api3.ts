/**
 * Low-level Dynadot API 3 (api3.json) helper.
 * Uses key + command; production: https://api.dynadot.com/api3.json
 * Never log or expose API key.
 */

import fetch from 'node-fetch';
import { RegistrarError } from '../registrar/registrar.types';
import registrarConfigService from '../registrar/registrar-config.service';

const REGISTRAR_NAME = 'dynadot';

export interface DynadotCallOptions {
    timeoutMs?: number;
}

/**
 * Call Dynadot API3. Sends GET request with key, command, and params as query string.
 * Parses JSON response and normalizes success/failure.
 * Throws RegistrarError with safe message (no key/secret).
 */
export async function callDynadot(
    command: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: DynadotCallOptions = {}
): Promise<Record<string, unknown>> {
    const runtimeSettings = await registrarConfigService.getRuntimeRegistrarSettings(REGISTRAR_NAME);
    const apiKey = typeof runtimeSettings.apiKey === 'string' ? runtimeSettings.apiKey : '';
    const baseUrl = typeof runtimeSettings.api3Url === 'string' && runtimeSettings.api3Url
        ? runtimeSettings.api3Url
        : 'https://api.dynadot.com/api3.json';
    const configuredTimeout = Number(runtimeSettings.timeoutMs);
    const timeoutMs = options.timeoutMs
        ?? (Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000);

    if (!apiKey) {
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command,
            message: 'Dynadot API key is not configured',
        });
    }

    const searchParams = new URLSearchParams();
    searchParams.set('key', apiKey);
    searchParams.set('command', command);
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        searchParams.set(k, String(v));
    }

    const url = `${baseUrl}?${searchParams.toString()}`;

    let response: import('node-fetch').Response;
    let data: Record<string, unknown>;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal as any,
        });
        clearTimeout(timeout);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new RegistrarError({
                registrar: REGISTRAR_NAME,
                command,
                message: 'Dynadot API request timed out',
                rawSafeSummary: 'timeout',
            });
        }
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command,
            message: err?.message || 'Dynadot API request failed',
            rawSafeSummary: typeof err?.message === 'string' ? err.message.slice(0, 200) : undefined,
        });
    }

    try {
        const text = await response.text();
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command,
            message: 'Dynadot API returned non-JSON response',
            rawSafeSummary: response.status ? `HTTP ${response.status}` : undefined,
            statusCode: response.status,
        });
    }

    // Dynadot wraps responses in e.g. SearchResponse, DomainInfoResponse, SetNsResponse
    // ResponseCode 0 = success, -1 = failure. Status may be "success" or "error"
    const responseCode = getResponseCode(data, command);
    const status = getStatus(data, command);
    const errorMessage = getErrorMessage(data, command);

    if (responseCode !== 0 && responseCode !== '0') {
        const normalizedStatusCode = response.status >= 400 ? response.status : 400;
        throw new RegistrarError({
            registrar: REGISTRAR_NAME,
            command,
            message: errorMessage || `Dynadot API error: ${JSON.stringify(data).slice(0, 100)}`,
            registrarCode: responseCode,
            rawSafeSummary: status ? String(status).slice(0, 100) : undefined,
            statusCode: normalizedStatusCode,
        });
    }

    return data;
}

function getResponseCode(data: Record<string, unknown>, _command: string): number | string | undefined {
    if ('ResponseCode' in data) return data.ResponseCode as number | string;
    if ('SuccessCode' in data) return data.SuccessCode as number | string;
    const wrapper = findFirstKey(data, (v) => !!(v && typeof v === 'object' && ('ResponseCode' in (v as object) || 'SuccessCode' in (v as object))));
    if (!wrapper || typeof wrapper !== 'object') return undefined;
    const w = wrapper as Record<string, unknown>;
    const code = w.ResponseCode ?? w.SuccessCode;
    return code as number | string | undefined;
}

function getStatus(data: Record<string, unknown>, _command: string): string | undefined {
    if ('Status' in data) return data.Status as string;
    const wrapper = findFirstKey(data, (v) => !!(v && typeof v === 'object' && 'Status' in (v as object)));
    if (!wrapper || typeof wrapper !== 'object') return undefined;
    return (wrapper as Record<string, unknown>).Status as string;
}

function getErrorMessage(data: Record<string, unknown>, _command: string): string | undefined {
    if ('Error' in data) return data.Error as string;
    if ('ErrorMessage' in data) return data.ErrorMessage as string;
    if ('error' in data) return data.error as string;

    const wrapper = findFirstKey(data, (v) => !!(v && typeof v === 'object' && ('Error' in (v as object) || 'ErrorMessage' in (v as object))));
    if (!wrapper || typeof wrapper !== 'object') return undefined;
    const w = wrapper as Record<string, unknown>;
    return (w.Error ?? w.ErrorMessage) as string | undefined;
}

/** Check success: Dynadot uses 0 or "0" for success. */
export function isDynadotSuccess(data: Record<string, unknown>): boolean {
    const code = getResponseCode(data, '');
    return code === 0 || code === '0';
}

function findFirstKey(obj: Record<string, unknown>, predicate: (v: unknown) => boolean): unknown {
    for (const v of Object.values(obj)) {
        if (predicate(v)) return v;
    }
    return undefined;
}

/** Extract inner content object from a response (e.g. DomainInfo, SearchResultList). */
export function getResponseContent(data: Record<string, unknown>, contentKey?: string): Record<string, unknown> | undefined {
    const wrapper = Object.values(data).find((v) => v && typeof v === 'object') as Record<string, unknown> | undefined;
    if (!wrapper) return undefined;
    if (contentKey && wrapper[contentKey]) return wrapper[contentKey] as Record<string, unknown>;
    return wrapper;
}
