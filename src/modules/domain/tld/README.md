
# TLD Module API Documentation

This module handles Top Level Domain (TLD) management, including pricing, registry details, and ordering.

## Base URL
`/api/v1/tlds`

## Endpoints

### 1. Create a New TLD
Create a new TLD entry in the system.

- **URL**: `/`
- **Method**: `POST`
- **Auth Required**: Yes (Admin)
- **Body**:
```json
{
    "tld": "com",
    "register": "PublicDomainRegistry",
    "label": "Most Popular",
    "serial": 1,
    "pricing": [
        { "year": 1, "register": 12.99, "renew": 12.99, "transfer": 10.99 },
        { "year": 2, "register": 24.99, "renew": 24.99, "transfer": 20.99 },
        { "year": 3, "register": 36.99, "renew": 36.99, "transfer": 30.99 }
    ],
    "isSpotlight": true,
    "features": {
        "dnsManagement": true,
        "emailForwarding": true,
        "idProtection": true
    },
    "autoRegistration": {
        "enabled": false,
        "provider": "Enom"
    },
    "status": "active"
}
```

### 2. Get All TLDs
Retrieve a list of all TLDs.

- **URL**: `/`
- **Method**: `GET`
- **Query Params**:
  - `status` (optional): Filter by status (e.g., `active`, `inactive`)
  - `isSpotlight` (optional): Filter by spotlight status (`true`, `false`)
- **Response**: List of TLD objects, sorted by `serial` ascending.

### 3. Get TLD by ID
Retrieve a specific TLD by its MongoDB ID.

- **URL**: `/:id`
- **Method**: `GET`
- **Response**: Single TLD object.

### 4. Get TLD by Extension
Retrieve a specific TLD by its extension (e.g., `com`).

- **URL**: `/extension/:extension`
- **Method**: `GET`
- **Example**: `/extension/com`
- **Response**: Single TLD object.

### 5. Update TLD
Update an existing TLD.

- **URL**: `/:id`
- **Method**: `PATCH`
- **Auth Required**: Yes (Admin)
- **Body**: (Partial TLD object)
```json
{
    "pricing": [
        { "year": 1, "register": 15.99, "renew": 15.99, "transfer": 12.99 }
    ],
    "isSpotlight": false
}
```

### 6. Delete TLD
Delete a TLD.

- **URL**: `/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes (Admin)

## Data Structure

### Pricing Object
```typescript
{
    year: number;      // e.g., 1
    register: number;  // Registration price
    renew: number;     // Renewal price
    transfer: number;  // Transfer price
}
```

### TLD Object
```typescript
interface ITLD {
    _id: string;
    tld: string;             // e.g., "com"
    register: string;        // Registry name
    serial: number;          // Sorting order
    label?: string;          // Frontend label, e.g., "Popular"
    isSpotlight: boolean;    // Featured status
    pricing: Pricing[];      // Array of pricing tiers
    features: {
        dnsManagement: boolean;
        emailForwarding: boolean;
        idProtection: boolean;
    };
    autoRegistration: {
        enabled: boolean;
        provider: string;
    };
    status: 'active' | 'inactive' | 'maintenance';
}
```
