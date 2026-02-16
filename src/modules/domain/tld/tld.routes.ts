import express from 'express';
import tldController from './tld.controller';
// import { protect, authorize } from '../../auth/auth.middleware'; // Assuming auth middleware exists

const router = express.Router();

// Routes for TLD management
// These should likely be protected for admin use only
// router.use(protect); 
// router.use(authorize('admin'));

router.route('/')
    .post(tldController.createTLD)
    .get(tldController.getAllTLDs);

router.route('/:id')
    .patch(tldController.updateTLD)
    .delete(tldController.deleteTLD);

router.route('/extension/:extension')
    .get(tldController.getTLD);

export default router;
