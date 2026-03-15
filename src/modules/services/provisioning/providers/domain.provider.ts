import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { DomainOperationType, DomainTransferStatus } from '../../models/domain-details.model';
import { DOMAIN_CONFIG } from '../../../domain/domain.config';
import { domainRegistrarService } from '../../../domain/registrar/domain-registrar.service';

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
            const nameservers = Array.isArray(config.nameservers) && config.nameservers.length >= 2
                ? config.nameservers
                : ['ns1.dynadot.com', 'ns2.dynadot.com'];
            const contacts = config.contacts && typeof config.contacts === 'object' ? config.contacts : undefined;

            let remoteId: string;
            let registrarName: string;
            if (isTransfer) {
                const res = await domainRegistrarService.transferDomain({
                    domain: domainName,
                    authCode: config.eppCode || '',
                    currency: 'USD',
                }, config.registrar);
                remoteId = res.remoteId;
                registrarName = res.registrar;
            } else {
                const res = await domainRegistrarService.registerDomain({
                    domain: domainName,
                    years: config.years ?? config.period ?? 1,
                    currency: 'USD',
                }, config.registrar);
                remoteId = res.remoteId;
                registrarName = res.registrar;
                if (nameservers.length >= 2) {
                    await domainRegistrarService.saveNameservers(domainName, nameservers, registrarName);
                }
            }

            const tld = (config.tld || '.com').toString().toLowerCase().replace(/^\./, '') || 'com';
            const sld = domainName.replace(new RegExp(`\\.${tld}$`, 'i'), '') || domainName.split('.')[0] || 'unknown';

            const details: Record<string, unknown> = {
                domainName,
                sld,
                tld,
                registrar: registrarName || DOMAIN_CONFIG.defaultRegistrar,
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
                contactsSameAsRegistrant: !contacts,
                nameservers,
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
                providerName: registrarName || DOMAIN_CONFIG.defaultRegistrar,
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
