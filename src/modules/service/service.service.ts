import Service from './service.model';
import { IService, ServiceType, ServiceStatus, IHostingDetails, IDomainDetails, IServerDetails } from './service.interface';
import { IOrderDocument, IOrderItem } from '../order/order.interface';
import mongoose from 'mongoose';

export class ServiceService {
    /**
     * Create a service from an order item
     * This is typically called after payment confirmation
     */
    async createServiceFromOrder(order: IOrderDocument, item: IOrderItem, session?: mongoose.ClientSession): Promise<IService> {
        // Calculate dates
        const startDate = new Date();
        const nextDueDate = new Date();

        if (item.billingCycle === 'monthly') {
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        } else if (item.billingCycle === 'annually') {
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        } else if (item.billingCycle === 'triennially') {
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 3);
        } else {
            // Default 1 month if not specified
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        }

        // Prepare details based on type
        // In a real app, this would involve calling external APIs (cPanel, Domain Registrar, etc.)
        // For now, we stub these details

        let hostingDetails: IHostingDetails | undefined;
        let domainDetails: IDomainDetails | undefined;
        let serverDetails: IServerDetails | undefined;

        if (item.type === 'HOSTING') {
            hostingDetails = {
                username: `user_${order.userId.toString().substring(0, 6)}`,
                password: 'generated_password_123', // Should be generated and encrypted
                serverIp: '192.168.1.100', // Mock IP
                nameservers: ['ns1.hosting.com', 'ns2.hosting.com'],
                package: item.productId
            };
            // Also need domain details if bundled? Or just track primary domain in main details
        } else if (item.type === 'DOMAIN') {
            domainDetails = {
                domainName: item.domainDetails?.domainName || 'unknown.com',
                registrar: 'GoDaddy', // Mock
                registrationDate: startDate,
                expiryDate: nextDueDate,
                nameservers: ['ns1.hosting.com', 'ns2.hosting.com'],
                autoRenew: true
            };
        } else if (item.type === 'SERVER') {
            serverDetails = {
                ipAddress: '10.0.0.5',
                rootPassword: 'root_password_123',
                os: 'Ubuntu 22.04',
                cpu: '4 vCPU',
                ram: '8GB',
                storage: '160GB NVMe'
            };
        }

        const serviceData: Partial<IService> = {
            userId: order.userId,
            orderId: (order as any)._id, // Type assertion if needed
            type: item.type as unknown as ServiceType, // Map OrderItemType to ServiceType (enum names match)
            productId: item.productId,
            productName: item.description, // Use description or fetch name

            status: ServiceStatus.ACTIVE, // Auto-activate for now
            billingCycle: item.billingCycle,
            recurringAmount: item.price,
            currency: order.currency,

            startDate,
            nextDueDate,
            lastPaymentDate: startDate,

            serverLocation: item.serverLocation,

            hostingDetails,
            domainDetails,
            serverDetails,
        };

        const service = new Service(serviceData);
        await service.save({ session });

        return service;
    }

    async getServices(userId: string): Promise<IService[]> {
        return Service.find({ userId }).sort({ createdAt: -1 });
    }

    async getService(serviceId: string): Promise<IService | null> {
        return Service.findById(serviceId);
    }
}

export const serviceService = new ServiceService();
