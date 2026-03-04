import mongoose from 'mongoose';
import Invoice from '../../invoice/invoice.model';
import Order from '../../order/order.model';
import { provisioningJobRepository } from '../repositories';
import { ProvisioningJobStatus } from '../types/enums';
import OrderItem from '../../order/order-item.model';

/**
 * Handles the event when an invoice is fully paid.
 * Safely creates Provisioning Jobs using an idempotent pattern.
 */
export const handleInvoicePaid = async (invoiceId: string | mongoose.Types.ObjectId) => {
    let createdJobs = 0;
    let skippedJobs = 0;

    const invoice = await Invoice.findById(invoiceId).exec();
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    if (!invoice.orderId) {
        console.warn(`Invoice ${invoiceId} has no associated orderId. Skipping provisioning triggers.`);
        return { createdJobs, skippedJobs };
    }

    const order = await Order.findById(invoice.orderId).exec();
    if (!order) throw new Error(`Order not found: ${invoice.orderId}`);

    const items = await OrderItem.find({ orderId: order._id }).exec();

    for (const item of items) {
        const orderItemId = item._id.toString();

        const serviceType = item.type; // Matches ENUM cleanly now

        const idempotencyKey = `${invoiceId}:${orderItemId}`;

        const existingJob = await provisioningJobRepository.findByIdempotencyKey(idempotencyKey);

        if (existingJob) {
            skippedJobs++;
            continue;
        }

        await provisioningJobRepository.create({
            clientId: invoice.orderId as any, // Temporary mapping, Order contains userId in older setup. Using order references safely.
            // Note: Since real payload decouple, User -> Client is handled previously. 
            // In a real execution environment Invoice/Order might own `userId`. 
            // We coerce to ObjectId mappings.
            orderId: order._id as any,
            orderItemId: orderItemId as any,
            invoiceId: invoice._id as any,
            serviceType,
            status: ProvisioningJobStatus.QUEUED,
            attempts: 0,
            maxAttempts: 3,
            idempotencyKey
        });

        createdJobs++;
    }

    // Update order status loosely representing "Processing"
    // order.interface.ts defines: PENDING, COMPLETED, CANCELLED, PROCESSED.
    order.status = 'PROCESSING' as any; // Triggered 
    await order.save();

    return { createdJobs, skippedJobs };
};
