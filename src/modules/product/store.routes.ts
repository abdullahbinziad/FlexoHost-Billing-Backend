import { Router } from 'express';
import { productController } from './product.controller';
import { validate } from '../../middlewares/validate';
import { getProductValidation } from './product.validation';

const router = Router();

/**
 * Get single product by ID (Public)
 */
router.get('/:id', validate(getProductValidation), productController.getOne);

export default router;
