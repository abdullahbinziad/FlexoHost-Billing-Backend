import express from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/requirePermission';
import { getClientServices, getClientServiceById, getCpanelShortcuts, getShortcutLoginUrl, getHostingUsage, refreshHostingUsage, createHostingEmailAccount } from './controllers/service-client.controller';
import { suspendService, unsuspendService, terminateService, cancelPendingService, deleteService, changePackageService, changePasswordService, retryProvisionService, revealServiceModulePassword, updateServiceAutomation, updateServiceAdminNotes, updateServiceStatus, updateServiceProfile } from './controllers/service-admin.controller';
import { systemAdminController } from './controllers/system-admin.controller';

const router = express.Router();

const authAdmin = [protect, restrictTo('admin', 'superadmin', 'staff')];
const authClient = protect;

// Client routes (authenticated user; controller checks clientId ownership or admin)
router.get('/client/:clientId', authClient, getClientServices);
router.get('/client/:clientId/:serviceId', authClient, getClientServiceById);
router.get('/client/:clientId/:serviceId/cpanel/shortcuts', authClient, getCpanelShortcuts);
router.get('/client/:clientId/:serviceId/login/shortcut/:shortcutKey', authClient, getShortcutLoginUrl);
router.post('/client/:clientId/:serviceId/email/accounts', authClient, createHostingEmailAccount);
router.get('/client/:clientId/:serviceId/usage', authClient, getHostingUsage);
router.post('/client/:clientId/:serviceId/usage/refresh', authClient, refreshHostingUsage);

// Admin routes
router.post('/admin/:serviceId/suspend', ...authAdmin, suspendService);
router.post('/admin/:serviceId/unsuspend', ...authAdmin, unsuspendService);
router.post('/admin/:serviceId/terminate', ...authAdmin, requirePermission('services:terminate'), terminateService);
router.post('/admin/:serviceId/cancel-pending', ...authAdmin, requirePermission('services:cancel_pending'), cancelPendingService);
router.delete('/admin/:serviceId', ...authAdmin, requirePermission('services:delete'), deleteService);
router.post('/admin/:serviceId/change-package', ...authAdmin, changePackageService);
router.post('/admin/:serviceId/change-password', ...authAdmin, requirePermission('services:change_password'), changePasswordService);
router.get('/admin/:serviceId/module-password', ...authAdmin, requirePermission('services:view_password'), revealServiceModulePassword);
router.post('/admin/:serviceId/retry-provision', ...authAdmin, retryProvisionService);
router.patch('/admin/:serviceId/status', ...authAdmin, requirePermission('services:status_update'), updateServiceStatus);
router.post('/admin/:serviceId/automation', ...authAdmin, updateServiceAutomation);
router.patch('/admin/:serviceId/notes', ...authAdmin, updateServiceAdminNotes);
router.patch('/admin/:serviceId/profile', ...authAdmin, requirePermission('services:profile_update'), updateServiceProfile);

// System Admin / Dashboard Overrides
router.get('/admin/jobs/provisioning', ...authAdmin, systemAdminController.getProvisioningJobs);
router.post('/admin/jobs/provisioning/:jobId/retry', ...authAdmin, systemAdminController.retryProvisioningJob);

router.get('/admin/jobs/actions', ...authAdmin, systemAdminController.getServiceActionJobs);
router.post('/admin/jobs/actions/:jobId/retry', ...authAdmin, systemAdminController.retryServiceActionJob);
router.get('/admin/jobs/domain-renewals', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.getDomainRenewalJobs);
router.post('/admin/jobs/domain-renewals/:jobId/retry', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.retryDomainRenewalJob);
router.post('/admin/jobs/domain-renewals/:jobId/mark-renewed', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.markDomainRenewalManuallyRenewed);
router.post('/admin/jobs/domain-renewals/:jobId/sync-registrar', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.syncDomainRenewalJobFromRegistrar);
router.get('/admin/automation-summary', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.getAutomationSummary);
router.get('/admin/automation-runs', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.getAutomationRuns);

// Cron Overrides
router.post('/admin/trigger/:taskKey', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerAutomationTask);
router.post('/admin/trigger/renewals', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerRenewals);
router.post('/admin/trigger/overdue-suspensions', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerOverdueSuspensions);
router.post('/admin/trigger/invoice-reminders', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerInvoiceReminders);
router.post('/admin/trigger/terminations', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerTerminations);
router.post('/admin/trigger/usage-sync', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerUsageSync);
router.post('/admin/trigger/provisioning-worker', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerProvisioningWorker);
router.post('/admin/trigger/action-worker', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerActionWorker);
router.post('/admin/trigger/domain-renewals', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerDomainRenewals);
router.post('/admin/trigger/domain-sync', ...authAdmin, requirePermission('dashboard:automation'), systemAdminController.triggerDomainSync);


export default router;
