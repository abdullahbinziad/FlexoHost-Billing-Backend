import mongoose, { Schema } from 'mongoose';
import {
    ITicketDocument,
    ITicketModel,
    ITicketMessageDocument,
    ITicketMessageModel,
    TicketPriority,
    TicketStatus,
    TicketDepartment,
} from './ticket.interface';

const ticketSchema = new Schema<ITicketDocument, ITicketModel>(
    {
        ticketNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        department: {
            type: String,
            enum: ['technical', 'billing', 'sales', 'support'] satisfies TicketDepartment[],
            required: true,
            default: 'support',
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'] satisfies TicketPriority[],
            required: true,
            default: 'normal',
        },
        status: {
            type: String,
            enum: ['open', 'answered', 'customer_reply', 'on_hold', 'in_progress', 'closed', 'resolved'] satisfies TicketStatus[],
            required: true,
            default: 'open',
            index: true,
        },
        serviceId: {
            type: Schema.Types.ObjectId,
            ref: 'Service',
        },
        invoiceId: {
            type: Schema.Types.ObjectId,
            ref: 'Invoice',
        },
        lastRepliedAt: {
            type: Date,
        },
        lastReplierType: {
            type: String,
            enum: ['client', 'staff'],
        },
    },
    {
        timestamps: true,
    }
);

ticketSchema.statics.isTicketNumberTaken = async function (ticketNumber: string): Promise<boolean> {
    const ticket = await this.findOne({ ticketNumber });
    return !!ticket;
};

const Ticket = mongoose.model<ITicketDocument, ITicketModel>('Ticket', ticketSchema);

const ticketMessageSchema = new Schema<ITicketMessageDocument, ITicketMessageModel>(
    {
        ticketId: {
            type: Schema.Types.ObjectId,
            ref: 'Ticket',
            required: true,
            index: true,
        },
        authorType: {
            type: String,
            enum: ['client', 'staff', 'system'],
            required: true,
        },
        authorId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        messageHtml: {
            type: String,
        },
        internal: {
            type: Boolean,
            default: false,
        },
        attachments: [
            {
                url: { type: String, required: true },
                filename: { type: String, required: true },
                mimeType: { type: String, required: true },
                size: { type: Number, required: true },
            },
        ],
    },
    {
        timestamps: true,
    }
);

const TicketMessage = mongoose.model<ITicketMessageDocument, ITicketMessageModel>('TicketMessage', ticketMessageSchema);

export { Ticket, TicketMessage };

