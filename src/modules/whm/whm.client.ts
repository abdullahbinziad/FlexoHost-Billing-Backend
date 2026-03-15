import fetch from 'node-fetch';
import config from '../../config';

import https from 'https';
import http from 'http';

const WHM_HOST = config.whm.host.replace(/\/$/, ''); // Remove trailing slash if present
const WHM_USER = config.whm.username.trim();
const WHM_TOKEN = config.whm.apiToken.trim();

// HTTPS agent: verify SSL by default. Set WHM_REJECT_UNAUTHORIZED=false for self-signed WHM only.
const httpsAgent = new https.Agent({
    rejectUnauthorized: config.whm.rejectUnauthorized,
});
const httpAgent = new http.Agent();

const getAgent = (parsedUrl: URL) => {
    return parsedUrl.protocol === 'http:' ? httpAgent : httpsAgent;
};

export async function whmRequest(command: string, params: Record<string, any> = {}) {
    const query = new URLSearchParams({
        ...params,
        'api.version': '1'
    }).toString();

    const url = `${WHM_HOST}/json-api/${command}?${query}`;
    const parsedUrl = new URL(url);

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `whm ${WHM_USER}:${WHM_TOKEN}`
        },
        agent: getAgent(parsedUrl)
    });

    const data: any = await res.json();

    if (data.metadata && data.metadata.result === 0) {
        throw new Error(data.metadata.reason || 'WHM API Error');
    }

    if (data.cpanelresult && data.cpanelresult.error) {
        throw new Error(data.cpanelresult.error || data.cpanelresult.data?.reason || 'WHM API Error');
    }

    if (data.result && data.result.status === 0) {
        throw new Error(data.result.statusmsg || 'WHM API Error');
    }

    return data;
}
