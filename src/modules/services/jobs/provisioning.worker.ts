import mongoose from 'mongoose';
import {
    provisioningJobRepository,
    serviceRepository,
    domainDetailsRepository,
    hostingDetailsRepository,
    vpsDetailsRepository,
    emailDetailsRepository,
    licenseDetailsRepository
} from '../repositories';
import Order from '../../order/order.model';
import { orderService } from '../../order/order.service';
import { ProvisioningJobStatus, ServiceStatus, ServiceType, BillingCycle } from '../types/enums';
import {
    domainRegistrarProvider,
    hostingPanelProvider,
    vpsProvider,
    emailProvider,
    licenseProvider
} from '../providers/stubs';
import { DomainOperationType, DomainTransferStatus } from '../models/domain-details.model';
import { ControlPanelType } from '../models/hosting-details.model';
import { getNextSequence, formatSequenceId } from '../../../models/counter.model';

export class ProvisioningWorker {
    /**
     * Main cron loop trigger to process any queued jobs.
     */
    async processQueuedJobs() {
        // Lock up to 10 queued jobs (or stale running tasks) atomically
        const lockedJobs = await provisioningJobRepository.lockBatchForProcessing(10, 5 * 60 * 1000);

        if (lockedJobs.length === 0) return 0;

        for (const job of lockedJobs) {
            try {
                await this.processSingleJob(job);
            } catch (err: any) {
                // Determine whether to retry or fail permanently
                const newAttempts = job.attempts;
                const finalStatus = newAttempts >= job.maxAttempts
                    ? ProvisioningJobStatus.FAILED
                    : ProvisioningJobStatus.QUEUED;

                await provisioningJobRepository.updateStatus((job._id as unknown) as string, finalStatus, {
                    lastError: err.message || 'Unknown error during job execution'
                });
            }
        }

        return lockedJobs.length;
    }

