import { Router } from 'express';
import ticketController from './ticket.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { upload, handleMulterError } from '../../middlewares/upload';

const router = Router();

router.use(protect);

// Clients & staff
router.post(
    '/',
    restrictTo('client', 'user', 'admin', 'staff'),
    upload.array('attachments', 5),
    handleMulterError,
    ticketController.createTicket
);
router.get('/', restrictTo('client', 'user', 'admin', 'staff'), ticketController.getTickets);
router.get('/:id', restrictTo('client', 'user', 'admin', 'staff'), ticketController.getTicketById);
router.post(
    '/:id/replies',
    restrictTo('client', 'user', 'admin', 'staff'),
    upload.array('attachments', 5),
    handleMulterError,
    ticketController.addReply
);

// Admin/staff only
router.patch('/:id/status', restrictTo('admin', 'staff'), ticketController.updateStatus);

// Client can mark own ticket as resolved; admin/staff can resolve any
router.patch('/:id/resolve', restrictTo('client', 'user', 'admin', 'staff'), ticketController.markResolved);

export default router;

