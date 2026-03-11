import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { domainRegistrarProvider } from '../../providers/stubs';
import { DomainOperationType, DomainTransferStatus } from '../../models/domain-details.model';

const STUB_CONTACT = {
    firstName: 'Stub',
    lastName: 'Stub',
    email: 'stub@example.com',
    phone: '123',
    address1: '123',
    city: 'Stub',
    state: 'ST',
    postcode: '123',
    country: 'US',
};

export class DomainProvisioningProvider implements IProvisioningProvider {
    readonly type = ServiceType.DOMAIN;

    async provision(ctx: ProvisioningContext): Promise<ProvisioningResult> {
        const { orderItem } = ctx;
        const config = orderItem?.configSnapshot || {};
        const domainName = config.domainName || 'unknown.com';
        const isTransfer = orderItem?.actionType === 'TRANSFER';

        try {
            let remoteId: string;
            if (isTransfer) {
                const res = await domainRegistrarProvider.requestTransfer({
                    domainName,
                    eppCode: config.eppCode || '',
                });
                remoteId = res.remoteId;
            } else {
                const res = await domainRegistrarProvider.registerDomain({
                    domainName,
                    periodYears: config.years ?? 1,
                    nameservers: ['ns1.stub.com', 'ns2.stub.com'],
                    contacts: {},
                });
                remoteId = res.remoteId;
            }

            const details: Record<string, unknown> = {
                domainName,
                sld: 'unknown',
                tld: (config.tld || '.com').toString().toLowerCase().replace(/^\./, '') || 'com',
                registrar: 'StubRegistrar',
                operationType: isTransfer ? DomainOperationType.TRANSFER : DomainOperationType.REGISTER,
                transferStatus: isTransfer ? DomainTransferStatus.PENDING : undefined,
                eppCodeEncrypted: isTransfer && config.eppCode
                    ? Buffer.from(config.eppCode).toString('base64')
                    : undefined,
                contacts: {
                    registrant: STUB_CONTACT,
                    admin: STUB_CONTACT,
                    tech: STUB_CONTACT,
                    billing: STUB_CONTACT,
                },
                contactsSameAsRegistrant: true,
                nameservers: ['ns1.stub.com', 'ns2.stub.com'],
                registrarLock: true,
                whoisPrivacy: false,
                dnssecEnabled: false,
                dnsManagementEnabled: false,
                emailForwardingEnabled: false,
                eppStatusCodes: [],
            };

            return {
                success: true,
                remoteId,
                providerName: 'StubRegistrar',
                details,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'Domain provisioning failed',
            };
        }
    }
}
