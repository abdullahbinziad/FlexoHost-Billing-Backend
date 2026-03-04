import { serviceRepository, provisioningJobRepository } from '../repositories';
import ServiceAuditLog, { ServiceAdminAction } from '../models/service-audit-log.model';
import { ServiceStatus, ProvisioningJobStatus } from '../types/enums';

export class ServiceAdminService {
    async performAction(
        serviceId: string,
        action: ServiceAdminAction,
        actorUserId: string,
        actorIp?: string,
        actorUserAgent?: string
    ) {
        const service = await serviceRepository.findById(serviceId);
        if (!service) throw new Error('Service not found');

        const beforeSnapshot = service.toObject();

        // Perform specific action
        if (action === ServiceAdminAction.SUSPEND) {
            await serviceRepository.updateStatus(serviceId, ServiceStatus.SUSPENDED);
        } else if (action === ServiceAdminAction.UNSUSPEND) {
            await serviceRepository.updateStatus(serviceId, ServiceStatus.ACTIVE, {
                suspendedAt: null as any
            });
        } else if (action === ServiceAdminAction.TERMINATE) {
            await serviceRepository.updateStatus(serviceId, ServiceStatus.TERMINATED);
        } else if (action === ServiceAdminAction.RETRY_PROVISION) {
            // retry-provision creates a new ProvisioningJob for the service.orderItemId (idempotent setup handles existing QUEUED jobs, but we can reset attempts or recreate)
            // If the job already exists and failed, reset attempts or create replacement
            let job = await provisioningJobRepository.findByIdempotencyKey(`${service.invoiceId}:${service.orderItemId}`);
            if (job) {
                await provisioningJobRepository.updateStatus((job._id as unknown) as string, ProvisioningJobStatus.QUEUED, { attempts: 0 });
            } else {
                await provisioningJobRepository.create({
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
            await serviceRepository.updateStatus(serviceId, ServiceStatus.PROVISIONING);
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

        return afterService;
    }
}

export default new ServiceAdminService();
