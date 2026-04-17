import { serviceRepository, provisioningJobRepository, hostingDetailsRepository } from '../repositories';
import ServiceAuditLog, { ServiceAdminAction } from '../models/service-audit-log.model';
import { ServiceStatus, ProvisioningJobStatus, ServiceType, normalizeBillingCycle } from '../types/enums';
import { serverService } from '../../server/server.service';
import provisioningWorker from '../jobs/provisioning.worker';
import Order from '../../order/order.model';
import OrderItem from '../../order/order-item.model';
import Client from '../../client/client.model';
import { getDetailPersister } from '../provisioning/detail-persisters';
import ProvisioningJob from '../models/provisioning-job.model';
import DomainServiceDetails from '../models/domain-details.model';
import HostingServiceDetails from '../models/hosting-details.model';
import VpsServiceDetails from '../models/vps-details.model';
import EmailServiceDetails from '../models/email-details.model';
import LicenseServiceDetails from '../models/license-details.model';
import Product from '../../product/product.model';
import { encrypt, decrypt } from '../../../utils/encryption';
import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';

export class ServiceAdminService {
    private getEncryptedModulePasswordMetaUpdate(extra?: { password?: string }) {
        const password = String(extra?.password || '');
        if (!password.trim()) return {};
        return {
            lastModulePasswordEncrypted: encrypt(password),
            lastModulePasswordUpdatedAt: new Date().toISOString(),
        };
    }

    private getProductPricingCycleKey(billingCycle: string): string {
        const normalized = String(billingCycle || '').trim().toLowerCase();
        if (normalized === 'semiannually') return 'semiAnnually';
        return normalized;
    }

    private async resolvePricingFromProduct(
        productId: string,
        billingCycle: string,
        preferredCurrency: string
    ): Promise<{ recurring: number; setup: number; currency: string; productName: string }> {
        const product = await Product.findById(productId).lean();
        if (!product) throw new Error('Selected hosting package product not found');
        if (String((product as any).type || '').toLowerCase() !== 'hosting') {
            throw new Error('Selected product is not a hosting package');
        }

        const cycleKey = this.getProductPricingCycleKey(billingCycle);
        const pricingRows = Array.isArray((product as any).pricing) ? (product as any).pricing : [];
        if (pricingRows.length === 0) throw new Error('Selected package has no pricing configured');

        const preferred = String(preferredCurrency || '').trim().toUpperCase();
        const preferredRow = pricingRows.find((row: any) => String(row?.currency || '').toUpperCase() === preferred);
        const selectedRow = preferredRow || pricingRows[0];
        if (!selectedRow) throw new Error('Selected package has no valid pricing rows');

        const cyclePricing = (selectedRow as any)?.[cycleKey];
        if (!cyclePricing?.enable) {
            throw new Error(`Selected package does not have ${billingCycle} cycle enabled`);
        }
        const recurring = Number(cyclePricing?.renewPrice ?? cyclePricing?.price ?? 0);
        const setup = Number(cyclePricing?.setupFee ?? 0);
        if (!Number.isFinite(recurring) || recurring < 0 || !Number.isFinite(setup) || setup < 0) {
            throw new Error('Selected package has invalid pricing values');
        }
        return {
            recurring,
            setup,
            currency: String(selectedRow?.currency || preferred || 'USD').toUpperCase(),
            productName: String((product as any)?.name || '').trim(),
        };
    }

