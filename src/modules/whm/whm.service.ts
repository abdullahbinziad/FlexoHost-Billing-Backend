/**
 * WHM service - uses WhmApiClient (single code path).
 * For API routes we use the default client from config.whm.
 * For per-server operations use serverService.getWhmClient(serverId).
 */

import config from '../../config';
import { WhmApiClient } from './whm-api-client';

let defaultClient: WhmApiClient | null | undefined = undefined;

function getDefaultClient(): WhmApiClient {
    if (defaultClient === undefined) {
        const host = (config.whm?.host || '').replace(/\/$/, '').trim();
        const username = config.whm?.username?.trim() || '';
        const apiToken = config.whm?.apiToken?.trim() || '';
        if (!host || !username || !apiToken) {
            defaultClient = null;
        } else {
            const hostname = host.replace(/^https?:\/\//i, '').split('/')[0].trim().toLowerCase();
            const useSSL = /^https:/i.test(host);
            defaultClient = new WhmApiClient({
                hostname,
                useSSL,
                username,
                apiToken,
            });
        }
    }
    if (!defaultClient) {
        throw new Error('WHM is not configured. Set WHM_HOST, WHM_USERNAME, and WHM_API_TOKEN.');
    }
    return defaultClient;
}

export interface CreateAccountPayload {
    username: string;
    domain: string;
    plan: string;
    email: string;
    password?: string;
}

export async function createAccount(payload: CreateAccountPayload) {
    const client = getDefaultClient();
    return client.createAccount({
        username: payload.username,
        domain: payload.domain,
        plan: payload.plan,
        email: payload.email,
        password: payload.password,
    });
}

export async function suspendAccount(username: string, reason: string = 'Overdue Invoice') {
    return getDefaultClient().suspendAccount(username, reason);
}

export async function unsuspendAccount(username: string) {
    return getDefaultClient().unsuspendAccount(username);
}

export async function terminateAccount(username: string) {
    return getDefaultClient().terminateAccount(username);
}

export async function changePassword(username: string, password: string) {
    return getDefaultClient().changePassword(username, password);
}

export async function changePackage(username: string, plan: string) {
    return getDefaultClient().changePackage(username, plan);
}

export async function verifyUsername(username: string) {
    return getDefaultClient().verifyUsername(username);
}

export async function accountSummary(username: string) {
    return getDefaultClient().request('accountsummary', { user: username });
}
