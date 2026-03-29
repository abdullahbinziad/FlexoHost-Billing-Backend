import mongoose from 'mongoose';
import Product from './product.model';
import Server from '../server/server.model';
import { IProduct, IProductQueryFilter } from './product.interface';
import ApiError from '../../utils/apiError';
import { escapeRegex } from '../../utils/escapeRegex';

/**
 * Product Service Class
 * Handles all business logic for product operations
 */
class ProductService {
    private parseServerGroups(raw: unknown): string[] {
        if (Array.isArray(raw)) {
            return raw
                .map((v) => String(v || '').trim())
                .filter(Boolean);
        }
        if (typeof raw === 'string') {
            return raw
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
        }
        return [];
    }

    private buildProductQuery(filter: IProductQueryFilter = {}, options?: { publicOnly?: boolean }) {
        const { type, group, isHidden } = filter;

        const query: any = {};
        if (type) query.type = type;
        if (group) query.group = group;
        if (options?.publicOnly) {
            query.isHidden = false;
        } else if (isHidden !== undefined) {
            query.isHidden = isHidden;
        }

        return query;
    }

    /**
     * Create a new product
     */
    async createProduct(productData: Partial<IProduct>): Promise<IProduct> {
        // Check if product name already exists (case-insensitive)
        const name = productData?.name ? String(productData.name) : '';
        const existingProduct = name
            ? await Product.findOne({
                  name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
              })
            : null;

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

        const query = this.buildProductQuery({ type, group, isHidden });

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
     * Get public store products. Hidden products are always excluded.
     */
    async getPublicProducts(filter: IProductQueryFilter = {}) {
        const { type, group, page = 1, limit = 100, sort = 'name' } = filter;
        const query = this.buildProductQuery({ type, group }, { publicOnly: true });

        const products = await Product.find(query)
            .sort(sort)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .exec();

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
     * Get one public store product by ID or PID.
     */
    async getPublicProductById(id: string): Promise<IProduct | null> {
        const product = await this.getProductById(id);

        if (!product || (product as any).isHidden) {
            throw new ApiError(404, 'Product not found');
        }

        return product;
    }

    /**
     * Get public checkout configuration for a specific product.
     * Server locations are resolved from enabled servers that match
     * the product's module.serverGroup (or product group as fallback).
     */
    async getPublicCheckoutConfigByProductId(id: string): Promise<{
        serverLocations: Array<{ id: string; name: string }>;
    }> {
        const product = await this.getPublicProductById(id);
        const productServerGroups = this.parseServerGroups(
            (product as any)?.module?.serverGroups
                ?? (product as any)?.module?.serverGroup
                ?? (product as any)?.group
        );

        const candidateServers = await Server.find({ isEnabled: true })
            .select('location groups group')
            .lean();

        const groupMatches = (server: any): boolean => {
            if (productServerGroups.length === 0) return true;
            const groups = this.parseServerGroups(
                Array.isArray(server.groups) && server.groups.length > 0
                    ? server.groups
                    : server.group
            );
            return groups.length === 0 || productServerGroups.some((g) => groups.includes(g));
        };

        const eligibleServers = candidateServers.filter(groupMatches);
        const effectiveServers = eligibleServers.length > 0 ? eligibleServers : candidateServers;

        const uniqueLocations = Array.from(
            new Set(
                effectiveServers
                    .map((s: any) => String(s.location || '').trim())
                    .filter(Boolean)
            )
        );

        return {
            serverLocations: uniqueLocations.map((loc) => ({ id: loc, name: loc })),
        };
    }

    /**
     * Update product
     */
    async updateProduct(id: string, updateData: Partial<IProduct>): Promise<IProduct | null> {
        // If updating name, check for duplicates
        if (updateData.name) {
            const name = String(updateData.name);
            const existingProduct = await Product.findOne({
                name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
                _id: { $ne: id },
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
