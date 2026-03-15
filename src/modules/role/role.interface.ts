import { Document, Types } from 'mongoose';

export interface IRole {
    name: string;
    slug: string;
    permissions: string[];
    description?: string;
    isSystem: boolean;
    hasFullAccess: boolean;
    archived: boolean;
    archivedAt?: Date;
    archivedBy?: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IRoleDocument extends IRole, Document {
    createdAt: Date;
    updatedAt: Date;
}

export interface IRoleCreate {
    name: string;
    slug?: string;
    permissions: string[];
    description?: string;
    isSystem?: boolean;
    hasFullAccess?: boolean;
}

export interface IRoleUpdate {
    name?: string;
    permissions?: string[];
    description?: string;
}
