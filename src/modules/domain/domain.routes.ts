import { Router } from 'express';
import domainController from './domain.controller';
import { protect } from '../../middlewares/auth';
import tldRoutes from './tld/tld.routes';


const router = Router();

// Mount TLD routes
router.use('/tld', tldRoutes);

// Public routes (or maybe authenticated but for any user)
router.get('/search', domainController.searchDomain);

// Protected routes
router.use(protect);

router.post('/register', domainController.registerDomain);
router.post('/transfer', domainController.transferDomain);

// Specific domain validation could be added here
router.get('/:domain', domainController.getDomainDetails);
router.post('/:domain/renew', domainController.renewDomain);
router.put('/:domain/nameservers', domainController.updateNameservers);

export default router;
