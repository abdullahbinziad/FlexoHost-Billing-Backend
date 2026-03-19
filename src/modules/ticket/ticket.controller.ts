import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';
import { Ticket, TicketMessage } from './ticket.model';
import { getPagination, buildSort } from '../../utils/pagination';
import Client from '../client/client.model';
import { TicketStatus } from './ticket.interface';
import notificationService from '../notification/notification.service';
import { notificationProvider } from '../services/providers/notification.provider';
import { auditLogSafe } from '../activity-log/activity-log.service';
import { getEffectiveClientId } from '../client-access-grant/effective-client';

class TicketController {
    createTicket = catchAsync(async (req: AuthRequest, res: Response) => {
        const user = req.user;
        if (!user) {
            return ApiResponse.unauthorized(res);
        }

        const { subject, department, priority, message, messageHtml, serviceId, invoiceId } = req.body as {
            subject: string;
            department?: string;
            priority?: string;
            message: string;
            messageHtml?: string;
            serviceId?: string;
            invoiceId?: string;
        };

        if (!subject || !message) {
            return ApiResponse.badRequest(res, 'Subject and message are required');
        }

        const effectiveClientId = await getEffectiveClientId(req, res, 'tickets');
        if (effectiveClientId === null) return;
        const client = await Client.findById(effectiveClientId).select('_id firstName lastName contactEmail').lean();
        if (!client) {
            return ApiResponse.notFound(res, 'Client not found');
        }

        // Generate simple ticket number TKT-000001 style
        const count = await Ticket.countDocuments();
        const ticketNumber = `TKT-${(count + 1).toString().padStart(6, '0')}`;

        const ticket = await Ticket.create({
            ticketNumber,
            clientId: client._id as any,
            userId: user._id,
            subject,
            department: department || 'support',
            priority: priority || 'normal',
            status: 'open',
            serviceId,
            invoiceId,
            lastRepliedAt: new Date(),
            lastReplierType: 'client',
        });

        const attachments =
            (req.files as Express.Multer.File[] | undefined)?.map((file) => ({
                url: `/${config.upload.uploadPath}/${file.filename}`,
                filename: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
            })) || [];

        await TicketMessage.create({
            ticketId: ticket._id,
            authorType: 'client',
            authorId: user._id,
            message,
            messageHtml,
            attachments,
            internal: false,
        });

        // Notification (in-app) – client who created
        await notificationService.create({
            userId: user._id,
            clientId: client._id,
            category: 'support',
            title: `Support ticket ${ticket.ticketNumber} created`,
            message: subject,
            linkPath: `/tickets/${ticket._id.toString()}`,
            linkLabel: 'View ticket',
            meta: { ticketId: ticket._id.toString(), ticketNumber },
        });

        // Notify all admin/staff – reusable helper
        await notificationService.createForAdminStaff({
            category: 'support',
            title: `New ticket: ${ticket.ticketNumber}`,
            message: `${client.firstName} ${client.lastName}: ${subject}`,
            linkPath: `/admin/tickets/${ticket._id.toString()}`,
            linkLabel: 'View ticket',
            clientId: client._id as any,
            meta: { ticketId: ticket._id.toString(), ticketNumber, event: 'ticket_opened' },
        });

        auditLogSafe({
            message: `Ticket ${ticket.ticketNumber} opened: ${subject}`,
            type: 'ticket_opened',
            category: 'ticket',
            actorType: 'user',
            actorId: user._id.toString(),
            targetType: 'ticket',
            targetId: ticket._id.toString(),
            source: 'manual',
            clientId: client._id.toString(),
            ticketId: ticket._id.toString(),
        });

        // Email acknowledgement (if configured)
        if (client.contactEmail) {
            const frontendUrl = config.frontendUrl;
            await notificationProvider.sendEmail(
                client.contactEmail,
                `Support Ticket #${ticketNumber} - ${subject}`,
                'support.ticket_opened',
                {
                    customerName: `${client.firstName} ${client.lastName}`,
                    ticketId: ticketNumber,
                    ticketSubject: subject,
                    priority: (priority || 'normal').toUpperCase(),
                    department: department || 'Support',
                    createdAt: new Date().toISOString(),
                    summaryMessage: message.substring(0, 200),
                    ticketUrl: `${frontendUrl}/tickets/${ticket._id.toString()}`,
                    attachments,
                }
            );
        }

        return ApiResponse.created(res, 'Ticket created successfully', ticket);
    });

