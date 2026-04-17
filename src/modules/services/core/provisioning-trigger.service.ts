import mongoose from 'mongoose';
import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import Order from '../../order/order.model';
import Client from '../../client/client.model';
import { provisioningJobRepository, serviceRepository } from '../repositories';
import { ProvisioningJobStatus, ServiceStatus, ServiceType } from '../types/enums';
import OrderItem from '../../order/order-item.model';
import Product from '../../product/product.model';
import Server from '../../server/server.model';
import provisioningWorker from '../jobs/provisioning.worker';
import { getDetailPersister } from '../provisioning/detail-persisters';
import logger from '../../../utils/logger';

/**
 * Handles the event when an invoice is fully paid.
 * Creates provisioning jobs and runs the worker so cPanel/domain provisioning runs.
 */
export const handleInvoicePaid = async (invoiceId: string | mongoose.Types.ObjectId) => {
    let createdJobs = 0;
    let skippedJobs = 0;
    let inlineProvisioned = 0;
    let inlineFailed = 0;

    const invoice = await Invoice.findById(invoiceId).exec();
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    if (invoice.status !== InvoiceStatus.PAID || (invoice.balanceDue ?? 0) > 0) {
        logger.warn(
            `[Provisioning] Invoice ${invoiceId} is not fully paid (status=${invoice.status}, balanceDue=${invoice.balanceDue}). Skipping provisioning.`
        );
        return { createdJobs, skippedJobs, inlineProvisioned, inlineFailed };
    }

    if (!invoice.orderId) {
        logger.warn(`[Provisioning] Invoice ${invoiceId} has no orderId. Skipping.`);
        return { createdJobs, skippedJobs, inlineProvisioned, inlineFailed };
    }

    const order = await Order.findById(invoice.orderId).exec();
    if (!order) throw new Error(`Order not found: ${invoice.orderId}`);

    const items = await OrderItem.find({ orderId: order._id }).exec();
    const clientDoc = await Client.findById(invoice.clientId).select('contactEmail').lean();
    const clientEmail = clientDoc?.contactEmail || '';
    logger.info(`[Provisioning] Invoice ${invoiceId} paid. Order ${order.orderNumber} has ${items.length} item(s).`);

    for (const item of items) {
        const orderItemId = item._id.toString();
        const rawType = (item as any).type;
        const serviceType = (typeof rawType === 'string' ? rawType.toUpperCase() : rawType) as ServiceType;

        // Direct one-shot hosting provisioning immediately on payment.
        if (serviceType === ServiceType.HOSTING) {
            const existingService = await serviceRepository.findByOrderItemId(orderItemId);
            if (
                existingService &&
                ![ServiceStatus.ACTIVE, ServiceStatus.TERMINATED, ServiceStatus.CANCELLED].includes(
                    existingService.status as ServiceStatus
                )
            ) {
                await serviceRepository.updateStatus((existingService._id as any).toString(), ServiceStatus.PROVISIONING);
            }
            try {
                const { orderService } = await import('../../order/order.service');
                const created = await orderService.createHostingAccountForOrderItem(
                    item,
                    order,
                    clientEmail,
                    { updateOrderItemMeta: true, sendWelcomeEmail: true, forceCreate: true }
                );
                const latestService = await serviceRepository.findByOrderItemId(orderItemId);
                if (latestService) {
                    const persister = getDetailPersister(ServiceType.HOSTING);
                    if (persister && created.details && Object.keys(created.details).length > 0) {
                        await persister(latestService._id as any, created.details as Record<string, unknown>);
                    }
                    const cfg = (item as any).configSnapshot || {};
                    let serverGroupMeta = String(cfg.serverGroup || '').trim();
                    if (!serverGroupMeta && (item as any).productId) {
                        const prod = await Product.findById((item as any).productId).select('module.serverGroup').lean();
                        serverGroupMeta = String((prod as any)?.module?.serverGroup || '').trim();
                    }
                    const serverDoc = created.serverId
                        ? await Server.findById(created.serverId).select('location').lean()
                        : null;
                    const existingMeta = ((latestService as any).meta || {}) as Record<string, unknown>;
                    await serviceRepository.updateStatus((latestService._id as any).toString(), ServiceStatus.ACTIVE, {
                        suspendedAt: null as any,
                        terminatedAt: null as any,
                        provisioning: {
                            provider: 'whm',
                            remoteId: created.accountUsername,
                            lastSyncedAt: new Date(),
                        } as any,
                        meta: {
                            ...existingMeta,
                            lastModuleServerId: created.serverId,
                            lastModuleWhmPackage: created.whmPackageName,
                            lastModuleServerGroup: serverGroupMeta || undefined,
                            lastModuleServerLocation: (serverDoc as any)?.location
                                ? String((serverDoc as any).location)
                                : undefined,
                            lastModuleUsername: created.accountUsername,
                            lastModuleUsedAt: new Date().toISOString(),
                        },
                    } as any);
                }
                inlineProvisioned++;
                logger.info(`[Provisioning] Inline hosting provisioned for orderItem ${orderItemId}.`);
            } catch (err: any) {
                const latestService = await serviceRepository.findByOrderItemId(orderItemId);
                if (latestService) {
                    await serviceRepository.updateStatus((latestService._id as any).toString(), ServiceStatus.FAILED, {
                        provisioning: { lastError: err?.message || 'Inline hosting provisioning failed' } as any,
                    } as any);
                }
                inlineFailed++;
                logger.warn(`[Provisioning] Inline hosting failed for orderItem ${orderItemId}: ${err?.message || err}`);
            }
            continue;
        }

        const idempotencyKey = `${invoiceId}:${orderItemId}`;

        const existingJob = await provisioningJobRepository.findByIdempotencyKey(idempotencyKey);

        if (existingJob) {
            if (existingJob.status !== ProvisioningJobStatus.SUCCESS) {
                await provisioningJobRepository.forceRequeueNow(existingJob._id.toString(), 0);
                createdJobs++;
                logger.info(`[Provisioning] Force re-queued existing job (${existingJob.status}) for orderItem ${orderItemId}.`);
            } else {
                skippedJobs++;
            }
            continue;
        }

        await provisioningJobRepository.create({
            clientId: invoice.clientId as any,
            orderId: order._id as any,
            orderItemId: orderItemId as any,
            invoiceId: invoice._id as any,
            serviceType,
            status: ProvisioningJobStatus.QUEUED,
            attempts: 0,
            maxAttempts: 1,
            idempotencyKey,
        });

        createdJobs++;
        logger.info(`[Provisioning] Created job for orderItem ${orderItemId} type=${serviceType}.`);
    }

    order.status = 'PROCESSING' as any;
    await order.save();

    if (createdJobs > 0 || skippedJobs > 0) {
        logger.info(`[Provisioning] Running worker now (created=${createdJobs}, skipped=${skippedJobs}).`);
        try {
            const processed = await provisioningWorker.processQueuedJobs();
            logger.info(`[Provisioning] Worker processed ${processed} job(s).`);
        } catch (err: any) {
            logger.error('[Provisioning] Worker failed:', err?.message || err);
            throw err;
        }
    }

    try {
        const { orderService } = await import('../../order/order.service');
        await orderService.finalizeOrderIfProvisioned(order._id.toString());
    } catch {
        // no-op
    }

    return { createdJobs, skippedJobs, inlineProvisioned, inlineFailed };
};
