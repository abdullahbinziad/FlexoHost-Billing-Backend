/**
 * Send "New Hosting Account Created" email after successful provisioning.
 * Loads service, hosting details, client, and server from DB.
 * Password must be passed in (never read from DB).
 *
 * SECURITY NOTE: This email includes the cPanel password in plaintext. Ensure:
 * - SMTP uses TLS; emails are transmitted over encrypted channels.
 * - Consider alternative: send a "Set your password" link instead (one-time token).
 * - Never log or persist the password.
 */

import type { SendResult } from '../../email/templates/types';
import config from '../../../config';
import { serviceRepository, hostingDetailsRepository } from '../repositories';
import { ServiceType } from '../types/enums';
import Client from '../../client/client.model';
import Server from '../../server/server.model';
import * as emailService from '../../email/email.service';
import { DEFAULT_BRAND } from '../../email/templates/config';
import logger from '../../../utils/logger';

/** Strip protocol and trailing slashes so hostname is safe for building https:// URLs. */
function normalizeHostname(host: string): string {
    if (!host || typeof host !== 'string') return '';
    return host.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
}

export async function sendHostingAccountCreatedEmail(
    serviceId: string | { toString(): string },
    password: string
): Promise<SendResult> {
    const id = typeof serviceId === 'string' ? serviceId : (serviceId as any).toString();

    if (!password || typeof password !== 'string') {
        logger.warn(`[HostingAccountEmail] Password required for service: ${id}`);
        return { success: false, error: 'Account password not available' };
    }

    const service = await serviceRepository.findById(id);
    if (!service) {
        logger.warn(`[HostingAccountEmail] Service not found: ${id}`);
        return { success: false, error: 'Service not found' };
    }

    if (service.type !== ServiceType.HOSTING) {
        logger.warn(`[HostingAccountEmail] Service ${id} is not HOSTING type`);
        return { success: false, error: 'Service is not a hosting service' };
    }

    const details = await hostingDetailsRepository.findByServiceId(id);
    if (!details) {
        logger.warn(`[HostingAccountEmail] Hosting details not found for service: ${id}`);
        return { success: false, error: 'Hosting details not found' };
    }

    const client = await Client.findById(service.clientId).select('firstName lastName contactEmail').lean();
    if (!client) {
        logger.warn(`[HostingAccountEmail] Client not found for service: ${id}`);
        return { success: false, error: 'Client not found' };
    }

    const clientEmail = (client as any).contactEmail;
    if (!clientEmail) {
        logger.warn(`[HostingAccountEmail] Client has no contact email for service: ${id}`);
        return { success: false, error: 'Client email not set' };
    }

    let serverHostname = '';
    let nameserver1 = '';
    let nameserver2 = '';
    let cpanelUrl = '';

    if (details.serverId) {
        const server = await Server.findById(details.serverId).select('hostname nameservers').lean();
        if (server) {
            const raw = (server as any).hostname || '';
            serverHostname = normalizeHostname(raw);
            const ns = (server as any).nameservers;
            if (ns) {
                nameserver1 = ns.ns1 || '';
                nameserver2 = ns.ns2 || '';
            }
            // Control panel URL built from Server collection hostname; 2083 = standard cPanel HTTPS port
            if (serverHostname) {
                cpanelUrl = `https://${serverHostname}:2083`;
            }
        }
    }
    if (!serverHostname && Array.isArray(details.nameservers) && details.nameservers.length > 0) {
        nameserver1 = details.nameservers[0] || '';
        nameserver2 = details.nameservers[1] || '';
    }

    const domain = details.primaryDomain || '';
    if (!cpanelUrl) {
        cpanelUrl = domain ? `https://${domain}/cpanel` : '';
    }
    const clientPortalUrl = (config.cors?.origin || 'http://localhost:3000').replace(/\/$/, '');
    const supportEmail = DEFAULT_BRAND.supportEmail;
    const clientName = [((client as any).firstName || '').trim(), ((client as any).lastName || '').trim()]
        .filter(Boolean)
        .join(' ') || 'Customer';

    return emailService.sendTemplatedEmail({
        to: clientEmail,
        templateKey: 'service.hosting_account_created',
        props: {
            clientName,
            domain,
            cpanelUrl,
            cpanelUsername: details.accountUsername || '',
            cpanelPassword: password,
            serverHostname,
            nameserver1,
            nameserver2,
            clientPortalUrl,
            supportEmail,
        },
    });
}