    private normalizeStatusInput(status: string): ServiceStatus {
        const normalized = String(status || '').trim().toUpperCase();
        if (normalized === 'ACTIVE') return ServiceStatus.ACTIVE;
        if (normalized === 'SUSPENDED') return ServiceStatus.SUSPENDED;
        if (normalized === 'TERMINATED') return ServiceStatus.TERMINATED;
        if (normalized === 'CANCELLED') return ServiceStatus.CANCELLED;
        if (normalized === 'PROVISIONING') return ServiceStatus.PROVISIONING;
        if (normalized === 'FAILED') return ServiceStatus.FAILED;
        return ServiceStatus.PENDING;
    }
    private async callWhmForHosting(
        serviceId: string,
        action: 'suspend' | 'unsuspend' | 'terminate' | 'changePackage' | 'changePassword',
        options?: { plan?: string; password?: string; username?: string }
    ): Promise<void> {
        const details = await hostingDetailsRepository.findByServiceId(serviceId);
        if (!details?.serverId) throw new Error('Hosting service has no linked server');
        const accountUsername = details?.accountUsername || options?.username;
        if (!accountUsername) throw new Error('Hosting service has no linked cPanel username');
        const client = await serverService.getWhmClient(details.serverId.toString());
        if (!client) throw new Error('Server WHM configuration unavailable');
        if (action === 'suspend') await client.suspendAccount(accountUsername);
        else if (action === 'unsuspend') await client.unsuspendAccount(accountUsername);
        else if (action === 'terminate') await client.terminateAccount(accountUsername);
        else if (action === 'changePackage' && options?.plan) await client.changePackage(accountUsername, options.plan);
        else if (action === 'changePassword') {
            const password = String(options?.password || '').trim();
            if (!password) throw new Error('Password is required');
            if (password.length < 8) throw new Error('Password must be at least 8 characters');
            await client.changePassword(accountUsername, password);
        }
    }

