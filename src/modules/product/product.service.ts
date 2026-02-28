import mongoose from 'mongoose';
import Product from './product.model';
import { IProduct, IProductQueryFilter } from './product.interface';
import ApiError from '../../utils/apiError';

/**
 * Product Service Class
 * Handles all business logic for product operations
 */
class ProductService {
    /**
     * Create a new product
     */
    async createProduct(productData: Partial<IProduct>): Promise<IProduct> {
        // Check if product name already exists (case-insensitive)
        const existingProduct = await Product.findOne({
            name: { $regex: new RegExp(`^${productData.name}$`, 'i') }
        });

        if (existingProduct) {
            throw new ApiError(409, 'A product with this name already exists');
        }

        const product = await Product.create(productData);
        return product;
    }

    /**
     * Get all products with filtering and pagination
     */
    async getProducts(filter: IProductQueryFilter = {}) {
        const { type, group, isHidden, page = 1, limit = 20, sort = '-createdAt' } = filter;

        // Build query
        const query: any = {};
        if (type) query.type = type;
        if (group) query.group = group;
        if (isHidden !== undefined) query.isHidden = isHidden;

        // Execute query with pagination
        const products = await Product.find(query)
            .sort(sort)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .exec();

        // Get total count
        const count = await Product.countDocuments(query);

        return {
            products,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(count / Number(limit)),
                totalItems: count,
                itemsPerPage: Number(limit)
            }
        };
    }

    /**
     * Get product by ID
     */
    async getProductById(id: string): Promise<IProduct | null> {
        let product;

        // Check if id is valid ObjectId
        if (mongoose.isValidObjectId(id)) {
            product = await Product.findById(id);
        } else if (!isNaN(Number(id)) && id.length === 6) {
            // If not ObjectId, check if it's a 6-digit PID
            product = await Product.findOne({ pid: Number(id) });
        }

        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        return product;
    }

    /**
     * Update product
     */
    async updateProduct(id: string, updateData: Partial<IProduct>): Promise<IProduct | null> {
        // If updating name, check for duplicates
        if (updateData.name) {
            const existingProduct = await Product.findOne({
                name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
                _id: { $ne: id }
            });

            if (existingProduct) {
                throw new ApiError(409, 'A product with this name already exists');
            }
        }

        const product = await Product.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );

        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        return product;
    }

    /**
     * Delete product
     */
    async deleteProduct(id: string): Promise<IProduct | null> {
        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        return product;
    }

    /**
     * Toggle product visibility
     */
    async toggleVisibility(id: string, isHidden: boolean): Promise<IProduct | null> {
        const product = await Product.findByIdAndUpdate(
            id,
            { isHidden },
            {
                new: true,
                runValidators: true
            }
        );

        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        return product;
    }

    /**
     * Get products by type
     */
    async getProductsByType(type: string): Promise<IProduct[]> {
        return Product.find({ type, isHidden: false }).sort({ createdAt: -1 });
    }

    /**
     * Get products by group
     */
    async getProductsByGroup(group: string): Promise<IProduct[]> {
        return Product.find({ group, isHidden: false }).sort({ createdAt: -1 });
    }

    /**
     * Search products by name or description
     */
    async searchProducts(searchTerm: string): Promise<IProduct[]> {
        return Product.find({
            $text: { $search: searchTerm },
            isHidden: false
        }).sort({ score: { $meta: 'textScore' } });
    }
}

export const productService = new ProductService();
