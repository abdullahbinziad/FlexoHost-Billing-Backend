import { Document, Types } from 'mongoose';

export interface IAddress {
    street?: string;
    city?: string;
    state?: string;
    postCode?: string;
    country?: string;
}

export interface IClient extends Document {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    clientId: number;
    firstName: string;
    lastName: string;
    companyName?: string;
    contactEmail?: string;
    phoneNumber?: string;
    avatar?: string;
    address?: IAddress;
    // 5-digit numeric support PIN for phone / external support verification
    supportPin?: string;
    supportPinLastGeneratedAt?: Date;
    supportPinLastVerifiedAt?: Date;
    /** Set when user completes the post-signup profile form (e.g. company, phone, address). */
    profileCompletedAt?: Date;
    accountCreditBalance?: number;
    accountCreditCurrency?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IClientCreate {
    firstName: string;
    lastName: string;
    companyName?: string;
    contactEmail?: string;
    phoneNumber?: string;
    avatar?: string;
    address?: IAddress;
}

export interface IClientUpdate {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    contactEmail?: string;
    phoneNumber?: string;
    avatar?: string;
    address?: IAddress;
}

export interface IRegisterClientData {
    userData: {
        email: string;
        password: string;
        username?: string;
    };
    clientData: IClientCreate;
}