    async performAction(
        serviceId: string,
        action: ServiceAdminAction,
        actorUserId: string,
        actorIp?: string,
        actorUserAgent?: string,
        extra?: {
            plan?: string;
            username?: string;
            password?: string;
            serverId?: string;
            whmPackage?: string;
            serverGroup?: string;
            serverLocation?: string;
        }
    ) {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const beforeSnapshot = service.toObject();

        if (action === ServiceAdminAction.SUSPEND) {
            if (service.type === ServiceType.HOSTING) await this.callWhmForHosting(serviceId, 'suspend');
            await serviceRepository.updateStatus(serviceId, ServiceStatus.SUSPENDED);
        } else if (action === ServiceAdminAction.UNSUSPEND) {
            if (service.type === ServiceType.HOSTING) await this.callWhmForHosting(serviceId, 'unsuspend');
            await serviceRepository.updateStatus(serviceId, ServiceStatus.ACTIVE, {
                suspendedAt: null as any
            });
        } else if (action === ServiceAdminAction.CANCEL_PENDING) {
            const cancellableStatuses = [ServiceStatus.PENDING, ServiceStatus.PROVISIONING, ServiceStatus.FAILED];
            if (!cancellableStatuses.includes(service.status as ServiceStatus)) {
                throw new Error('Only pending/provisioning/failed services can be cancelled without termination');
            }
            await serviceRepository.updateStatus(serviceId, ServiceStatus.CANCELLED, {
                cancelledAt: new Date(),
                meta: {
                    ...(service.meta || {}),
                    cancelledByAdmin: true,
                    cancellationMode: 'pending_cancel',
                    cancellationReason: 'Cancelled before activation/provision completion',
                    cancelledAt: new Date().toISOString(),
                } as any,
            } as any);

            if (service.invoiceId) {
                await Invoice.updateOne(
                    {
                        _id: service.invoiceId,
                        status: { $in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
                    },
                    {
                        $set: { status: InvoiceStatus.CANCELLED },
                    }
                ).exec();
            }

            await ProvisioningJob.updateMany(
                { orderItemId: service.orderItemId as any, status: { $in: [ProvisioningJobStatus.QUEUED, ProvisioningJobStatus.RUNNING] } },
                { $set: { status: ProvisioningJobStatus.FAILED, lastError: 'Cancelled by admin before activation' } as any }
            ).exec();
        } else if (action === ServiceAdminAction.TERMINATE) {
            if (service.type === ServiceType.HOSTING) await this.callWhmForHosting(serviceId, 'terminate');
            await serviceRepository.updateStatus(serviceId, ServiceStatus.TERMINATED);
        } else if (action === ServiceAdminAction.DELETE) {
            await ProvisioningJob.deleteMany({ orderItemId: service.orderItemId }).exec();
            await DomainServiceDetails.deleteOne({ serviceId: service._id }).exec();
            await HostingServiceDetails.deleteOne({ serviceId: service._id }).exec();
            await VpsServiceDetails.deleteOne({ serviceId: service._id }).exec();
            await EmailServiceDetails.deleteOne({ serviceId: service._id }).exec();
            await LicenseServiceDetails.deleteOne({ serviceId: service._id }).exec();
            await serviceRepository.deleteById(serviceId);
            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            auditLogSafe({
                message: `Service ${serviceId} deleted`,
                type: 'service_terminated',
                category: 'service',
                actorType: 'user',
                actorId: actorUserId,
                targetType: 'service',
                targetId: serviceId,
                source: 'manual',
                clientId: (service.clientId as any)?.toString(),
                serviceId,
                ipAddress: actorIp,
                userAgent: actorUserAgent,
            });
            return null;
        } else if (action === ServiceAdminAction.CHANGE_PACKAGE && extra?.plan) {
            if (service.type === ServiceType.HOSTING) {
                await this.callWhmForHosting(serviceId, 'changePackage', { plan: extra.plan });
                await hostingDetailsRepository.updateByServiceId(serviceId, { packageId: extra.plan });
            }
            await serviceRepository.updateById(serviceId, {
                meta: {
                    ...(service.meta || {}),
                    lastModuleWhmPackage: extra.plan,
                    lastModuleUsedAt: new Date().toISOString(),
                } as any,
            } as any);
        } else if (action === ServiceAdminAction.CHANGE_PASSWORD) {
            if (service.type !== ServiceType.HOSTING) {
                throw new Error('Change password is available for hosting services only');
            }
            await this.callWhmForHosting(serviceId, 'changePassword', {
                password: extra?.password,
                username: extra?.username,
            });
            if (extra?.username?.trim()) {
                await hostingDetailsRepository.updateByServiceId(serviceId, { accountUsername: extra.username.trim() } as any);
            }
            await serviceRepository.updateById(serviceId, {
                meta: {
                    ...(service.meta || {}),
                    lastModuleUsername: extra?.username?.trim() || undefined,
                    ...this.getEncryptedModulePasswordMetaUpdate(extra),
                    lastModuleUsedAt: new Date().toISOString(),
                } as any,
            } as any);
        } else if (action === ServiceAdminAction.RETRY_PROVISION) {
            if (service.type === ServiceType.HOSTING) {
                const order = await Order.findById(service.orderId).lean();
                const orderItem = await OrderItem.findById(service.orderItemId).lean();
                if (!order || !orderItem) throw new Error('Order context missing for hosting reprovision');
                const client = await Client.findById(service.clientId).select('contactEmail').lean();
                const clientEmail = client?.contactEmail || '';
                const hostingDetails = await hostingDetailsRepository.findByServiceId(serviceId);
                const serverLocationFromServer =
                    extra?.serverId
                        ? (await serverService.getServerById(extra.serverId) as any)?.location
                        : undefined;
                const resolvedServerLocation = String(
                    extra?.serverLocation || serverLocationFromServer || hostingDetails?.serverLocation || ''
                ).trim();
                const attemptedHostingUpdates: Record<string, any> = {};
                if (extra?.username?.trim()) attemptedHostingUpdates.accountUsername = extra.username.trim();
                if (extra?.serverId?.trim()) attemptedHostingUpdates.serverId = extra.serverId.trim();
                if ((extra?.whmPackage || extra?.plan || '').trim()) {
                    attemptedHostingUpdates.packageId = String(extra?.whmPackage || extra?.plan).trim();
                }
                if (resolvedServerLocation) attemptedHostingUpdates.serverLocation = resolvedServerLocation;
                if (Object.keys(attemptedHostingUpdates).length > 0) {
                    await hostingDetailsRepository.updateByServiceId(serviceId, attemptedHostingUpdates as any);
                }
                await serviceRepository.updateById(serviceId, {
                    meta: {
                        ...(service.meta || {}),
                        lastModuleUsername: extra?.username?.trim() || undefined,
                        lastModuleServerId: extra?.serverId?.trim() || undefined,
                        lastModuleServerGroup: extra?.serverGroup?.trim() || undefined,
                        lastModuleServerLocation: resolvedServerLocation || undefined,
                        lastModuleWhmPackage: String(extra?.whmPackage || extra?.plan || '').trim() || undefined,
                        ...this.getEncryptedModulePasswordMetaUpdate(extra),
                        lastModuleUsedAt: new Date().toISOString(),
                    } as any,
                } as any);
                try {
                    const { orderService } = await import('../../order/order.service');
                    const created = await orderService.createHostingAccountForOrderItem(
                        orderItem,
                        order,
                        clientEmail,
                        {
                            serverId: extra?.serverId,
                            whmPackage: extra?.whmPackage || extra?.plan,
                            username: extra?.username,
                            password: extra?.password,
                            primaryDomainOverride: hostingDetails?.primaryDomain,
                            updateOrderItemMeta: true,
                            sendWelcomeEmail: true,
                            forceCreate: true,
                        }
                    );
                    const persister = getDetailPersister(ServiceType.HOSTING);
                    if (persister && created.details && Object.keys(created.details).length > 0) {
                        await persister(service._id as any, created.details as Record<string, unknown>);
                    }
                    await serviceRepository.updateStatus(serviceId, ServiceStatus.ACTIVE, {
                        suspendedAt: null as any,
                        terminatedAt: null as any,
                        cancelledAt: null as any,
                        provisioning: {
                            provider: 'whm',
                            remoteId: created.accountUsername,
                            lastSyncedAt: new Date(),
                        } as any,
                    } as any);
                    const refreshed = await serviceRepository.findById(serviceId);
                    if (refreshed) return refreshed;
                } catch (err: any) {
                    // Keep previous status unchanged on failed module action.
                    await serviceRepository.updateById(serviceId, {
                        provisioning: { ...(service.provisioning || {}), lastError: err?.message || 'Manual hosting module run failed' } as any,
                    } as any);
                    throw err;
                }
            }
            // retry-provision creates a new ProvisioningJob for the service.orderItemId (idempotent setup handles existing QUEUED jobs, but we can reset attempts or recreate)
            // If the job already exists and failed, reset attempts or create replacement
            let job = await provisioningJobRepository.findByIdempotencyKey(`${service.invoiceId}:${service.orderItemId}`);
            if (job) {
                await provisioningJobRepository.updateStatus((job._id as unknown) as string, ProvisioningJobStatus.QUEUED, { attempts: 0 });
            } else {
                job = await provisioningJobRepository.create({
                    clientId: service.clientId as any,
                    orderId: service.orderId as any,
                    orderItemId: service.orderItemId as any,
                    invoiceId: service.invoiceId as any,
                    serviceType: service.type,
                    status: ProvisioningJobStatus.QUEUED,
                    attempts: 0,
                    maxAttempts: 3,
                    idempotencyKey: `${service.invoiceId}:${service.orderItemId}`
                });
            }
            provisioningWorker.processQueuedJobs().catch(() => {});
        }

        // Fetch mutated
        const afterService = await serviceRepository.findById(serviceId);

        // Record Audit log
        await ServiceAuditLog.create({
            actorUserId,
            clientId: service.clientId,
            serviceId: service._id,
            action,
            beforeSnapshot,
            afterSnapshot: afterService ? afterService.toObject() : null,
            ip: actorIp,
            userAgent: actorUserAgent
        });

        const { auditLogSafe } = await import('../../activity-log/activity-log.service');
        let eventType:
            | 'hosting_suspended'
            | 'vps_suspended'
            | 'service_suspended'
            | 'service_unsuspended'
            | 'hosting_terminated'
            | 'vps_terminated'
            | 'service_terminated'
            | 'service_cancelled'
            | 'settings_changed'
            | 'other';
        if (action === ServiceAdminAction.SUSPEND) {
            eventType =
                service.type === ServiceType.HOSTING
                    ? 'hosting_suspended'
                    : service.type === ServiceType.VPS
                      ? 'vps_suspended'
                      : 'service_suspended';
        } else if (action === ServiceAdminAction.UNSUSPEND) {
            eventType = 'service_unsuspended';
        } else if (action === ServiceAdminAction.TERMINATE) {
            eventType =
                service.type === ServiceType.HOSTING
                    ? 'hosting_terminated'
                    : service.type === ServiceType.VPS
                      ? 'vps_terminated'
                      : 'service_terminated';
        } else if (action === ServiceAdminAction.CANCEL_PENDING) {
            eventType = 'service_cancelled';
        } else if (action === ServiceAdminAction.CHANGE_PASSWORD) {
            eventType = 'settings_changed';
        } else {
            eventType = 'other';
        }
        auditLogSafe({
            message: `Service ${serviceId} ${action}`,
            type: eventType as any,
            category: 'service',
            actorType: 'user',
            actorId: actorUserId,
            targetType: 'service',
            targetId: serviceId,
            source: 'manual',
            clientId: (service.clientId as any)?.toString(),
            serviceId,
            ipAddress: actorIp,
            userAgent: actorUserAgent,
        });

        return afterService;
    }

    async updateAutomationSchedule(
        serviceId: string,
        actorUserId: string,
        payload: { autoSuspendAt?: string | null; autoTerminateAt?: string | null },
        actorIp?: string,
        actorUserAgent?: string
    ) {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const beforeSnapshot = service.toObject();
        const currentMeta = (service.meta || {}) as Record<string, any>;

        const parsedSuspendAt = payload.autoSuspendAt ? new Date(payload.autoSuspendAt) : null;
        const parsedTerminateAt = payload.autoTerminateAt ? new Date(payload.autoTerminateAt) : null;

        if (parsedSuspendAt && Number.isNaN(parsedSuspendAt.getTime())) {
            throw new Error('Invalid autoSuspendAt date');
        }
        if (parsedTerminateAt && Number.isNaN(parsedTerminateAt.getTime())) {
            throw new Error('Invalid autoTerminateAt date');
        }
        if (parsedSuspendAt && parsedTerminateAt && parsedTerminateAt < parsedSuspendAt) {
            throw new Error('autoTerminateAt must be after autoSuspendAt');
        }

        const updatedMeta: Record<string, any> = {
            ...currentMeta,
            autoSuspendAt: parsedSuspendAt ? parsedSuspendAt.toISOString() : null,
            autoTerminateAt: parsedTerminateAt ? parsedTerminateAt.toISOString() : null,
            automationUpdatedAt: new Date().toISOString(),
        };

        const updated = await serviceRepository.updateById(serviceId, { meta: updatedMeta } as any);

        await ServiceAuditLog.create({
            actorUserId,
            clientId: service.clientId,
            serviceId: service._id,
            action: ServiceAdminAction.UPDATE_AUTOMATION,
            beforeSnapshot,
            afterSnapshot: updated ? updated.toObject() : null,
            ip: actorIp,
            userAgent: actorUserAgent
        });

        return updated;
    }

    async updateStatus(
        serviceId: string,
        actorUserId: string,
        status: string,
        actorIp?: string,
        actorUserAgent?: string
    ) {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const beforeSnapshot = service.toObject();
        const targetStatus = this.normalizeStatusInput(status);
        const extra: Record<string, unknown> = {};
        if (targetStatus === ServiceStatus.ACTIVE) {
            extra.suspendedAt = null;
            extra.terminatedAt = null;
            extra.cancelledAt = null;
        }
        const updated = await serviceRepository.updateStatus(serviceId, targetStatus, extra as any);

        await ServiceAuditLog.create({
            actorUserId,
            clientId: service.clientId,
            serviceId: service._id,
            action: ServiceAdminAction.UPDATE_STATUS,
            beforeSnapshot,
            afterSnapshot: updated ? updated.toObject() : null,
            ip: actorIp,
            userAgent: actorUserAgent,
        });

        const { auditLogSafe } = await import('../../activity-log/activity-log.service');
        auditLogSafe({
            message: `Service ${serviceId} status updated to ${targetStatus}`,
            type: 'settings_changed',
            category: 'service',
            actorType: 'user',
            actorId: actorUserId,
            targetType: 'service',
            targetId: serviceId,
            source: 'manual',
            clientId: (service.clientId as any)?.toString(),
            serviceId,
            ipAddress: actorIp,
            userAgent: actorUserAgent,
            meta: { status: targetStatus },
        });

        return updated;
    }

    async updateAdminNotes(serviceId: string, adminNotes: string): Promise<any> {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');
        const currentMeta = (service.meta || {}) as Record<string, any>;
        const updatedMeta = { ...currentMeta, adminNotes: adminNotes ?? '' };
        return serviceRepository.updateById(serviceId, { meta: updatedMeta } as any);
    }

    async revealLastModulePassword(
        serviceId: string,
        actorUserId: string,
        actorIp?: string,
        actorUserAgent?: string
    ): Promise<{ password: string }> {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');
        if (service.type !== ServiceType.HOSTING) {
            throw new Error('Saved password reveal is available for hosting services only');
        }

        const encrypted = String((service.meta as any)?.lastModulePasswordEncrypted || '').trim();
        if (!encrypted) {
            throw new Error('No saved module password found for this service');
        }

        const password = decrypt(encrypted);
        if (!password) {
            throw new Error('Saved module password could not be decrypted');
        }

        const { auditLogSafe } = await import('../../activity-log/activity-log.service');
        auditLogSafe({
            message: `Saved module password revealed for service ${serviceId}`,
            type: 'settings_changed',
            category: 'service',
            actorType: 'user',
            actorId: actorUserId,
            targetType: 'service',
            targetId: serviceId,
            source: 'manual',
            severity: 'high',
            clientId: (service.clientId as any)?.toString(),
            serviceId,
            ipAddress: actorIp,
            userAgent: actorUserAgent,
        });

        return { password };
    }

    async updateServiceProfile(
        serviceId: string,
        actorUserId: string,
        payload: {
            packageName?: string;
            productId?: string;
            primaryDomain?: string;
            serverLocation?: string;
            billingCycle?: string;
            nextDueDate?: string | null;
            registrationDate?: string | null;
            paymentMethod?: string;
            firstPaymentAmount?: number | string;
            createdAt?: string | null;
            updatedAt?: string | null;
            recurringAmount?: number | string;
            currency?: string;
            recalculateRecurring?: boolean;
        },
        actorIp?: string,
        actorUserAgent?: string
    ) {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const beforeSnapshot = service.toObject();
        const currentMeta = (service.meta || {}) as Record<string, any>;
        const updateData: Record<string, any> = {};
        const updatedMeta: Record<string, any> = { ...currentMeta };

        if (typeof payload.packageName === 'string') {
            updatedMeta.adminPackageName = payload.packageName.trim();
        }
        if (typeof payload.productId === 'string') {
            updatedMeta.adminPackageProductId = payload.productId.trim();
        }

        if (typeof payload.billingCycle === 'string' && payload.billingCycle.trim()) {
            updateData.billingCycle = normalizeBillingCycle(payload.billingCycle);
        }

        if (typeof payload.nextDueDate === 'string' && payload.nextDueDate.trim()) {
            const parsedNextDueDate = new Date(payload.nextDueDate);
            if (Number.isNaN(parsedNextDueDate.getTime())) throw new Error('Invalid nextDueDate');
            updateData.nextDueDate = parsedNextDueDate;
        }
        if (typeof payload.registrationDate === 'string' && payload.registrationDate.trim()) {
            const registrationInput = payload.registrationDate.trim();
            const parsedRegistrationDate = new Date(registrationInput);
            if (Number.isNaN(parsedRegistrationDate.getTime())) throw new Error('Invalid registrationDate');
            updatedMeta.adminBillingRegistrationDate =
                /^\d{4}-\d{2}-\d{2}$/.test(registrationInput)
                    ? registrationInput
                    : parsedRegistrationDate.toISOString().slice(0, 10);
        }
        if (typeof payload.paymentMethod === 'string') {
            updatedMeta.adminBillingPaymentMethod = payload.paymentMethod.trim();
        }
        if (payload.firstPaymentAmount !== undefined) {
            const firstPaymentAmount = Number(payload.firstPaymentAmount);
            if (!Number.isFinite(firstPaymentAmount) || firstPaymentAmount < 0) throw new Error('Invalid firstPaymentAmount');
            updatedMeta.adminBillingFirstPaymentAmount = firstPaymentAmount;
        }

        if (typeof payload.createdAt === 'string' && payload.createdAt.trim()) {
            const parsedCreatedAt = new Date(payload.createdAt);
            if (Number.isNaN(parsedCreatedAt.getTime())) throw new Error('Invalid createdAt');
            updatedMeta.trackingCreatedAt = parsedCreatedAt.toISOString();
        }
        if (typeof payload.updatedAt === 'string' && payload.updatedAt.trim()) {
            const parsedUpdatedAt = new Date(payload.updatedAt);
            if (Number.isNaN(parsedUpdatedAt.getTime())) throw new Error('Invalid updatedAt');
            updatedMeta.trackingUpdatedAt = parsedUpdatedAt.toISOString();
        }

        const recurringAmount = Number(payload.recurringAmount);
        if (payload.recurringAmount !== undefined && Number.isFinite(recurringAmount) && recurringAmount >= 0) {
            const currentPrice = (service.priceSnapshot || {}) as Record<string, any>;
            const setup = Number(currentPrice.setup || 0);
            const discount = Number(currentPrice.discount || 0);
            const tax = Number(currentPrice.tax || 0);
            updateData.priceSnapshot = {
                setup,
                recurring: recurringAmount,
                discount,
                tax,
                total: Math.max(0, recurringAmount + setup - discount + tax),
                currency: (typeof payload.currency === 'string' && payload.currency.trim()) || currentPrice.currency || service.currency || 'USD',
            };
            updateData.currency = updateData.priceSnapshot.currency;
        }

        // Auto-resolve recurring/setup from selected hosting package + cycle.
        // Important: ONLY run when explicitly requested via recalculateRecurring.
        const selectedProductId = String(payload.productId || updatedMeta.adminPackageProductId || '').trim();
        const effectiveBillingCycle = String(updateData.billingCycle || service.billingCycle || '').trim();
        const wantsRecalc = payload.recalculateRecurring === true;
        if (selectedProductId && effectiveBillingCycle && wantsRecalc) {
            const resolved = await this.resolvePricingFromProduct(
                selectedProductId,
                effectiveBillingCycle,
                String(payload.currency || service.currency || '')
            );
            const currentPrice = (updateData.priceSnapshot || service.priceSnapshot || {}) as Record<string, any>;
            const discount = Number(currentPrice.discount || 0);
            const tax = Number(currentPrice.tax || 0);
            updateData.priceSnapshot = {
                setup: resolved.setup,
                recurring: resolved.recurring,
                discount,
                tax,
                total: Math.max(0, resolved.recurring + resolved.setup - discount + tax),
                currency: String(payload.currency || resolved.currency || service.currency || 'USD'),
            };
            updateData.currency = updateData.priceSnapshot.currency;
            if (!payload.packageName?.trim()) {
                updatedMeta.adminPackageName = resolved.productName;
            }
            updatedMeta.adminPackageProductId = selectedProductId;
        }

        updateData.meta = updatedMeta;

        await serviceRepository.updateById(serviceId, updateData as any);

        if (service.type === ServiceType.HOSTING) {
            const hostingUpdates: Record<string, any> = {};
            if (typeof payload.primaryDomain === 'string') {
                hostingUpdates.primaryDomain = payload.primaryDomain.trim().toLowerCase();
            }
            if (typeof payload.serverLocation === 'string') {
                hostingUpdates.serverLocation = payload.serverLocation.trim();
            }
            if (Object.keys(hostingUpdates).length > 0) {
                await hostingDetailsRepository.updateByServiceId(serviceId, hostingUpdates as any);
            }
        }

        const afterService = await serviceRepository.findById(serviceId);
        await ServiceAuditLog.create({
            actorUserId,
            clientId: service.clientId,
            serviceId: service._id,
            action: ServiceAdminAction.UPDATE_PROFILE,
            beforeSnapshot,
            afterSnapshot: afterService ? afterService.toObject() : null,
            ip: actorIp,
            userAgent: actorUserAgent,
        });

        return afterService;
    }
}

export default new ServiceAdminService();
