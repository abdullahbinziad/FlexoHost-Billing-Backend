import Service from '../service.model';
import ServiceActionJob from '../models/service-action-job.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import { ServiceStatus, ServiceActionType, ProvisioningJobStatus } from '../types/enums';

export class ServiceTerminationScheduler {
    /**
     * Job targeting Suspended services enforcing deep automated Termination rules.
     */
    async processTerminations() {
        // Configurability rule: 30 days of deep suspension forces implicit deletion / Termination natively.
        const terminationLimit = new Date();
        terminationLimit.setDate(terminationLimit.getDate() - 30); // 30 Day rule configuration

        const servicesToTerminate = await Service.find({
            status: ServiceStatus.SUSPENDED,
            suspendedAt: { $lte: terminationLimit }
        }).exec();

        let terminatedCount = 0;

        for (const svc of servicesToTerminate) {
            svc.status = ServiceStatus.TERMINATED;
            svc.terminatedAt = new Date();
            await svc.save();

            // 1. Audit Logging Native Protection
            await ServiceAuditLog.create({
                clientId: svc.clientId,
                serviceId: svc._id,
                action: 'TERMINATE',
                beforeSnapshot: { status: ServiceStatus.SUSPENDED, suspendedAt: svc.suspendedAt },
                afterSnapshot: { status: ServiceStatus.TERMINATED, terminatedAt: svc.terminatedAt },
            });

            // 2. Queue Downstream Provider Termination execution natively!
            try {
                await ServiceActionJob.create({
                    serviceId: svc._id,
                    action: ServiceActionType.TERMINATE,
                    status: ProvisioningJobStatus.QUEUED,
                });
            } catch (err: any) {
                if (err.code !== 11000) {
                    console.error('Failed to create TERMINATE service action job: ', err);
                }
            }

            terminatedCount++;
        }

        console.log(`[Scheduler] Termination enforcement sweep completed. Terminated ${terminatedCount} dead services safely.`);
        return terminatedCount;
    }
}

export default new ServiceTerminationScheduler();
