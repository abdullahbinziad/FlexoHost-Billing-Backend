import mongoose from 'mongoose';
import config from '../../../config';
import logger from '../../../utils/logger';
import Client from '../../client/client.model';
import Product from '../../product/product.model';
import Server from '../../server/server.model';
import * as emailService from '../../email/email.service';
import { buildCustomEmailHtml } from '../../email/build-custom-email';
import { decrypt } from '../../../utils/encryption';
import type { SendResult } from '../../email/templates/types';
import notificationService from '../../notification/notification.service';
import { serviceRepository, hostingDetailsRepository } from '../repositories';
import { ServiceAdminAction } from '../models/service-audit-log.model';
import { ServiceType } from '../types/enums';

type ServiceTemplateKey =
    | 'service.suspended'
    | 'service.unsuspended'
    | 'service.terminated'
    | 'service.hosting_account_created'
    | 'service.renewed';

interface ServiceNotificationContext {
    service: any;
    client: any;
    clientEmail: string;
    customerName: string;
    serviceId: string;
    serviceName: string;
    serviceIdentifier: string;
    manageServiceUrl: string;
    supportUrl: string;
    restoreActionUrl: string;
    hostingDetails?: any;
    productName?: string;
    serverHostname?: string;
    nameservers: string[];
}

function trimSlash(value: string): string {
    return String(value || '').replace(/\/+$/, '');
}

