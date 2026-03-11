import express from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { getClientServices, getClientServiceById, getCpanelLoginUrl, getWebmailLoginUrl } from './controllers/service-client.controller';
import { suspendService, unsuspendService, terminateService, changePackageService, retryProvisionService } from './controllers/service-admin.controller';
import { systemAdminController } from './controllers/system-admin.controller';

const router = express.Router();

const authAdmin = [protect, restrictTo('admin', 'superadmin', 'staff')];
const authClient = protect;

// Client routes (authenticated user; controller checks clientId ownership or admin)
router.get('/client/:clientId', authClient, getClientServices);
router.get('/client/:clientId/:serviceId', authClient, getClientServiceById);
router.get('/client/:clientId/:serviceId/login/cpanel', authClient, getCpanelLoginUrl);
router.get('/client/:clientId/:serviceId/login/webmail', authClient, getWebmailLoginUrl);

// Admin routes
router.post('/admin/:serviceId/suspend', ...authAdmin, suspendService);
router.post('/admin/:serviceId/unsuspend', ...authAdmin, unsuspendService);
router.post('/admin/:serviceId/terminate', ...authAdmin, terminateService);
router.post('/admin/:serviceId/change-package', ...authAdmin, changePackageService);
router.post('/admin/:serviceId/retry-provision', ...authAdmin, retryProvisionService);

// System Admin / Dashboard Overrides
router.get('/admin/jobs/provisioning', ...authAdmin, systemAdminController.getProvisioningJobs);
router.post('/admin/jobs/provisioning/:jobId/retry', ...authAdmin, systemAdminController.retryProvisioningJob);

router.get('/admin/jobs/actions', ...authAdmin, systemAdminController.getServiceActionJobs);
router.post('/admin/jobs/actions/:jobId/retry', ...authAdmin, systemAdminController.retryServiceActionJob);

// Cron Overrides
router.post('/admin/trigger/renewals', ...authAdmin, systemAdminController.triggerRenewals);
router.post('/admin/trigger/overdue-suspensions', ...authAdmin, systemAdminController.triggerOverdueSuspensions);
router.post('/admin/trigger/invoice-reminders', ...authAdmin, systemAdminController.triggerInvoiceReminders);
router.post('/admin/trigger/terminations', ...authAdmin, systemAdminController.triggerTerminations);
router.post('/admin/trigger/provisioning-worker', ...authAdmin, systemAdminController.triggerProvisioningWorker);
router.post('/admin/trigger/action-worker', ...authAdmin, systemAdminController.triggerActionWorker);


export default router;
