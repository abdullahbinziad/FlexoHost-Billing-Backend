import { Document, Model, Types } from 'mongoose';

// Align with WHMCS-style statuses
export type TicketStatus =
    | 'open'
    | 'answered'
    | 'customer_reply'
    | 'on_hold'
    | 'in_progress'
    | 'closed'
    | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketDepartment = 'technical' | 'billing' | 'sales' | 'support';

export interface ITicket {
    ticketNumber: string;
    clientId: Types.ObjectId;
    userId: Types.ObjectId;
    subject: string;
    department: TicketDepartment;
    priority: TicketPriority;
    status: TicketStatus;
    serviceId?: Types.ObjectId;
    invoiceId?: Types.ObjectId;
    lastRepliedAt?: Date;
    lastReplierType?: 'client' | 'staff';
}

export interface ITicketDocument extends ITicket, Document {}

export interface ITicketModel extends Model<ITicketDocument> {
    isTicketNumberTaken(ticketNumber: string): Promise<boolean>;
}

export interface ITicketMessage {
    ticketId: Types.ObjectId;
    authorType: 'client' | 'staff' | 'system';
    authorId: Types.ObjectId;
    message: string;
    messageHtml?: string;
    internal: boolean;
    attachments?: {
        url: string;
        filename: string;
        mimeType: string;
        size: number;
    }[];
}

export interface ITicketMessageDocument extends ITicketMessage, Document {}

export interface ITicketMessageModel extends Model<ITicketMessageDocument> {}