function normalizeHostname(host: string): string {
    return String(host || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
}

function getServicePath(service: any, serviceId: string): string {
    if (service.type === ServiceType.HOSTING) return `/hosting/${serviceId}`;
    if (service.type === ServiceType.VPS) return `/vps/${serviceId}`;
    if (service.type === ServiceType.DOMAIN) return `/domains/${serviceId}`;
    return `/all-services`;
}

function asObjectId(value: unknown): mongoose.Types.ObjectId {
    return value instanceof mongoose.Types.ObjectId
        ? value
        : new mongoose.Types.ObjectId(String(value));
}

export class ServiceNotificationService {
    async resolveContext(serviceId: string): Promise<ServiceNotificationContext> {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const client = await Client.findById(service.clientId).populate('user', 'email').lean();
        if (!client) throw new Error('Client not found for service');

        const clientEmail = String((client as any).contactEmail || (client as any).user?.email || '').trim();
        const customerName =
            [String((client as any).firstName || '').trim(), String((client as any).lastName || '').trim()]
                .filter(Boolean)
                .join(' ') || 'Customer';

        let hostingDetails: any = null;
        let productName = '';
        let serverHostname = '';
        let nameservers: string[] = [];

        if (service.type === ServiceType.HOSTING) {
            hostingDetails = await hostingDetailsRepository.findByServiceId(serviceId);
            if (hostingDetails?.packageId) {
                const product = await Product.findById(hostingDetails.packageId).select('name').lean();
                productName = String((product as any)?.name || '').trim();
            }
            if (hostingDetails?.serverId) {
                const server = await Server.findById(hostingDetails.serverId).select('hostname nameservers').lean();
                serverHostname = normalizeHostname(String((server as any)?.hostname || ''));
                const ns = (server as any)?.nameservers;
                if (ns) {
                    nameservers = [ns.ns1, ns.ns2, ns.ns3, ns.ns4, ns.ns5].filter(Boolean);
                }
            }
            if (nameservers.length === 0 && Array.isArray(hostingDetails?.nameservers)) {
                nameservers = hostingDetails.nameservers.filter(Boolean);
            }
        }

        const frontend = trimSlash(config.frontendUrl);
        const website = trimSlash(config.websiteUrl || config.frontendUrl);
        const path = getServicePath(service, serviceId);
        const identifier =
            hostingDetails?.primaryDomain ||
            (service as any).serviceNumber ||
            service._id.toString();
        const packageSuffix = productName ? ` - ${productName}` : '';
        const serviceName =
            service.type === ServiceType.HOSTING
                ? `Hosting Service${packageSuffix}`
                : `${String(service.type || 'Service').toLowerCase()} Service`;

        return {
            service,
            client,
            clientEmail,
            customerName,
            serviceId,
            serviceName,
            serviceIdentifier: String(identifier),
            manageServiceUrl: `${frontend}${path}`,
            supportUrl: `${website}/support`,
            restoreActionUrl: `${frontend}/invoices`,
            hostingDetails,
            productName,
            serverHostname,
            nameservers,
        };
    }

    private resolveSavedPassword(ctx: ServiceNotificationContext): string {
        const encrypted = String((ctx.service.meta as any)?.lastModulePasswordEncrypted || '').trim();
        if (!encrypted) return '';
        try {
            return decrypt(encrypted) || '';
        } catch {
            return '';
        }
    }

    private buildTemplateProps(
        templateKey: ServiceTemplateKey,
        ctx: ServiceNotificationContext,
        extra?: { password?: string; previousDueDate?: Date | string; nextDueDate?: Date | string; invoiceNumber?: string }
    ): Record<string, unknown> {
        if (templateKey === 'service.suspended') {
            return {
                customerName: ctx.customerName,
                serviceName: ctx.serviceName,
                serviceIdentifier: ctx.serviceIdentifier,
                suspensionReason: String((ctx.service.meta as any)?.suspendReason || 'Administrative action'),
                restoreActionUrl: ctx.restoreActionUrl,
                supportUrl: ctx.supportUrl,
            };
        }
        if (templateKey === 'service.unsuspended') {
            return {
                customerName: ctx.customerName,
                serviceName: ctx.serviceName,
                serviceIdentifier: ctx.serviceIdentifier,
                restoredAt: new Date().toLocaleString('en-GB'),
                manageServiceUrl: ctx.manageServiceUrl,
                supportUrl: ctx.supportUrl,
            };
        }
        if (templateKey === 'service.terminated') {
            return {
                customerName: ctx.customerName,
                serviceName: ctx.serviceName,
                serviceIdentifier: ctx.serviceIdentifier,
                terminationReason: String((ctx.service.meta as any)?.terminationReason || 'Administrative action'),
                restoreInfoUrl: ctx.supportUrl,
                supportUrl: ctx.supportUrl,
            };
        }
        if (templateKey === 'service.renewed') {
            return {
                customerName: ctx.customerName,
                serviceName: ctx.serviceName,
                serviceIdentifier: ctx.serviceIdentifier,
                previousDueDate: extra?.previousDueDate ? new Date(extra.previousDueDate).toLocaleDateString() : 'N/A',
                nextDueDate: extra?.nextDueDate ? new Date(extra.nextDueDate).toLocaleDateString() : 'N/A',
                invoiceNumber: extra?.invoiceNumber,
                manageServiceUrl: ctx.manageServiceUrl,
            };
        }

        const domain = String(ctx.hostingDetails?.primaryDomain || ctx.serviceIdentifier || '');
        const cpanelPassword = String(extra?.password || this.resolveSavedPassword(ctx) || '');
        const fallbackHost = normalizeHostname(domain);
        const serverHostname = ctx.serverHostname || fallbackHost || domain;
        const cpanelUrl = serverHostname
            ? `${config.controlPanel.protocol}://${serverHostname}:${config.controlPanel.port}`
            : `${trimSlash(config.frontendUrl)}${getServicePath(ctx.service, ctx.serviceId)}`;
        return {
            clientName: ctx.customerName,
            domain: domain || ctx.serviceIdentifier,
            cpanelUrl,
            cpanelUsername: String(ctx.hostingDetails?.accountUsername || (ctx.service.meta as any)?.lastModuleUsername || ''),
            cpanelPassword,
            setupPasswordUrl: ctx.manageServiceUrl,
            serverHostname: serverHostname || domain || ctx.serviceIdentifier,
            nameserver1: ctx.nameservers[0] || '',
            nameserver2: ctx.nameservers[1] || '',
            clientPortalUrl: trimSlash(config.frontendUrl),
            supportEmail: config.app.supportEmail,
        };
    }

    private notificationCopy(templateKey: ServiceTemplateKey, ctx: ServiceNotificationContext): { title: string; message: string } {
        if (templateKey === 'service.suspended') {
            return {
                title: `${ctx.serviceName} suspended`,
                message: `${ctx.serviceIdentifier} has been suspended. Please review your billing or contact support.`,
            };
        }
        if (templateKey === 'service.unsuspended') {
            return {
                title: `${ctx.serviceName} restored`,
                message: `${ctx.serviceIdentifier} is active again.`,
            };
        }
        if (templateKey === 'service.terminated') {
            return {
                title: `${ctx.serviceName} terminated`,
                message: `${ctx.serviceIdentifier} has been terminated. Contact support if this looks incorrect.`,
            };
        }
        if (templateKey === 'service.renewed') {
            return {
                title: `${ctx.serviceName} renewed`,
                message: `${ctx.serviceIdentifier} has been renewed successfully.`,
            };
        }
        return {
            title: 'Hosting account created',
            message: `${ctx.serviceIdentifier} is ready. Your hosting account details are available now.`,
        };
    }

    private async createPortalNotification(templateKey: ServiceTemplateKey, ctx: ServiceNotificationContext): Promise<void> {
        const userId = (ctx.client as any).user?._id || (ctx.client as any).user || (ctx.service as any).userId;
        if (!userId) return;
        const copy = this.notificationCopy(templateKey, ctx);
        await notificationService.create({
            userId: asObjectId(userId),
            clientId: asObjectId(ctx.service.clientId),
            category: 'service',
            title: copy.title,
            message: copy.message,
            linkPath: getServicePath(ctx.service, ctx.serviceId),
            linkLabel: 'View service',
            meta: {
                serviceId: ctx.serviceId,
                templateKey,
                serviceType: ctx.service.type,
            },
        });
    }

    async sendTemplateForService(input: {
        serviceId: string;
        templateKey: ServiceTemplateKey;
        actorUserId?: string;
        source?: 'manual' | 'system' | 'cron' | 'webhook';
        sendEmail?: boolean;
        sendPortalNotification?: boolean;
        password?: string;
        previousDueDate?: Date | string;
        nextDueDate?: Date | string;
        invoiceNumber?: string;
    }): Promise<{ email?: SendResult; portalNotificationCreated: boolean }> {
        const ctx = await this.resolveContext(input.serviceId);
        const sendEmail = input.sendEmail !== false;
        const sendPortalNotification = input.sendPortalNotification !== false;
        let email: SendResult | undefined;
        let portalNotificationCreated = false;

        if (sendEmail) {
            if (!ctx.clientEmail) {
                email = { success: false, error: 'Client email not set' };
            } else {
                email = await emailService.sendTemplatedEmail({
                    to: ctx.clientEmail,
                    templateKey: input.templateKey,
                    props: this.buildTemplateProps(input.templateKey, ctx, input) as any,
                    logContext: {
                        clientId: ctx.service.clientId?.toString(),
                        serviceId: input.serviceId,
                        sentBy: input.actorUserId,
                        actorType: input.actorUserId ? 'user' : 'system',
                        source: input.source || 'system',
                        emailType: input.templateKey,
                    },
                });
            }
        }

        if (sendPortalNotification) {
            await this.createPortalNotification(input.templateKey, ctx);
            portalNotificationCreated = true;
        }

        return { email, portalNotificationCreated };
    }

    async notifyActionSuccess(input: {
        serviceId: string;
        action: ServiceAdminAction;
        actorUserId?: string;
        sendNotification?: boolean;
    }): Promise<{ email?: SendResult; portalNotificationCreated: boolean } | null> {
        if (input.sendNotification === false) return null;

        const templateByAction: Partial<Record<ServiceAdminAction, ServiceTemplateKey>> = {
            [ServiceAdminAction.SUSPEND]: 'service.suspended',
            [ServiceAdminAction.UNSUSPEND]: 'service.unsuspended',
            [ServiceAdminAction.TERMINATE]: 'service.terminated',
            [ServiceAdminAction.RETRY_PROVISION]: 'service.hosting_account_created',
        };
        const templateKey = templateByAction[input.action];
        if (!templateKey) {
            if ([ServiceAdminAction.CHANGE_PACKAGE, ServiceAdminAction.CHANGE_PASSWORD].includes(input.action)) {
                return this.notifyGenericActionSuccess(input);
            }
            return null;
        }

        try {
            return await this.sendTemplateForService({
                serviceId: input.serviceId,
                templateKey,
                actorUserId: input.actorUserId,
                source: 'manual',
            });
        } catch (error: any) {
            logger.warn(`[ServiceNotification] Failed for service=${input.serviceId} action=${input.action}: ${error?.message || error}`);
            return {
                email: { success: false, error: error?.message || 'Notification failed' },
                portalNotificationCreated: false,
            };
        }
    }

    private async notifyGenericActionSuccess(input: {
        serviceId: string;
        action: ServiceAdminAction;
        actorUserId?: string;
        sendNotification?: boolean;
    }): Promise<{ email?: SendResult; portalNotificationCreated: boolean } | null> {
        if (input.sendNotification === false) return null;

        try {
            const ctx = await this.resolveContext(input.serviceId);
            const isPassword = input.action === ServiceAdminAction.CHANGE_PASSWORD;
            const subject = isPassword
                ? `Control panel password changed - ${ctx.serviceName}`
                : `Hosting package updated - ${ctx.serviceName}`;
            const message = isPassword
                ? `The control panel password for ${ctx.serviceIdentifier} was changed by the support team. For security, the new password is not included in this email.`
                : `The hosting package for ${ctx.serviceIdentifier} was updated successfully.`;
            let email: SendResult | undefined;

            if (ctx.clientEmail) {
                email = await emailService.sendEmail({
                    to: ctx.clientEmail,
                    subject,
                    text: `${message}\n\nManage service: ${ctx.manageServiceUrl}\nSupport: ${ctx.supportUrl}`,
                    html: buildCustomEmailHtml({
                        clientName: ctx.customerName,
                        message: `${message}\n\nManage service: ${ctx.manageServiceUrl}\nSupport: ${ctx.supportUrl}`,
                        senderLabel: config.app.companyName,
                    }),
                    logContext: {
                        clientId: ctx.service.clientId?.toString(),
                        serviceId: input.serviceId,
                        sentBy: input.actorUserId,
                        actorType: input.actorUserId ? 'user' : 'system',
                        source: 'manual',
                        emailType: isPassword ? 'service_password_changed' : 'service_package_changed',
                        bodyPreview: message,
                    },
                });
            } else {
                email = { success: false, error: 'Client email not set' };
            }

            const userId = (ctx.client as any).user?._id || (ctx.client as any).user || (ctx.service as any).userId;
            let portalNotificationCreated = false;
            if (userId) {
                await notificationService.create({
                    userId: asObjectId(userId),
                    clientId: asObjectId(ctx.service.clientId),
                    category: 'service',
                    title: isPassword ? 'Control panel password changed' : 'Hosting package updated',
                    message,
                    linkPath: getServicePath(ctx.service, input.serviceId),
                    linkLabel: 'View service',
                    meta: {
                        serviceId: input.serviceId,
                        action: input.action,
                        serviceType: ctx.service.type,
                    },
                });
                portalNotificationCreated = true;
            }

            return { email, portalNotificationCreated };
        } catch (error: any) {
            logger.warn(`[ServiceNotification] Generic notification failed for service=${input.serviceId} action=${input.action}: ${error?.message || error}`);
            return {
                email: { success: false, error: error?.message || 'Notification failed' },
                portalNotificationCreated: false,
            };
        }
    }

    isServiceTemplateKey(value: string): value is ServiceTemplateKey {
        return [
            'service.suspended',
            'service.unsuspended',
            'service.terminated',
            'service.hosting_account_created',
            'service.renewed',
        ].includes(value);
    }
}

export default new ServiceNotificationService();
