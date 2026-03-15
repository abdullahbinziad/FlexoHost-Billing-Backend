import { Router } from 'express';
import ticketController from './ticket.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { upload, handleMulterError } from '../../middlewares/upload';
import { virusScanUpload } from '../../middlewares/virusScanUpload';

const router = Router();

router.use(protect);

const clientAndStaffRoles = ['client', 'user', 'admin', 'staff', 'superadmin'];
const staffOnlyRoles = ['admin', 'staff', 'superadmin'];

// Clients & staff
router.post(
    '/',
    restrictTo(...clientAndStaffRoles),
    upload.array('attachments', 5),
    handleMulterError,
    virusScanUpload,
    ticketController.createTicket
);
router.get('/', restrictTo(...clientAndStaffRoles), ticketController.getTickets);
router.get('/:id', restrictTo(...clientAndStaffRoles), ticketController.getTicketById);
router.post(
    '/:id/replies',
    restrictTo(...clientAndStaffRoles),
    upload.array('attachments', 5),
    handleMulterError,
    virusScanUpload,
    ticketController.addReply
);

// Admin/staff only
router.patch('/:id/status', restrictTo(...staffOnlyRoles), ticketController.updateStatus);

// Client can mark own ticket as resolved; admin/staff can resolve any
router.patch('/:id/resolve', restrictTo(...clientAndStaffRoles), ticketController.markResolved);

export default router;

