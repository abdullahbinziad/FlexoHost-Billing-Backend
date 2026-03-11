import { serviceRepository, provisioningJobRepository, hostingDetailsRepository } from '../repositories';
import ServiceAuditLog, { ServiceAdminAction } from '../models/service-audit-log.model';
import { ServiceStatus, ProvisioningJobStatus, ServiceType } from '../types/enums';
import { serverService } from '../../server/server.service';

export class ServiceAdminService {
    private async callWhmForHosting(serviceId: string, action: 'suspend' | 'unsuspend' | 'terminate' | 'changePackage', plan?: string): Promise<void> {
        const details = await hostingDetailsRepository.findByServiceId(serviceId);
        if (!details?.serverId || !details?.accountUsername) throw new Error('Hosting service has no linked server or username');
        const client = await serverService.getWhmClient(details.serverId.toString());
        if (!client) throw new Error('Server WHM configuration unavailable');
        if (action === 'suspend') await client.suspendAccount(details.accountUsername);
        else if (action === 'unsuspend') await client.unsuspendAccount(details.accountUsername);
        else if (action === 'terminate') await client.terminateAccount(details.accountUsername);
        else if (action === 'changePackage' && plan) await client.changePackage(details.accountUsername, plan);
    }

    async performAction(
        serviceId: string,
        action: ServiceAdminAction,
        actorUserId: string,
        actorIp?: string,
        actorUserAgent?: string,
        extra?: { plan?: string }
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
        } else if (action === ServiceAdminAction.TERMINATE) {
            if (service.type === ServiceType.HOSTING) await this.callWhmForHosting(serviceId, 'terminate');
            await serviceRepository.updateStatus(serviceId, ServiceStatus.TERMINATED);
        } else if (action === ServiceAdminAction.CHANGE_PACKAGE && extra?.plan) {
            if (service.type === ServiceType.HOSTING) {
                await this.callWhmForHosting(serviceId, 'changePackage', extra.plan);
                await hostingDetailsRepository.updateByServiceId(serviceId, { packageId: extra.plan });
            }
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
