import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Service from '../modules/services/service.model';
import Invoice from '../modules/invoice/invoice.model';
import RenewalLedger from '../modules/services/models/renewal-ledger.model';
import serviceRenewalScheduler from '../modules/services/jobs/service-renewal.scheduler';
import serviceTerminationScheduler from '../modules/services/jobs/service-termination.scheduler';
import serviceLifecycleService from '../modules/services/core/service-lifecycle.service';

dotenv.config();

type NullableDate = Date | null | undefined;

interface BackupState {
    service: {
        status: string;
        suspendedAt: NullableDate;
        terminatedAt: NullableDate;
        nextDueDate: NullableDate;
        autoRenew: boolean;
        billingCycle: string;
    };
    settings: {
        renewalLeadDays?: number;
        daysBeforeSuspend?: number;
        daysBeforeTermination?: number;
    };
}

interface CheckStatus {
    name: string;
    pass: boolean;
    details?: string;
}

function printSummary(report: Record<string, any>) {
    const checks = report.checks || {};
    const statuses: CheckStatus[] = [
        {
            name: 'Renewal invoice generated',
            pass: Boolean(checks.renewal?.result?.invoicesCreated > 0 && checks.renewal?.hasServiceLink),
            details: checks.renewal?.invoiceId ? `invoiceId=${checks.renewal.invoiceId}` : 'no invoice',
        },
        {
            name: 'Overdue invoice suspends service',
            pass: String(checks.suspend?.status || '') === 'SUSPENDED',
            details: `status=${checks.suspend?.status || 'unknown'}`,
        },
        {
            name: 'Suspended service terminates',
            pass: String(checks.terminate?.status || '') === 'TERMINATED',
            details: `status=${checks.terminate?.status || 'unknown'}`,
        },
        {
            name: 'Paid renewal advances nextDueDate',
            pass:
                String(checks.paymentRenewal?.beforeNextDueDate || '') !==
                String(checks.paymentRenewal?.afterNextDueDate || ''),
            details: `${checks.paymentRenewal?.beforeNextDueDate || 'n/a'} -> ${checks.paymentRenewal?.afterNextDueDate || 'n/a'}`,
        },
    ];

    const passCount = statuses.filter((s) => s.pass).length;
    const total = statuses.length;
    const overallPass = passCount === total;

    // eslint-disable-next-line no-console
    console.log('\n===== Renewal Flow Verification Summary =====');
    for (const s of statuses) {
        // eslint-disable-next-line no-console
        console.log(`[${s.pass ? 'PASS' : 'FAIL'}] ${s.name}${s.details ? ` (${s.details})` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(`Overall: ${overallPass ? 'PASS' : 'FAIL'} (${passCount}/${total})`);
    // eslint-disable-next-line no-console
    console.log('============================================\n');
}

async function resolveServiceIdFromArgOrDb(argServiceId?: string): Promise<string> {
    if (argServiceId && mongoose.isValidObjectId(argServiceId)) {
        return argServiceId;
    }

    const candidate = await Service.findOne({
        type: 'HOSTING',
        status: 'ACTIVE',
    })
        .sort({ updatedAt: -1 })
        .lean()
        .exec();

    if (!candidate?._id) {
        throw new Error('No active hosting service found. Provide serviceId as argument.');
    }

    return String(candidate._id);
}

async function main() {
    const argServiceId = process.argv[2];
    const dbName = process.env.MONGODB_DB || 'test';

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not configured.');
    }

    await mongoose.connect(process.env.MONGODB_URI, { dbName });
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Mongo database connection is unavailable.');
    }

    const serviceId = await resolveServiceIdFromArgOrDb(argServiceId);
    const settingsCol = db.collection('billingsettings');

    const service = await Service.findById(serviceId).exec();
    if (!service) {
        throw new Error(`Service not found: ${serviceId}`);
    }

    const settings = await settingsCol.findOne({ key: 'global' });
    if (!settings) {
        throw new Error('Billing settings document not found (key=global).');
    }

    const backup: BackupState = {
        service: {
            status: String(service.status),
            suspendedAt: service.suspendedAt,
            terminatedAt: service.terminatedAt,
            nextDueDate: service.nextDueDate,
            autoRenew: Boolean(service.autoRenew),
            billingCycle: String(service.billingCycle),
        },
        settings: {
            renewalLeadDays: settings.renewalLeadDays,
            daysBeforeSuspend: settings.daysBeforeSuspend,
            daysBeforeTermination: settings.daysBeforeTermination,
        },
    };

    const report: Record<string, unknown> = {
        dbName,
        serviceId,
        checks: {},
    };

    try {
        const now = new Date();

        // 1) Prepare service + settings for deterministic test.
        service.status = 'ACTIVE' as any;
        service.suspendedAt = null as any;
        service.terminatedAt = null as any;
        service.autoRenew = true;
        service.billingCycle = 'annually' as any;
        service.nextDueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        await service.save();

        await settingsCol.updateOne(
            { key: 'global' },
            { $set: { renewalLeadDays: 7, daysBeforeSuspend: 1, daysBeforeTermination: 1 } }
        );

        // 2) Renewal invoice generation check.
        const renewalStart = new Date();
        const renewalRes = await serviceRenewalScheduler.processRenewals();
        const renewalInvoice = await Invoice.findOne({ 'items.meta.serviceId': service._id })
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        report.checks = {
            ...(report.checks as object),
            renewal: {
                result: renewalRes,
                invoiceId: renewalInvoice?._id ? String(renewalInvoice._id) : null,
                invoiceStatus: renewalInvoice?.status || null,
                hasServiceLink: Boolean(
                    renewalInvoice?.items?.some((item: any) => String(item?.meta?.serviceId || '') === String(service._id))
                ),
                createdAfterStart: Boolean(
                    renewalInvoice?.createdAt && new Date(renewalInvoice.createdAt) >= renewalStart
                ),
            },
        };

        // 3) Overdue -> suspend check.
        if (renewalInvoice?._id) {
            await Invoice.updateOne(
                { _id: renewalInvoice._id },
                {
                    $set: {
                        status: 'UNPAID',
                        dueDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
                    },
                }
            );
        }

        const suspendRes = await serviceRenewalScheduler.processOverdueEnforcements();
        const suspendedService = await Service.findById(service._id).lean().exec();
        (report.checks as any).suspend = {
            result: suspendRes,
            status: suspendedService?.status || null,
            suspendedAt: suspendedService?.suspendedAt || null,
        };

        // 4) Suspend -> terminate check.
        await Service.updateOne(
            { _id: service._id },
            {
                $set: {
                    status: 'SUSPENDED',
                    suspendedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
                    terminatedAt: null,
                },
            }
        );
        const terminateRes = await serviceTerminationScheduler.processTerminations();
        const terminatedService = await Service.findById(service._id).lean().exec();
        (report.checks as any).terminate = {
            result: terminateRes,
            status: terminatedService?.status || null,
            terminatedAt: terminatedService?.terminatedAt || null,
        };

        // 5) Paid invoice -> nextDueDate advance check.
        if (renewalInvoice?._id) {
            const deterministicDueDate = new Date('2026-01-01T00:00:00.000Z');
            await Service.updateOne(
                { _id: service._id },
                {
                    $set: {
                        status: 'ACTIVE',
                        suspendedAt: null,
                        terminatedAt: null,
                        nextDueDate: deterministicDueDate,
                    },
                }
            );
            // Ensure payment-renewal check is deterministic: clear any prior paid-ledger for this due date.
            await RenewalLedger.deleteMany({
                serviceId: service._id,
                dueDate: deterministicDueDate,
            });
            await serviceLifecycleService.applyRenewalPayment(renewalInvoice._id as any);
            const renewedService = await Service.findById(service._id).lean().exec();
            (report.checks as any).paymentRenewal = {
                invoiceId: String(renewalInvoice._id),
                beforeNextDueDate: '2026-01-01T00:00:00.000Z',
                afterNextDueDate: renewedService?.nextDueDate || null,
                status: renewedService?.status || null,
            };
        }

        // 6) Queue sanity check.
        const recentJobs = await db
            .collection('serviceactionjobs')
            .find({ serviceId: service._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray();
        (report.checks as any).recentActionJobs = recentJobs.map((j: any) => ({
            id: String(j._id),
            action: j.action,
            status: j.status,
            createdAt: j.createdAt,
        }));

        console.log(JSON.stringify(report, null, 2));
        printSummary(report as Record<string, any>);
    } finally {
        await Service.updateOne(
            { _id: service._id },
            {
                $set: {
                    status: backup.service.status,
                    suspendedAt: backup.service.suspendedAt,
                    terminatedAt: backup.service.terminatedAt,
                    nextDueDate: backup.service.nextDueDate,
                    autoRenew: backup.service.autoRenew,
                    billingCycle: backup.service.billingCycle,
                },
            }
        );
        await settingsCol.updateOne(
            { key: 'global' },
            {
                $set: {
                    renewalLeadDays: backup.settings.renewalLeadDays,
                    daysBeforeSuspend: backup.settings.daysBeforeSuspend,
                    daysBeforeTermination: backup.settings.daysBeforeTermination,
                },
            }
        );
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ error: err?.message || 'Verification failed' }, null, 2));
    process.exit(1);
});

