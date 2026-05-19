import Service from '../service.model';
import DomainServiceDetails, { DomainLifecycleStatus, DomainOperationType, DomainTransferStatus } from '../models/domain-details.model';
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
                if (transferState.status === DomainTransferStatus.COMPLETED) {
                    updates.transferStatus = DomainTransferStatus.COMPLETED;
                    updates.lifecycleStatus = DomainLifecycleStatus.ACTIVE;
                    updates.lifecycleReason = 'Transfer completed at registrar';
                    updates.lifecycleUpdatedAt = new Date();
                    updates.lastAutoStatusAt = new Date();
                    updates.transferredAt = new Date();
                    if (transferState.expiresAt) updates.expiresAt = transferState.expiresAt;
                    if (transferState.eppStatusCodes) updates.eppStatusCodes = transferState.eppStatusCodes;
                    completedCount++;
                } else if (
                    transferState.status === DomainTransferStatus.REJECTED ||
                    transferState.status === DomainTransferStatus.CANCELLED
                ) {
                    updates.transferStatus = transferState.status;
                    updates.lifecycleStatus = transferState.status === DomainTransferStatus.CANCELLED
                        ? DomainLifecycleStatus.CANCELLED
                        : DomainLifecycleStatus.FRAUD;
                    updates.lifecycleReason = transferState.reason || `Transfer ${transferState.status.toLowerCase()}`;
                    updates.lifecycleUpdatedAt = new Date();
                    updates.lastAutoStatusAt = new Date();
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
                    status: transferState.status === DomainTransferStatus.COMPLETED ? 'success' : 'pending',
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
                status: {
                    $in: [
                        ServiceStatus.ACTIVE,
                        ServiceStatus.SUSPENDED,
                        ServiceStatus.PROVISIONING,
                        ServiceStatus.PENDING,
                        ServiceStatus.FAILED,
                    ],
                }
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

                const now = new Date();
                const lifecycleStatus = shouldRespectManualStatusOverride(domainData.manualStatusOverrideUntil)
                    ? domainData.lifecycleStatus
                    : deriveLifecycleStatus(liveInfo, domainData);

                await DomainServiceDetails.updateOne(
                    { _id: domainData._id },
                    {
                        $set: {
                            expiresAt: liveInfo.expiryDate,
                            registrarLock: liveInfo.locked,
                            nameservers: liveInfo.nameservers ?? [],
                            eppStatusCodes: liveInfo.locked ? ['clientTransferProhibited'] : [],
                            registrar: liveInfo.registrar,
                            registrarStatus: liveInfo.status,
                            lifecycleStatus,
                            lifecycleReason: shouldRespectManualStatusOverride(domainData.manualStatusOverrideUntil)
                                ? domainData.lifecycleReason
                                : 'Updated from registrar sync',
                            lifecycleUpdatedAt: now,
                            lastAutoStatusAt: shouldRespectManualStatusOverride(domainData.manualStatusOverrideUntil)
                                ? domainData.lastAutoStatusAt
                                : now,
                            lastRegistrarSyncAt: now,
                            syncStatus: 'success',
                            syncMessage: 'Synced successfully',
                        }
                    }
                );

                // Adjust Master natively
                parentService.provisioning = parentService.provisioning || {};
                parentService.provisioning.lastSyncedAt = now;
                parentService.provisioning.lastError = '';
                if (
                    lifecycleStatus === DomainLifecycleStatus.ACTIVE &&
                    !parentService.meta?.domainRecoveryPendingConfirmation &&
                    [ServiceStatus.PENDING, ServiceStatus.PROVISIONING, ServiceStatus.FAILED].includes(parentService.status as ServiceStatus)
                ) {
                    parentService.status = ServiceStatus.ACTIVE;
                    parentService.suspendedAt = undefined as any;
                    parentService.terminatedAt = undefined as any;
                    parentService.cancelledAt = undefined as any;
                }
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

function shouldRespectManualStatusOverride(value?: Date | string | null): boolean {
    if (!value) return false;
    const until = new Date(value);
    return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
}

function deriveLifecycleStatus(liveInfo: any, domainData: any): DomainLifecycleStatus {
    const raw = `${String(liveInfo.status || '').toLowerCase()} ${String(liveInfo.renewOption || '').toLowerCase()} ${JSON.stringify(liveInfo.raw || {}).toLowerCase()}`;
    if (domainData.operationType === DomainOperationType.TRANSFER && domainData.transferStatus !== DomainTransferStatus.COMPLETED) {
        if (domainData.transferStatus === DomainTransferStatus.CANCELLED) return DomainLifecycleStatus.CANCELLED;
        if (domainData.transferStatus === DomainTransferStatus.REJECTED) return DomainLifecycleStatus.FRAUD;
        return DomainLifecycleStatus.PENDING_TRANSFER;
    }
    if (/transfer.*away|transferred.*away|not in account|not found|external/i.test(raw)) {
        return DomainLifecycleStatus.TRANSFERRED_AWAY;
    }
    if (/redemption|restore/i.test(raw)) return DomainLifecycleStatus.REDEMPTION_PERIOD_EXPIRED;
    if (/grace/i.test(raw)) return DomainLifecycleStatus.GRACE_PERIOD_EXPIRED;
    if (/cancel/i.test(raw)) return DomainLifecycleStatus.CANCELLED;
    if (/fraud/i.test(raw)) return DomainLifecycleStatus.FRAUD;
    if (liveInfo.expiryDate && liveInfo.expiryDate.getTime() < Date.now()) return DomainLifecycleStatus.EXPIRED;
    if (/active|ok|clienttransferprohibited|locked/i.test(raw) || liveInfo.domain) return DomainLifecycleStatus.ACTIVE;
    return domainData.operationType === DomainOperationType.TRANSFER
        ? DomainLifecycleStatus.PENDING_TRANSFER
        : DomainLifecycleStatus.PENDING_REGISTRATION;
}

export default new DomainSyncScheduler();
