/**
 * Record domain eictbd.com for client abdullahbinziad@gmail.com, then test
 * EPP (from registrar) and nameserver updates via Dynadot API (using .env keys).
 *
 * Run from backend root: npx ts-node src/scripts/record-domain-and-test-dynadot.ts
 * Or: npm run script:record-domain
 *
 * Requires: MONGODB_URI and DYNADOT_API_KEY in .env
 */

import mongoose from 'mongoose';
import config from '../config';
import User from '../modules/user/user.model';
import Client from '../modules/client/client.model';
import Order from '../modules/order/order.model';
import OrderItem from '../modules/order/order-item.model';
import { OrderStatus } from '../modules/order/order.interface';
import { DomainActionType } from '../modules/order/order-item.interface';
import { ServiceType, BillingCycle, ServiceStatus } from '../modules/services/types/enums';
import { getNextSequence, formatSequenceId } from '../models/counter.model';
import { serviceRepository } from '../modules/services/repositories';
import DomainServiceDetails, { DomainOperationType } from '../modules/services/models/domain-details.model';
import domainService from '../modules/domain/domain.service';
import { domainRegistrarService } from '../modules/domain/registrar/domain-registrar.service';
import { DEFAULT_CURRENCY } from '../config/currency.config';

const CLIENT_EMAIL = 'abdullahbinziad@gmail.com';
const DOMAIN_NAME = 'eictbd.com';

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

async function connectDB(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    console.log('MongoDB connected');
}

async function main(): Promise<void> {
    await connectDB();

    // --- 1) Find client by email ---
    const user = await User.findOne({ email: CLIENT_EMAIL }).exec();
    if (!user) {
        throw new Error(`User not found for email: ${CLIENT_EMAIL}`);
    }
    const client = await Client.findOne({ user: user._id }).exec();
    if (!client) {
        throw new Error(`Client not found for user ${user._id}`);
    }
    const clientId = client._id;
    console.log(`Found client: ${clientId} (${CLIENT_EMAIL})`);

    // --- 2) Create Order + OrderItem for domain eictbd.com ---
    const orderSeq = await getNextSequence('order');
    const orderId = formatSequenceId('ORD', orderSeq);
    const orderNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const domainPrice = 0;

    const [order] = await Order.create([
        {
            orderId,
            orderNumber,
            clientId,
            userId: user._id,
            status: OrderStatus.PENDING_PAYMENT,
            currency: DEFAULT_CURRENCY,
            subtotal: domainPrice,
            discountTotal: 0,
            taxTotal: 0,
            total: domainPrice,
            meta: { script: 'record-domain-and-test-dynadot', domainName: DOMAIN_NAME },
        },
    ]);

    const [orderItem] = await OrderItem.create([
        {
            orderId: order._id,
            clientId,
            type: ServiceType.DOMAIN,
            actionType: DomainActionType.REGISTER,
            nameSnapshot: DOMAIN_NAME,
            billingCycle: BillingCycle.ANNUALLY,
            qty: 1,
            pricingSnapshot: {
                setup: 0,
                recurring: domainPrice,
                discount: 0,
                tax: 0,
                total: domainPrice,
                currency: DEFAULT_CURRENCY,
            },
            configSnapshot: {
                domainName: DOMAIN_NAME,
                tld: '.com',
                period: 1,
                years: 1,
            },
        },
    ]);

    console.log(`Created Order ${order.orderId} and OrderItem for domain ${DOMAIN_NAME}`);

    // --- 3) Create Service + DomainServiceDetails (record domain in our system) ---
    const svcSeq = await getNextSequence('service');
    const service = await serviceRepository.create({
        serviceNumber: formatSequenceId('SVC', svcSeq),
        clientId,
        userId: user._id,
        orderId: order._id,
        orderItemId: orderItem._id,
        type: ServiceType.DOMAIN,
        status: ServiceStatus.ACTIVE,
        billingCycle: BillingCycle.ANNUALLY,
        currency: DEFAULT_CURRENCY,
        priceSnapshot: {
            setup: 0,
            recurring: domainPrice,
            discount: 0,
            tax: 0,
            total: domainPrice,
            currency: DEFAULT_CURRENCY,
        },
        autoRenew: true,
        nextDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    const tld = 'com';
    const sld = DOMAIN_NAME.replace(/\.com$/i, '') || DOMAIN_NAME.split('.')[0];
    const defaultNameservers = ['ns1.dynadot.com', 'ns2.dynadot.com'];

    await DomainServiceDetails.create({
        serviceId: service._id,
        domainName: DOMAIN_NAME,
        sld,
        tld,
        registrar: 'Dynadot',
        operationType: DomainOperationType.REGISTER,
        contacts: {
            registrant: STUB_CONTACT,
            admin: STUB_CONTACT,
            tech: STUB_CONTACT,
            billing: STUB_CONTACT,
        },
        contactsSameAsRegistrant: true,
        nameservers: defaultNameservers,
        registrarLock: true,
        whoisPrivacy: false,
        dnssecEnabled: false,
        dnsManagementEnabled: false,
        emailForwardingEnabled: false,
        eppStatusCodes: [],
    });

    console.log(`Created Service ${(service as any).serviceNumber} and DomainServiceDetails for ${DOMAIN_NAME}`);

    // --- 4) Test: get domain details from registrar (Dynadot API) ---
    console.log('\n--- Testing Dynadot API (using .env DYNADOT_API_KEY) ---');
    if (!config.dynadot?.apiKey) {
        console.warn('DYNADOT_API_KEY missing in .env; skipping Dynadot tests.');
    } else {
        try {
            const details = await domainService.getDomainDetails(DOMAIN_NAME);
            console.log('getDomainDetails (from Dynadot):', JSON.stringify(details, null, 2));
        } catch (e: any) {
            console.error('getDomainDetails failed:', e?.message || e);
        }

        // Try live EPP/auth code fetch from Dynadot.
        try {
            const liveEpp = await domainRegistrarService.getEppCode(DOMAIN_NAME);
            console.log('Live EPP/Auth code from Dynadot:', liveEpp.eppCode || '(empty)');
        } catch (e: any) {
            console.error('Live EPP fetch failed:', e?.message || e);
        }

        const eppFromOurSystem = await domainService.getEppCodeForClient(clientId.toString(), DOMAIN_NAME);
        console.log('EPP via domain service:', eppFromOurSystem ?? '(not available)');

        // --- 5) Test: change nameservers at registrar (Dynadot API) ---
        const testNameservers = ['ns1.dynadot.com', 'ns2.dynadot.com'];
        try {
            await domainService.updateNameservers(DOMAIN_NAME, testNameservers);
            console.log('updateNameservers succeeded:', testNameservers);
            const after = await domainService.getDomainDetails(DOMAIN_NAME);
            console.log('Nameservers after update:', after.nameservers);
        } catch (e: any) {
            console.error('updateNameservers failed:', e?.message || e);
        }
    }

    console.log('\nDone. Domain', DOMAIN_NAME, 'is recorded for client', CLIENT_EMAIL);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => mongoose.disconnect());
