# Product Module

This module handles all product/hosting package management operations for the FlexoHost Billing system.

## Overview

The Product module provides a complete API for managing hosting products, VPS packages, domains, and SSL certificates. It includes support for:

- Multiple product types (hosting, vps, domain, ssl)
- Multi-currency pricing (BDT, USD, EUR, GBP)
- Flexible billing cycles (monthly, quarterly, semi-annually, annually, biennially, triennially)
- Module integration (cPanel, DirectAdmin, Plesk, Virtualizor)
- Free domain offerings
- Product visibility management
- Stock tracking

## File Structure

```
product/
├── index.ts                  # Module exports
├── product.interface.ts      # TypeScript interfaces and types
├── product.model.ts          # Mongoose schema and model
├── product.service.ts        # Business logic layer
├── product.controller.ts     # HTTP request handlers
├── product.routes.ts         # Express route definitions
├── product.validation.ts     # Request validation rules
└── README.md                 # This file
```

## API Endpoints

All endpoints require admin authentication.

### Base URL
```
/api/v1/admin/products
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create a new product |
| GET | `/` | Get all products (with filtering & pagination) |
| GET | `/:id` | Get a single product by ID |
| PUT | `/:id` | Update a product |
| DELETE | `/:id` | Delete a product |
| PATCH | `/:id/visibility` | Toggle product visibility |
| GET | `/search?q=term` | Search products |
| GET | `/type/:type` | Get products by type |
| GET | `/group/:group` | Get products by group |

## Data Models

### Product Interface

```typescript
interface IProduct {
    name: string;
    type: 'hosting' | 'vps' | 'domain' | 'ssl';
    group: string;
    description?: string;
    paymentType: 'free' | 'one-time' | 'recurring';
    pricing?: ICurrencyPricing[];
    features: string[];
    stock?: number;
    module?: IModuleConfig;
    freeDomain?: IFreeDomain;
    isHidden: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
```

### Currency Pricing

```typescript
interface ICurrencyPricing {
    currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
    monthly: IPricingDetail;
    quarterly: IPricingDetail;
    semiAnnually: IPricingDetail;
    annually: IPricingDetail;
    biennially: IPricingDetail;
    triennially: IPricingDetail;
}

interface IPricingDetail {
    price: number;
    setupFee: number;
    renewPrice: number;
    enable: boolean;
}
```

## Usage Examples

### Creating a Product

```typescript
import { productService } from './modules/product';

const newProduct = await productService.createProduct({
    name: 'Business Hosting',
    type: 'hosting',
    group: 'Web Hosting',
    description: 'Perfect for small businesses',
    paymentType: 'recurring',
    pricing: [
        {
            currency: 'BDT',
            monthly: { price: 500, setupFee: 0, renewPrice: 500, enable: true },
            annually: { price: 5000, setupFee: 0, renewPrice: 5000, enable: true },
            // ... other cycles
        }
    ],
    features: ['10 GB SSD', 'Unlimited Bandwidth', 'Free SSL'],
    module: {
        name: 'cpanel',
        serverGroup: 'BDIX-01',
        packageName: 'business_plan'
    }
});
```

### Getting Products with Filters

```typescript
const result = await productService.getProducts({
    type: 'hosting',
    group: 'Web Hosting',
    isHidden: false,
    page: 1,
    limit: 20,
    sort: '-createdAt'
});

console.log(result.products);
console.log(result.pagination);
```

### Updating a Product

```typescript
const updatedProduct = await productService.updateProduct(
    productId,
    {
        name: 'Business Hosting Pro',
        description: 'Updated description'
    }
);
```

### Toggling Visibility

```typescript
const product = await productService.toggleVisibility(productId, true);
```

## Validation

All endpoints include comprehensive validation using `express-validator`:

- **Product name**: 3-100 characters, unique
- **Product type**: Must be one of the allowed types
- **Pricing**: Required for non-free products
- **Features**: Maximum 50 features
- **Stock**: Must be non-negative
- **Module configuration**: Validated against allowed module types

## Database Schema

### Indexes

The following indexes are created for optimal query performance:

- `{ type: 1, group: 1 }` - For filtering by type and group
- `{ name: 'text', description: 'text' }` - For full-text search
- `{ isHidden: 1, type: 1 }` - For visibility filtering
- `{ name: 1 }` - Unique index for product names

### Validation Rules

- At least one billing cycle must be enabled for non-free products
- Product names are unique (case-insensitive)
- Pricing is required for non-free products
- Stock cannot be negative

## Error Handling

The module uses centralized error handling with custom error codes:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `DUPLICATE_PRODUCT` | 409 | Product with same name exists |
| `PRODUCT_NOT_FOUND` | 404 | Product ID not found |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |

## Service Layer Methods

### ProductService

- `createProduct(productData)` - Create a new product
- `getProducts(filter)` - Get all products with filtering
- `getProductById(id)` - Get a single product
- `updateProduct(id, updateData)` - Update a product
- `deleteProduct(id)` - Delete a product
- `toggleVisibility(id, isHidden)` - Toggle product visibility
- `getProductsByType(type)` - Get products by type
- `getProductsByGroup(group)` - Get products by group
- `searchProducts(searchTerm)` - Search products

## Testing

### Manual Testing with cURL

```bash
# Create a product
curl -X POST http://localhost:5000/api/v1/admin/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Starter Plan",
    "type": "hosting",
    "group": "Web Hosting",
    "paymentType": "recurring",
    "pricing": [...]
  }'

# Get all products
curl -X GET "http://localhost:5000/api/v1/admin/products?type=hosting" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Update a product
curl -X PUT http://localhost:5000/api/v1/admin/products/PRODUCT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"name": "Updated Name"}'
```

## Integration

### Frontend Integration

The frontend should use the API endpoints defined in this module. See `BACKEND_API_SPEC_HOSTING_PRODUCTS.md` for detailed API documentation.

### Module Integration

Products can be linked to server modules (cPanel, DirectAdmin, etc.) through the `module` configuration:

```typescript
module: {
    name: 'cpanel',
    serverGroup: 'BDIX-01',
    packageName: 'business_plan_2gb'
}
```

## Best Practices

1. **Always validate input** - Use the provided validation middleware
2. **Handle errors gracefully** - All service methods throw ApiError for consistency
3. **Use pagination** - For large product lists, always use pagination
4. **Cache when possible** - Consider caching product lists for better performance
5. **Audit changes** - Track who creates/updates products (timestamps are automatic)

## Related Documentation

- [Backend API Specification](../../BACKEND_API_SPEC_HOSTING_PRODUCTS.md)
- [Product Form Guide](../../PRODUCT_FORM_GUIDE.md)
- [Server Module](../server/README.md)

## Future Enhancements

- [ ] Product categories/tags
- [ ] Product reviews and ratings
- [ ] Bulk import/export
- [ ] Product templates
- [ ] Advanced pricing rules
- [ ] Product bundles
- [ ] Automated stock management
- [ ] Integration with external inventory systems

---

**Module Version:** 1.0  
**Last Updated:** 2026-02-17  
**Maintainer:** FlexoHost Development Team
