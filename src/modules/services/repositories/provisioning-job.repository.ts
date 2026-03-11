import crypto from 'crypto';
import ProvisioningJob, { IProvisioningJob } from '../models/provisioning-job.model';
import { ProvisioningJobStatus } from '../types/enums';

export class ProvisioningJobRepository {
    async create(data: Partial<IProvisioningJob>): Promise<IProvisioningJob> {
        return await ProvisioningJob.create(data);
    }

    async findById(id: string): Promise<IProvisioningJob | null> {
        return await ProvisioningJob.findById(id).exec();
    }

    async findByIdempotencyKey(idempotencyKey: string): Promise<IProvisioningJob | null> {
        return await ProvisioningJob.findOne({ idempotencyKey }).exec();
    }

    /**
     * Atomically locks a batch of jobs for processing.
     * Finds jobs that are QUEUED and where attempts < maxAttempts,
     * OR jobs that are RUNNING but lock has expired (stale locks).
     * 
     * @param limit Maximum number of jobs to lock
     * @param lockDurationMs How long the lock is valid for (to detect stale locks)
     * @returns Array of locked jobs
     */
    async lockBatchForProcessing(limit: number = 10, lockDurationMs: number = 5 * 60 * 1000): Promise<IProvisioningJob[]> {
        const lockOwner = crypto.randomBytes(16).toString('hex');
        const now = new Date();
        const staleLockThreshold = new Date(now.getTime() - lockDurationMs);

        // Find QUEUED jobs (attempts < maxAttempts), or RUNNING jobs with expired lock
        const queuedFilter = {
            status: ProvisioningJobStatus.QUEUED,
            $expr: { $lt: ['$attempts', '$maxAttempts'] },
        };
        const staleFilter = {
            status: ProvisioningJobStatus.RUNNING,
            lockedAt: { $lt: staleLockThreshold },
        };
        const findFilter = { $or: [queuedFilter, staleFilter] };

        const jobsToLock = await ProvisioningJob.find(findFilter)
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean()
            .exec();

        if (jobsToLock.length === 0) {
            return [];
        }

        const jobIds = jobsToLock.map((j: any) => j._id);

        const updateResult = await ProvisioningJob.updateMany(
            { _id: { $in: jobIds }, ...findFilter },
            {
                $set: {
                    status: ProvisioningJobStatus.RUNNING,
                    lockedAt: now,
                    lockOwner,
                },
                $inc: { attempts: 1 },
            }
        ).exec();

        if (updateResult.modifiedCount === 0) {
            return [];
        }

        return await ProvisioningJob.find({ lockOwner, lockedAt: now }).sort({ createdAt: 1 }).exec();
    }

    async updateStatus(id: string, status: ProvisioningJobStatus, extraData: Partial<IProvisioningJob> = {}): Promise<IProvisioningJob | null> {
        const updatePayload: any = {
            $set: { status, ...extraData }
        };

        // If finishing (success or failed), we clear the lock fields
        if (status === ProvisioningJobStatus.SUCCESS || status === ProvisioningJobStatus.FAILED) {
            updatePayload.$unset = { lockedAt: 1, lockOwner: 1 };
        }

        return await ProvisioningJob.findByIdAndUpdate(id, updatePayload, { new: true }).exec();
    }
}

export default new ProvisioningJobRepository();
