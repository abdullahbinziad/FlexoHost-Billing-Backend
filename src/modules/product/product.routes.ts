import { Router } from 'express';
import { productController } from './product.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    createProductValidation,
    updateProductValidation,
    getProductValidation,
    deleteProductValidation,
    toggleVisibilityValidation,
    getProductsQueryValidation,
    searchProductsValidation
} from './product.validation';

const router = Router();

/**
 * Protect all routes - Admin only
 */
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

/**
 * Search products
 * Must be before /:id route to avoid conflicts
 */
router.get('/search', validate(searchProductsValidation), productController.search);

/**
 * Get products by type
 */
router.get('/type/:type', productController.getByType);

/**
 * Get products by group
 */
router.get('/group/:group', productController.getByGroup);

/**
 * Main product routes
 */
router
    .route('/')
    .get(validate(getProductsQueryValidation), productController.getAll)
    .post(validate(createProductValidation), productController.create);

/**
 * Single product routes
 */
router
    .route('/:id')
    .get(validate(getProductValidation), productController.getOne)
    .put(validate(updateProductValidation), productController.update)
    .delete(validate(deleteProductValidation), productController.delete);

/**
 * Toggle product visibility
 */
router.patch('/:id/visibility', validate(toggleVisibilityValidation), productController.toggleVisibility);

export default router;
