import Service from '../service.model';
import DomainServiceDetails, { DomainOperationType, DomainTransferStatus } from '../models/domain-details.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import { ServiceType, ServiceStatus } from '../types/enums';
import { registrarAudit } from '../../domain/registrar/registrar-audit';
import { domainRegistrarService } from '../../domain/registrar/domain-registrar.service';

export class DomainSyncScheduler {

    /**
     * Goal: Update transferStatus for domain services where transfer is pending.
     * Rules: Query ACTIVE DOMAIN services where transferStatus=PENDING.
     * Call stub, update status.
     */
    async processDomainTransferSync() {
        // Find domains that are currently pending transfer natively in detail records
        const pendingTransfers = await DomainServiceDetails.find({
            operationType: DomainOperationType.TRANSFER,
            transferStatus: DomainTransferStatus.PENDING
        }).lean().exec();

        let syncedCount = 0;
        let completedCount = 0;

        for (const domainRef of pendingTransfers) {
            // Verify parent service is ACTIVE still
            const parentService = await Service.findOne({
                _id: domainRef.serviceId,
                status: ServiceStatus.ACTIVE,
                type: ServiceType.DOMAIN
            }).exec();

            if (!parentService) continue;

            try {
                // Rate-Limiter emulation (mock logic runs instantly but imagine delay here)
                const transferState = await domainRegistrarService.getTransferStatus(domainRef.domainName, domainRef.registrar);

                const updates: any = {};
                if (transferState.status === 'COMPLETED') {
                    updates.transferStatus = DomainTransferStatus.COMPLETED;
                    updates.transferredAt = new Date();
                    if (transferState.expiresAt) updates.expiresAt = transferState.expiresAt;
                    if (transferState.eppStatusCodes) updates.eppStatusCodes = transferState.eppStatusCodes;
                    completedCount++;
                } else if (transferState.status === 'REJECTED' || transferState.status === 'CANCELLED') {
                    updates.transferStatus = transferState.status;
                    // Usually log the rejection reason safely to our audit ledger as well!
                    await ServiceAuditLog.create({
                        clientId: parentService.clientId,
                        serviceId: parentService._id,
                        action: 'TRANSFER_REJECTED',
                        beforeSnapshot: { transferStatus: DomainTransferStatus.PENDING },
                        afterSnapshot: { transferStatus: transferState.status, reason: transferState.reason || 'Unknown' }
                    });
                }

                updates.lastRegistrarSyncAt = new Date();

                registrarAudit({
                    event: 'domain.transfer.status_updated',
                    domain: domainRef.domainName,
                    status: transferState.status === 'COMPLETED' ? 'success' : 'pending',
                });

                // Apply details
                await DomainServiceDetails.updateOne({ _id: domainRef._id }, { $set: updates });

                // Synchronize master Service record explicitly
                parentService.provisioning = parentService.provisioning || {};
                parentService.provisioning.lastSyncedAt = new Date();

                // Set native tracking metadata
                if (transferState.reason) {
                    parentService.meta = parentService.meta || {};
                    parentService.meta.lastTransferReason = transferState.reason;
                }

                await parentService.save();

                syncedCount++;

            } catch (error) {
                console.error(`Error syncing domain transfer for ${domainRef.domainName}:`, error);
            }
        }

        console.log(`[DomainSync] Transfer Sync Cycle. Synced: ${syncedCount} | Completed: ${completedCount}`);
        return { syncedCount, completedCount };
    }

    /**
     * Goal: Ensure domain expiresAt and registrar statuses are accurate.
     * Rules: Query active/suspended domains. Detect explicit date drifts.
     */
    async processDomainExpirySync() {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 1); // Only check if we haven't synced in 24 hours

        const domainsToSync = await DomainServiceDetails.find({
            $or: [
                { lastRegistrarSyncAt: { $lte: thresholdDate } },
                { lastRegistrarSyncAt: { $exists: false } },
                { lastRegistrarSyncAt: null }
            ],
            // could optionally query where registrarDomainId exists, but right now names are unique identifiers usually!
        }).limit(20).lean().exec(); // batches of 20 

        let syncedCount = 0;
        let driftDetectedAlerts = 0;

        for (const domainData of domainsToSync) {
            const parentService = await Service.findOne({
                _id: domainData.serviceId,
                status: { $in: [ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED] }
            }).exec();

            if (!parentService) continue;

            try {
                const liveInfo = await domainRegistrarService.getDomainInformation(domainData.domainName, domainData.registrar);

                // Drift detection logic on expiresAt (significant: 3+ days difference)
                if (domainData.expiresAt && liveInfo.expiryDate) {
                    const diffMs = Math.abs(liveInfo.expiryDate.getTime() - domainData.expiresAt.getTime());
                    const diffDays = diffMs / (1000 * 60 * 60 * 24);
                    if (diffDays > 3) {
                        driftDetectedAlerts++;
                        // Native generic Event Log
                        await ServiceAuditLog.create({
                            clientId: parentService.clientId,
                            serviceId: parentService._id,
                            action: 'EXPIRY_DRIFT_DETECTED',
                            beforeSnapshot: { expiresAt: domainData.expiresAt },
                            afterSnapshot: { expiresAt: liveInfo.expiryDate, diffDays }
                        });
                    }
                }

                // Push updates blindly to stay synchronized
                await DomainServiceDetails.updateOne(
                    { _id: domainData._id },
                    {
                        $set: {
                            expiresAt: liveInfo.expiryDate,
                            registrarLock: liveInfo.locked,
                            nameservers: liveInfo.nameservers ?? [],
                            eppStatusCodes: liveInfo.locked ? ['clientTransferProhibited'] : [],
                            registrar: liveInfo.registrar,
                            lastRegistrarSyncAt: new Date()
                        }
                    }
                );

                // Adjust Master natively
                parentService.provisioning = parentService.provisioning || {};
                parentService.provisioning.lastSyncedAt = new Date();
                await parentService.save();

                registrarAudit({
                    event: 'domain.sync.completed',
                    domain: domainData.domainName,
                    status: 'success',
                });

                syncedCount++;

            } catch (err) {
                console.error(`Error checking expiry for ${domainData.domainName}:`, err);
            }
        }

        console.log(`[DomainSync] Expiry Drift Check complete. Synced: ${syncedCount} | Drift Alerts: ${driftDetectedAlerts}`);
        return { syncedCount, driftDetectedAlerts };
    }
}

export default new DomainSyncScheduler();