    getTickets = catchAsync(async (req: AuthRequest, res: Response) => {
        const { page, limit, status, priority, department, clientId } = req.query as {
            page?: string;
            limit?: string;
            status?: string;
            priority?: string;
            department?: string;
            clientId?: string;
        };

        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });
        const sort = buildSort('updatedAt', 'desc');

        const filters: any = {};

        const isStaff = ['admin', 'staff', 'superadmin'].includes(req.user.role);
        if (isStaff) {
            if (clientId) filters.clientId = clientId;
        } else {
            const effectiveClientId = await getEffectiveClientId(req, res, 'tickets');
            if (effectiveClientId === null) return;
            filters.clientId = effectiveClientId;
        }

        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (department) filters.department = department;

        const [results, totalResults] = await Promise.all([
            Ticket.find(filters)
                .sort(sort)
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            Ticket.countDocuments(filters),
        ]);

        const totalPages = Math.ceil(totalResults / safeLimit || 1);

        return ApiResponse.ok(res, 'Tickets retrieved', {
            results,
            page: safePage,
            limit: safeLimit,
            totalPages,
            totalResults,
        });
    });

    getTicketById = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const ticket = await Ticket.findById(id).lean();
        if (!ticket) {
            return ApiResponse.notFound(res, 'Ticket not found');
        }

        if (req.user.role === 'client' || req.user.role === 'user') {
            const effectiveClientId = await getEffectiveClientId(req, res, 'tickets');
            if (effectiveClientId === null) return;
            if (ticket.clientId.toString() !== effectiveClientId) {
                return ApiResponse.forbidden(res);
            }
        }

        const messages = await TicketMessage.find({ ticketId: ticket._id })
            .sort({ createdAt: 1 })
            .lean();

        // For admin/staff: include client details (name, email, phone, address)
        let clientInfo: { firstName: string; lastName: string; contactEmail?: string; phoneNumber?: string; address?: string } | null = null;
        if (['admin', 'staff', 'superadmin'].includes(req.user.role)) {
            const client = await Client.findById(ticket.clientId)
                .select('firstName lastName contactEmail phoneNumber address')
                .lean();
            if (client) {
                const addr = (client as any).address;
                const addressParts = addr
                    ? [addr.street, addr.city, addr.state, addr.postCode, addr.country].filter(Boolean)
                    : [];
                clientInfo = {
                    firstName: (client as any).firstName,
                    lastName: (client as any).lastName,
                    contactEmail: (client as any).contactEmail,
                    phoneNumber: (client as any).phoneNumber,
                    address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
                };
            }
        }

        return ApiResponse.ok(res, 'Ticket retrieved', { ticket, messages, client: clientInfo });
    });

    addReply = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { message, messageHtml, internal } = req.body as { message: string; messageHtml?: string; internal?: boolean };

        if (!message) {
            return ApiResponse.badRequest(res, 'Message is required');
        }

        const ticket = await Ticket.findById(id);
        if (!ticket) {
            return ApiResponse.notFound(res, 'Ticket not found');
        }

        const isStaff = ['admin', 'staff', 'superadmin'].includes(req.user.role);

        if (!isStaff) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'tickets');
            if (effectiveClientId === null) return;
            if (ticket.clientId.toString() !== effectiveClientId) {
                return ApiResponse.forbidden(res);
            }
        }

        const authorType = isStaff ? 'staff' : 'client';

        const attachments =
            (req.files as Express.Multer.File[] | undefined)?.map((file) => ({
                url: `/${config.upload.uploadPath}/${file.filename}`,
                filename: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
            })) || [];

        await TicketMessage.create({
            ticketId: ticket._id,
            authorType,
            authorId: req.user._id,
            message,
            messageHtml,
            attachments,
            internal: !!(isStaff && internal),
        });

        // Update ticket status and last replied
        ticket.lastRepliedAt = new Date();
        ticket.lastReplierType = authorType;
        if (authorType === 'client') {
            // Client replied after staff -> waiting on staff
            ticket.status = 'customer_reply';
        } else if (authorType === 'staff') {
            // Staff replied -> waiting on client
            ticket.status = 'answered';
        }
        await ticket.save();

        auditLogSafe({
            message: `Reply added to ticket ${ticket.ticketNumber}`,
            type: 'ticket_replied',
            category: 'ticket',
            actorType: 'user',
            actorId: req.user._id.toString(),
            targetType: 'ticket',
            targetId: ticket._id.toString(),
            source: 'manual',
            clientId: ticket.clientId.toString(),
            ticketId: ticket._id.toString(),
        });

        // Notify admin/staff when client replies
        if (authorType === 'client') {
            const client = await Client.findById(ticket.clientId).select('firstName lastName').lean();
            const clientName = client ? `${client.firstName} ${client.lastName}` : 'Client';
            await notificationService.createForAdminStaff({
                category: 'support',
                title: `Client replied: ${ticket.ticketNumber}`,
                message: `${clientName}: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`,
                linkPath: `/admin/tickets/${ticket._id.toString()}`,
                linkLabel: 'View ticket',
                clientId: ticket.clientId as any,
                meta: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber, event: 'customer_reply' },
            });
        }

        // Notify client on staff reply
        if (authorType === 'staff') {
            const client = await Client.findById(ticket.clientId).populate('user', 'email').lean();
            const frontendUrl = config.frontendUrl;

            if (client) {
                await notificationService.create({
                    userId: (client as any).user._id,
                    clientId: client._id as any,
                    category: 'support',
                    title: `Support replied to ticket ${ticket.ticketNumber}`,
                    message: message.substring(0, 200),
                    linkPath: `/tickets/${ticket._id.toString()}`,
                    linkLabel: 'View ticket',
                    meta: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber },
                });

                if (client.contactEmail) {
                    await notificationProvider.sendEmail(
                        client.contactEmail,
                        `New reply on Ticket #${ticket.ticketNumber}`,
                        'support.ticket_reply',
                        {
                            customerName: `${client.firstName} ${client.lastName}`,
                            ticketId: ticket.ticketNumber,
                            ticketSubject: ticket.subject,
                            priority: ticket.priority.toUpperCase(),
                            department: ticket.department,
                            createdAt: new Date().toISOString(),
                            summaryMessage: message.substring(0, 200),
                            ticketUrl: `${frontendUrl}/tickets/${ticket._id.toString()}`,
                            replyType: 'staff_reply',
                        }
                    );
                }
            }
        }

        return ApiResponse.ok(res, 'Reply added successfully');
    });

    updateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { status } = req.body as { status: TicketStatus };

        if (!status) {
            return ApiResponse.badRequest(res, 'Status is required');
        }

        const ticket = await Ticket.findById(id);
        if (!ticket) {
            return ApiResponse.notFound(res, 'Ticket not found');
        }

        ticket.status = status;
        await ticket.save();

        auditLogSafe({
            message: `Ticket ${ticket.ticketNumber} status changed to ${status}`,
            type: 'ticket_status_changed',
            category: 'ticket',
            actorType: 'user',
            actorId: req.user._id.toString(),
            targetType: 'ticket',
            targetId: ticket._id.toString(),
            source: 'manual',
            clientId: ticket.clientId.toString(),
            ticketId: ticket._id.toString(),
        });

        return ApiResponse.ok(res, `Ticket marked as ${status}`, ticket);
    });

    markResolved = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const ticket = await Ticket.findById(id);
        if (!ticket) {
            return ApiResponse.notFound(res, 'Ticket not found');
        }

        const isStaff = ['admin', 'staff', 'superadmin'].includes(req.user.role);

        if (!isStaff) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'tickets');
            if (effectiveClientId === null) return;
            if (ticket.clientId.toString() !== effectiveClientId) {
                return ApiResponse.forbidden(res);
            }
        }

        ticket.status = 'resolved';
        await ticket.save();

        auditLogSafe({
            message: `Ticket ${ticket.ticketNumber} closed (resolved)`,
            type: 'ticket_closed',
            category: 'ticket',
            actorType: 'user',
            actorId: req.user._id.toString(),
            targetType: 'ticket',
            targetId: ticket._id.toString(),
            source: 'manual',
            clientId: ticket.clientId.toString(),
            ticketId: ticket._id.toString(),
        });

        return ApiResponse.ok(res, 'Ticket marked as resolved', ticket);
    });
}

export default new TicketController();

