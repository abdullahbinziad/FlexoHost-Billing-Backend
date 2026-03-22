import { Router } from 'express';
import domainController from './domain.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    registerDomainValidation,
    registerDomainsBulkValidation,
    searchDomainsBulkValidation,
    transferDomainValidation,
} from './domain.validation';
import tldRoutes from './tld/tld.routes';


const router = Router();

// Mount TLD routes
router.use('/tld', tldRoutes);

// Public routes (or maybe authenticated but for any user)
router.get('/search', domainController.searchDomain);
router.post('/search-bulk', validate(searchDomainsBulkValidation), domainController.searchDomainsBulk);

// Protected routes
router.use(protect);

router.get('/', domainController.listMyDomains);
router.get('/admin/inventory', restrictTo('admin', 'staff', 'superadmin'), domainController.listAllDomainsAdmin);
router.get('/admin/client/:clientId', restrictTo('admin', 'staff', 'superadmin'), domainController.listDomainsByClientAdmin);
router.get('/admin/registrars', restrictTo('admin', 'staff', 'superadmin'), domainController.getRegistrarConfigs);
router.put('/admin/registrars/:registrarKey', restrictTo('admin', 'staff', 'superadmin'), domainController.updateRegistrarConfig);
router.post('/admin/sync', restrictTo('admin', 'staff', 'superadmin'), domainController.bulkSyncDomainsAdmin);
router.post('/admin/reconcile/:registrarKey', restrictTo('admin', 'staff', 'superadmin'), domainController.reconcileRegistrarDomainsAdmin);
router.post('/admin/reconcile/:registrarKey/import', restrictTo('admin', 'staff', 'superadmin'), domainController.importRegistrarDomainsAdmin);
router.post('/admin/:serviceId/sync', restrictTo('admin', 'staff', 'superadmin'), domainController.syncDomainByServiceIdAdmin);
router.post('/register', restrictTo('admin', 'staff', 'superadmin'), validate(registerDomainValidation), domainController.registerDomain);
router.post(
    '/register-bulk',
    restrictTo('admin', 'staff', 'superadmin'),
    validate(registerDomainsBulkValidation),
    domainController.registerDomainsBulk
);
router.post('/transfer', restrictTo('admin', 'staff', 'superadmin'), validate(transferDomainValidation), domainController.transferDomain);

// Specific domain (ownership checked in controller for non-admin)
router.get('/:domain/epp', domainController.getEppCode);
router.get('/:domain/lock', domainController.getRegistrarLock);
router.put('/:domain/lock', domainController.updateRegistrarLock);
router.get('/:domain/contacts', domainController.getContactDetails);
router.put('/:domain/contacts', domainController.updateContactDetails);
router.get('/:domain/dns', domainController.getDns);
router.put('/:domain/dns', domainController.updateDns);
router.get('/:domain', domainController.getDomainDetails);
router.post('/:domain/renew', domainController.renewDomain);
router.put('/:domain/nameservers', domainController.updateNameservers);

export default router;
