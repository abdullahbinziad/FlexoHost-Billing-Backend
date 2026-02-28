/**
 * Product API Usage Examples
 * 
 * This file contains example requests for testing the Product API
 * Use these with Postman, cURL, or your HTTP client of choice
 */

// ============================================
// BASE CONFIGURATION
// ============================================

const BASE_URL = 'http://localhost:5000/api/v1/admin/products';
const ADMIN_TOKEN = 'YOUR_ADMIN_JWT_TOKEN_HERE';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_TOKEN}`
};

// ============================================
// 1. CREATE PRODUCT
// ============================================

const createProductExample = {
    method: 'POST',
    url: BASE_URL,
    headers,
    body: {
        name: 'Business Hosting Plan',
        type: 'hosting',
        group: 'Web Hosting',
        description: 'Perfect for small to medium businesses with high traffic',
        paymentType: 'recurring',
        pricing: [
            {
                currency: 'BDT',
                monthly: {
                    price: 500,
                    setupFee: 0,
                    renewPrice: 500,
                    enable: true
                },
                quarterly: {
                    price: 1400,
                    setupFee: 0,
                    renewPrice: 1400,
                    enable: true
                },
                semiAnnually: {
                    price: 2700,
                    setupFee: 0,
                    renewPrice: 2700,
                    enable: true
                },
                annually: {
                    price: 5000,
                    setupFee: 0,
                    renewPrice: 5000,
                    enable: true
                },
                biennially: {
                    price: 9500,
                    setupFee: 0,
                    renewPrice: 9500,
                    enable: true
                },
                triennially: {
                    price: 13500,
                    setupFee: 0,
                    renewPrice: 13500,
                    enable: true
                }
            },
            {
                currency: 'USD',
                monthly: {
                    price: 5.99,
                    setupFee: 0,
                    renewPrice: 5.99,
                    enable: true
                },
                quarterly: {
                    price: 16.99,
                    setupFee: 0,
                    renewPrice: 16.99,
                    enable: true
                },
                semiAnnually: {
                    price: 32.99,
                    setupFee: 0,
                    renewPrice: 32.99,
                    enable: true
                },
                annually: {
                    price: 59.99,
                    setupFee: 0,
                    renewPrice: 59.99,
                    enable: true
                },
                biennially: {
                    price: 114.99,
                    setupFee: 0,
                    renewPrice: 114.99,
                    enable: true
                },
                triennially: {
                    price: 164.99,
                    setupFee: 0,
                    renewPrice: 164.99,
                    enable: true
                }
            }
        ],
        features: [
            '10 GB SSD Storage',
            'Unlimited Bandwidth',
            'Free SSL Certificate',
            'cPanel Control Panel',
            'Daily Backups',
            '24/7 Support',
            '99.9% Uptime Guarantee',
            'Free Website Migration'
        ],
        stock: null, // null means unlimited
        module: {
            name: 'cpanel',
            serverGroup: 'BDIX-01',
            packageName: 'business_plan_10gb'
        },
        freeDomain: {
            enabled: true,
            type: 'once',
            paymentTerms: ['Annually', 'Biennially', 'Triennially'],
            tlds: ['.com', '.net', '.org', '.xyz']
        },
        isHidden: false
    }
};

// ============================================
// 2. GET ALL PRODUCTS (with filtering)
// ============================================

const getAllProductsExample = {
    method: 'GET',
    url: `${BASE_URL}?type=hosting&group=Web%20Hosting&page=1&limit=10&sort=-createdAt`,
    headers
};

// ============================================
// 3. GET SINGLE PRODUCT
// ============================================

const getProductByIdExample = {
    method: 'GET',
    url: `${BASE_URL}/65f8a1b2c3d4e5f6a7b8c9d0`, // Replace with actual product ID
    headers
};

// ============================================
// 4. UPDATE PRODUCT
// ============================================

const updateProductExample = {
    method: 'PUT',
    url: `${BASE_URL}/65f8a1b2c3d4e5f6a7b8c9d0`, // Replace with actual product ID
    headers,
    body: {
        name: 'Business Hosting Plan Pro',
        description: 'Updated description with more features',
        features: [
            '20 GB SSD Storage', // Updated
            'Unlimited Bandwidth',
            'Free SSL Certificate',
            'cPanel Control Panel',
            'Daily Backups',
            '24/7 Priority Support', // Updated
            '99.9% Uptime Guarantee',
            'Free Website Migration',
            'Free CDN' // New feature
        ]
    }
};

// ============================================
// 5. DELETE PRODUCT
// ============================================

const deleteProductExample = {
    method: 'DELETE',
    url: `${BASE_URL}/65f8a1b2c3d4e5f6a7b8c9d0`, // Replace with actual product ID
    headers
};

// ============================================
// 6. TOGGLE PRODUCT VISIBILITY
// ============================================

const toggleVisibilityExample = {
    method: 'PATCH',
    url: `${BASE_URL}/65f8a1b2c3d4e5f6a7b8c9d0/visibility`, // Replace with actual product ID
    headers,
    body: {
        isHidden: true // Hide the product
    }
};

// ============================================
// 7. SEARCH PRODUCTS
// ============================================

const searchProductsExample = {
    method: 'GET',
    url: `${BASE_URL}/search?q=business`,
    headers
};

// ============================================
// 8. GET PRODUCTS BY TYPE
// ============================================

const getProductsByTypeExample = {
    method: 'GET',
    url: `${BASE_URL}/type/hosting`,
    headers
};

// ============================================
// 9. GET PRODUCTS BY GROUP
// ============================================

const getProductsByGroupExample = {
    method: 'GET',
    url: `${BASE_URL}/group/Web%20Hosting`,
    headers
};

// ============================================
// CURL EXAMPLES
// ============================================

/*
# Create Product
curl -X POST http://localhost:5000/api/v1/admin/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Starter Plan",
    "type": "hosting",
    "group": "Web Hosting",
    "description": "Perfect for beginners",
    "paymentType": "recurring",
    "pricing": [{
      "currency": "BDT",
      "monthly": {"price": 300, "setupFee": 0, "renewPrice": 300, "enable": true},
      "annually": {"price": 3000, "setupFee": 0, "renewPrice": 3000, "enable": true}
    }],
    "features": ["5 GB SSD", "Unlimited Bandwidth", "Free SSL"]
  }'

# Get All Products
curl -X GET "http://localhost:5000/api/v1/admin/products?type=hosting&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get Single Product
curl -X GET http://localhost:5000/api/v1/admin/products/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Update Product
curl -X PUT http://localhost:5000/api/v1/admin/products/PRODUCT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"name": "Updated Name"}'

# Delete Product
curl -X DELETE http://localhost:5000/api/v1/admin/products/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Toggle Visibility
curl -X PATCH http://localhost:5000/api/v1/admin/products/PRODUCT_ID/visibility \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"isHidden": true}'

# Search Products
curl -X GET "http://localhost:5000/api/v1/admin/products/search?q=business" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
*/

// ============================================
// EXPECTED RESPONSES
// ============================================

/*
SUCCESS RESPONSE (Create/Update):
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "65f8a1b2c3d4e5f6a7b8c9d0",
    "name": "Business Hosting Plan",
    "type": "hosting",
    "group": "Web Hosting",
    "description": "Perfect for small to medium businesses",
    "paymentType": "recurring",
    "pricing": [...],
    "features": [...],
    "module": {...},
    "freeDomain": {...},
    "isHidden": false,
    "createdAt": "2026-02-17T00:10:44.000Z",
    "updatedAt": "2026-02-17T00:10:44.000Z"
  }
}

SUCCESS RESPONSE (Get All):
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 25,
      "itemsPerPage": 10
    }
  }
}

ERROR RESPONSE:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: Product name is required",
    "details": [...]
  }
}
*/

export {
    createProductExample,
    getAllProductsExample,
    getProductByIdExample,
    updateProductExample,
    deleteProductExample,
    toggleVisibilityExample,
    searchProductsExample,
    getProductsByTypeExample,
    getProductsByGroupExample
};
