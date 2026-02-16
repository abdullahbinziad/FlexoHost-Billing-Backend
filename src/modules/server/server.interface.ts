import { Document, Model } from 'mongoose';

export type ServerLocation = 'USA' | 'Malaysia' | 'Singapore' | 'Bangladesh' | 'Germany' | 'Finland';
export type ServerGroup = 'Web Hosting' | 'BDIX Hosting' | 'Turbo Hosting' | 'Ecommerce Hosting' | 'VPS' | 'BDIX Vps';

export interface INameServer {
    ns1: string;
    ns1Ip?: string;
    ns2: string;
    ns2Ip?: string;
    ns3?: string;
    ns3Ip?: string;
    ns4?: string;
    ns4Ip?: string;
    ns5?: string;
    ns5Ip?: string;
}

export interface IServerModule {
    type: string; // e.g., 'cpanel'
    username: string;
    password?: string;
    apiToken?: string;
    isSecure: boolean;
    port: number;
    isPortOverride?: boolean;
}

export interface IServer {
    name: string;
    hostname: string;
    ipAddress?: string;
    assignedIpAddresses?: string; // Stored as newline separated string based on payload
    monthlyCost: number;
    datacenter?: string;
    maxAccounts: number;
    statusAddress?: string;
    isEnabled: boolean;

    location: ServerLocation;
    group: ServerGroup;

    nameservers: INameServer;
    module: IServerModule;
    accessControl: 'unrestricted' | 'restricted';

    createdAt?: Date;
    updatedAt?: Date;
}

export interface IServerDocument extends IServer, Document {
    createdAt: Date;
    updatedAt: Date;
}

export interface IServerModel extends Model<IServerDocument> { }
