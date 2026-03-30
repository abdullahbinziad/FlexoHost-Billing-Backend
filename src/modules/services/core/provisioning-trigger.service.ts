import mongoose from 'mongoose';
import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import Order from '../../order/order.model';
import { provisioningJobRepository } from '../repositories';
import { ProvisioningJobStatus } from '../types/enums';
import OrderItem from '../../order/order-item.model';
import provisioningWorker from '../jobs/provisioning.worker';
import logger from '../../../utils/logger';

/**
 * Handles the event when an invoice is fully paid.
 * Creates provisioning jobs and runs the worker so cPanel/domain provisioning runs.
 */
export const handleInvoicePaid = async (invoiceId: string | mongoose.Types.ObjectId) => {
    let createdJobs = 0;
    let skippedJobs = 0;

    const invoice = await Invoice.findById(invoiceId).exec();
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    if (invoice.status !== InvoiceStatus.PAID || (invoice.balanceDue ?? 0) > 0) {
        logger.warn(
            `[Provisioning] Invoice ${invoiceId} is not fully paid (status=${invoice.status}, balanceDue=${invoice.balanceDue}). Skipping provisioning.`
        );
        return { createdJobs, skippedJobs };
    }

    if (!invoice.orderId) {
        logger.warn(`[Provisioning] Invoice ${invoiceId} has no orderId. Skipping.`);
        return { createdJobs, skippedJobs };
    }

    const order = await Order.findById(invoice.orderId).exec();
    if (!order) throw new Error(`Order not found: ${invoice.orderId}`);

    const items = await OrderItem.find({ orderId: order._id }).exec();
    logger.info(`[Provisioning] Invoice ${invoiceId} paid. Order ${order.orderNumber} has ${items.length} item(s).`);

    for (const item of items) {
        const orderItemId = item._id.toString();
        const rawType = (item as any).type;
        const serviceType = typeof rawType === 'string' ? rawType.toUpperCase() : rawType;

        const idempotencyKey = `${invoiceId}:${orderItemId}`;

        const existingJob = await provisioningJobRepository.findByIdempotencyKey(idempotencyKey);

        if (existingJob) {
            if (existingJob.status === ProvisioningJobStatus.FAILED) {
                await provisioningJobRepository.updateStatus(existingJob._id.toString(), ProvisioningJobStatus.QUEUED, { attempts: 0 } as any);
                createdJobs++;
                logger.info(`[Provisioning] Re-queued failed job for orderItem ${orderItemId}.`);
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
            maxAttempts: 3,
            idempotencyKey,
        });

        createdJobs++;
        logger.info(`[Provisioning] Created job for orderItem ${orderItemId} type=${serviceType}.`);
    }

    order.status = 'PROCESSING' as any;
    await order.save();

    if (createdJobs > 0) {
        logger.info(`[Provisioning] Running worker for ${createdJobs} job(s).`);
        try {
            const processed = await provisioningWorker.processQueuedJobs();
            logger.info(`[Provisioning] Worker processed ${processed} job(s).`);
        } catch (err: any) {
            logger.error('[Provisioning] Worker failed:', err?.message || err);
            throw err;
        }
    }

    return { createdJobs, skippedJobs };
};