    private async processSingleJob(job: any) {
        // 1. Idempotency Check: if Service exists for orderItemId => mark job SUCCESS and continue
        let service = await serviceRepository.findByOrderItemId(job.orderItemId.toString());

        if (service) {
            // Already created, we assume success or previously completed
            await provisioningJobRepository.updateStatus(job._id as string, ProvisioningJobStatus.SUCCESS);
            return;
        }

        // 2. We need the OrderItem payload to populate provisioning data
        const order = await Order.findById(job.orderId).exec();
        if (!order) throw new Error(`Order not found for Job: ${job.orderId}`);

        const item = await mongoose.model('OrderItem').findById(job.orderItemId).exec() as any;
        if (!item) throw new Error(`OrderItem not found: ${job.orderItemId}`);

        // 3. Create Service Master record with PROVISIONING status
        const svcSeq = await getNextSequence('service');
        service = await serviceRepository.create({
            serviceNumber: formatSequenceId('SVC', svcSeq),
            clientId: job.clientId,
            userId: order.userId,
            orderId: job.orderId,
            orderItemId: job.orderItemId,
            invoiceId: job.invoiceId,
            type: job.serviceType,
            status: ServiceStatus.PROVISIONING,
            billingCycle: item.billingCycle?.toUpperCase() as BillingCycle || BillingCycle.MONTHLY,
            currency: order.currency || 'USD',
            priceSnapshot: {
                setup: 0,
                recurring: item.pricingSnapshot?.total || 0,
                discount: 0,
                tax: 0,
                total: item.pricingSnapshot?.total || 0,
                currency: order.currency || 'USD'
            },
            autoRenew: true,
            nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 1 month approx for demo
        });

        const serviceId = (service._id as unknown) as string;
        let remoteProvisioningId = null;

        try {
            // 4 & 5. Branch based on type: create correct detail record AND call provider logic
            switch (job.serviceType) {
                case ServiceType.DOMAIN:
                    const isTransfer = item.actionType === 'TRANSFER';
                    // Detail record
                    await domainDetailsRepository.create({
                        serviceId: service._id as any,
                        domainName: item.configSnapshot?.domainName || 'unknown.com',
                        sld: 'unknown',
                        tld: 'com',
                        registrar: 'StubRegistrar',
                        operationType: isTransfer ? DomainOperationType.TRANSFER : DomainOperationType.REGISTER,
                        transferStatus: isTransfer ? DomainTransferStatus.PENDING : undefined,
                        eppCodeEncrypted: isTransfer ? Buffer.from(item.configSnapshot.eppCode || '').toString('base64') : undefined,
                        contacts: {
                            registrant: { firstName: 'Stub', lastName: 'Stub', email: 'stub@example.com', phone: '123', address1: '123', city: 'Stub', state: 'ST', postcode: '123', country: 'US' },
                            admin: { firstName: 'Stub', lastName: 'Stub', email: 'stub@example.com', phone: '123', address1: '123', city: 'Stub', state: 'ST', postcode: '123', country: 'US' },
                            tech: { firstName: 'Stub', lastName: 'Stub', email: 'stub@example.com', phone: '123', address1: '123', city: 'Stub', state: 'ST', postcode: '123', country: 'US' },
                            billing: { firstName: 'Stub', lastName: 'Stub', email: 'stub@example.com', phone: '123', address1: '123', city: 'Stub', state: 'ST', postcode: '123', country: 'US' }
                        },
                        contactsSameAsRegistrant: true,
                        nameservers: ['ns1.stub.com', 'ns2.stub.com'],
                        registrarLock: true,
                        whoisPrivacy: false,
                        dnssecEnabled: false,
                        dnsManagementEnabled: false,
                        emailForwardingEnabled: false,
                        eppStatusCodes: []
                    });

                    // Provider integration
                    if (isTransfer) {
                        const res = await domainRegistrarProvider.requestTransfer({
                            domainName: item.configSnapshot?.domainName || 'unknown.com',
                            eppCode: item.configSnapshot?.eppCode || ''
                        });
                        remoteProvisioningId = res.remoteId;
                    } else {
                        const res = await domainRegistrarProvider.registerDomain({
                            domainName: item.configSnapshot?.domainName || 'unknown.com',
                            periodYears: item.configSnapshot?.years || 1,
                            nameservers: ['ns1.stub.com', 'ns2.stub.com'],
                            contacts: {}
                        });
                        remoteProvisioningId = res.remoteId;
                    }
                    break;

                case ServiceType.HOSTING:
                    await hostingDetailsRepository.create({
                        serviceId: service._id as any,
                        primaryDomain: item.configSnapshot?.primaryDomain || 'unknown.com',
                        serverId: new mongoose.Types.ObjectId().toString(),
                        controlPanel: ControlPanelType.CPANEL,
                        packageId: item.productId,
                        resourceLimits: { diskMb: 10000, bandwidthMb: 100000, inodeLimit: 100000 },
                        sslEnabled: true,
                        dedicatedIp: false
                    });

                    const hostRes = await hostingPanelProvider.createAccount({
                        domain: item.configSnapshot?.primaryDomain || 'unknown.com',
                        packageId: item.productId,
                        serverLocation: item.configSnapshot?.serverLocation || 'Auto'
                    });
                    remoteProvisioningId = hostRes.remoteId;
                    break;

                case ServiceType.VPS:
                    await vpsDetailsRepository.create({
                        serviceId: service._id as any,
                        provider: 'StubCloud',
                        region: item.configSnapshot?.region || 'us-east-1',
                        plan: { cpuCores: 2, ramMb: 4096, diskGb: 80 },
                        osImage: 'ubuntu-20.04'
                    });

                    const vpsRes = await vpsProvider.createInstance({
                        region: item.configSnapshot?.region || 'us-east-1',
                        planId: item.productId,
                        osImage: 'ubuntu-20.04'
                    });
                    remoteProvisioningId = vpsRes.remoteId;
                    break;

                case ServiceType.EMAIL:
                    await emailDetailsRepository.create({
                        serviceId: service._id as any,
                        domain: item.configSnapshot?.domain || 'unknown.com',
                        provider: 'StubMail',
                        mailboxCount: 10,
                        mailboxes: []
                    });

                    const mailRes = await emailProvider.createTenantOrPlan({
                        domain: item.configSnapshot?.domain || 'unknown.com',
                        mailboxCount: 10
                    });
                    remoteProvisioningId = mailRes.remoteId;
                    break;

                case ServiceType.LICENSE:
                    await licenseDetailsRepository.create({
                        serviceId: service._id as any,
                        productName: 'FlexoHost Standard License',
                        licenseKeyHash: 'STUBHASH-NEVER-RAW-ABC',
                        displayLast4: 'WXYZ',
                        activationLimit: 1,
                        activationsUsed: 0,
                        entitlements: ['core', 'updates']
                    });

                    const licRes = await licenseProvider.issueLicense({
                        productName: 'FlexoHost Standard License'
                    });
                    remoteProvisioningId = licRes.remoteId;
                    break;

                default:
                    throw new Error(`Unsupported Provisioning Type: ${job.serviceType}`);
            }

            // 6. On success: update service.provisioning.remoteId and set service.status=ACTIVE, set job SUCCESS
            await serviceRepository.updateStatus(serviceId, ServiceStatus.ACTIVE, {
                provisioning: {
                    provider: 'StubProvider',
                    remoteId: remoteProvisioningId,
                    lastSyncedAt: new Date()
                }
            });

            await provisioningJobRepository.updateStatus(job._id as string, ProvisioningJobStatus.SUCCESS);

            // On success triggers finalize checker 
            await orderService.finalizeOrderIfProvisioned(job.orderId.toString());

        } catch (provErr: any) {
            // 7. On failure: fail service, fail job
            await serviceRepository.updateStatus(serviceId, ServiceStatus.FAILED, {
                provisioning: {
                    lastError: provErr.message
                }
            });

            throw provErr; // Pass error up to the `catch()` in `processQueuedJobs()`
        }
    }
}

export default new ProvisioningWorker();
