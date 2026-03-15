import { Request, Response } from 'express';
import { productService } from './product.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';

/**
 * Product Controller Class
 * Handles HTTP requests for product operations
 */
class ProductController {
    /**
     * @desc    Get visible store products
     * @route   GET /api/v1/store/products
     * @access  Public
     */
    getPublicList = catchAsync(async (req: Request, res: Response) => {
        const result = await productService.getPublicProducts(req.query);
        return ApiResponse.success(res, 200, 'Store products retrieved successfully', result);
    });

    /**
     * @desc    Get visible store product by ID
     * @route   GET /api/v1/store/products/:id
     * @access  Public
     */
    getPublicOne = catchAsync(async (req: Request, res: Response) => {
        const product = await productService.getPublicProductById(req.params.id);
        return ApiResponse.success(res, 200, 'Store product retrieved successfully', product);
    });

    /**
     * @desc    Create new product
     * @route   POST /api/v1/admin/products
     * @access  Private/Admin
     */
    create = catchAsync(async (req: Request, res: Response) => {
        const product = await productService.createProduct(req.body);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Product created: ${(product as any).name ?? (product as any)._id}`,
            type: 'product_created',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'product',
            targetId: String((product as any)._id ?? ''),
        });
        return ApiResponse.created(res, 'Product created successfully', product);
    });

    /**
     * @desc    Get all products with filtering and pagination
     * @route   GET /api/v1/admin/products
     * @access  Private/Admin
     */
    getAll = catchAsync(async (req: Request, res: Response) => {
        const result = await productService.getProducts(req.query);
        return ApiResponse.success(res, 200, 'Products retrieved successfully', result);
    });

    /**
     * @desc    Get single product by ID
     * @route   GET /api/v1/admin/products/:id
     * @access  Private/Admin
     */
    getOne = catchAsync(async (req: Request, res: Response) => {
        const product = await productService.getProductById(req.params.id);
        return ApiResponse.success(res, 200, 'Product details retrieved', product);
    });

    /**
     * @desc    Update product
     * @route   PUT /api/v1/admin/products/:id
     * @access  Private/Admin
     */
    update = catchAsync(async (req: Request, res: Response) => {
        const product = await productService.updateProduct(req.params.id, req.body);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Product updated: ${(product as any).name ?? req.params.id}`,
            type: 'product_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'product',
            targetId: req.params.id,
        });
        return ApiResponse.success(res, 200, 'Product updated successfully', product);
    });

    /**
     * @desc    Delete product
     * @route   DELETE /api/v1/admin/products/:id
     * @access  Private/Admin
     */
    delete = catchAsync(async (req: Request, res: Response) => {
        await productService.deleteProduct(req.params.id);
        return ApiResponse.success(res, 200, 'Product deleted successfully', null);
    });

    /**
     * @desc    Toggle product visibility
     * @route   PATCH /api/v1/admin/products/:id/visibility
     * @access  Private/Admin
     */
    toggleVisibility = catchAsync(async (req: Request, res: Response) => {
        const { isHidden } = req.body;
        const product = await productService.toggleVisibility(req.params.id, isHidden);
        return ApiResponse.success(res, 200, 'Product visibility updated', {
            id: (product as any)?.id || req.params.id,
            isHidden: product?.isHidden
        });
    });

    /**
     * @desc    Get products by type
     * @route   GET /api/v1/admin/products/type/:type
     * @access  Private/Admin
     */
    getByType = catchAsync(async (req: Request, res: Response) => {
        const products = await productService.getProductsByType(req.params.type);
        return ApiResponse.success(res, 200, 'Products retrieved successfully', products);
    });

    /**
     * @desc    Get products by group
     * @route   GET /api/v1/admin/products/group/:group
     * @access  Private/Admin
     */
    getByGroup = catchAsync(async (req: Request, res: Response) => {
        const products = await productService.getProductsByGroup(req.params.group);
        return ApiResponse.success(res, 200, 'Products retrieved successfully', products);
    });

    /**
     * @desc    Search products
     * @route   GET /api/v1/admin/products/search
     * @access  Private/Admin
     */
    search = catchAsync(async (req: Request, res: Response) => {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            return ApiResponse.error(res, 400, 'Search query is required');
        }
        const products = await productService.searchProducts(q);
        return ApiResponse.success(res, 200, 'Search results retrieved', products);
    });
}

export const productController = new ProductController();
