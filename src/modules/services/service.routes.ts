import express from 'express';
import { getClientServices, getClientServiceById } from './controllers/service-client.controller';
import { suspendService, unsuspendService, terminateService, retryProvisionService } from './controllers/service-admin.controller';
// import { auth } from '../../middlewares/auth'; // Adjust based on the app's standard auth middleware
import { systemAdminController } from './controllers/system-admin.controller';

const router = express.Router();

// Mocking simple auth middleware structure placeholders
const authClient = (_req: any, _res: any, next: any) => next();
const authAdmin = (_req: any, _res: any, next: any) => next();

// Client routes
router.get('/client/:clientId', authClient, getClientServices);
router.get('/client/:clientId/:serviceId', authClient, getClientServiceById);

// Admin routes
router.post('/admin/:serviceId/suspend', authAdmin, suspendService);
router.post('/admin/:serviceId/unsuspend', authAdmin, unsuspendService);
router.post('/admin/:serviceId/terminate', authAdmin, terminateService);
router.post('/admin/:serviceId/retry-provision', authAdmin, retryProvisionService);

// System Admin / Dashboard Overrides
router.get('/admin/jobs/provisioning', authAdmin, systemAdminController.getProvisioningJobs);
router.post('/admin/jobs/provisioning/:jobId/retry', authAdmin, systemAdminController.retryProvisioningJob);

router.get('/admin/jobs/actions', authAdmin, systemAdminController.getServiceActionJobs);
router.post('/admin/jobs/actions/:jobId/retry', authAdmin, systemAdminController.retryServiceActionJob);

// Cron Overrides
router.post('/admin/trigger/renewals', authAdmin, systemAdminController.triggerRenewals);
router.post('/admin/trigger/overdue-suspensions', authAdmin, systemAdminController.triggerOverdueSuspensions);
router.post('/admin/trigger/invoice-reminders', authAdmin, systemAdminController.triggerInvoiceReminders);
router.post('/admin/trigger/terminations', authAdmin, systemAdminController.triggerTerminations);
router.post('/admin/trigger/provisioning-worker', authAdmin, systemAdminController.triggerProvisioningWorker);
router.post('/admin/trigger/action-worker', authAdmin, systemAdminController.triggerActionWorker);


export default router;
