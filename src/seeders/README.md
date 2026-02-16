# Database Seeding

This directory contains database seeding scripts for populating the database with default data.

## 📁 Structure

```
seeders/
├── index.ts              # Main seeder orchestrator
├── user.seeder.ts        # User seeding logic
└── data/
    └── users.seed.ts     # Default user data
```

## 🚀 Usage

### Seed Database

Run the seeder to populate the database with default data:

```bash
npm run seed
```

This will:
- Connect to MongoDB
- Check if data already exists
- Seed users (and other data as you add more seeders)
- Skip seeding if data already exists

### Force Reseed

To clear existing data and reseed:

```bash
npm run seed:force
```

This will:
- Clear all existing data
- Seed fresh data

### Clear Database

To only clear data without reseeding:

```bash
npm run seed:clear
```

### Seed Only Users

To seed only users:

```bash
npm run seed:users
```

To force reseed only users:

```bash
npm run seed:users:force
```

## 👥 Default Users

The seeder creates the following default users:

### Admin User
- **Email**: `admin@example.com`
- **Password**: `Admin@123456`
- **Role**: Admin
- **Status**: Verified & Active

### Moderator User
- **Email**: `moderator@example.com`
- **Password**: `Moderator@123456`
- **Role**: Moderator
- **Status**: Verified & Active

### Test User
- **Email**: `user@example.com`
- **Password**: `User@123456`
- **Role**: User
- **Status**: Verified & Active

### John Doe
- **Email**: `john.doe@example.com`
- **Password**: `JohnDoe@123456`
- **Role**: User
- **Status**: Unverified & Active

### Jane Smith
- **Email**: `jane.smith@example.com`
- **Password**: `JaneSmith@123456`
- **Role**: User
- **Status**: Verified & Active

## 🔧 Adding New Seeders

To add a new seeder (e.g., for products):

1. **Create seed data file**: `data/products.seed.ts`
   ```typescript
   export const defaultProducts = [
       {
           name: 'Product 1',
           price: 99.99,
           // ... other fields
       },
   ];
   ```

2. **Create seeder file**: `product.seeder.ts`
   ```typescript
   import Product from '../modules/product/product.model';
   import { defaultProducts } from './data/products.seed';
   
   export const seedProducts = async (): Promise<void> => {
       // Seeding logic
       await Product.insertMany(defaultProducts);
   };
   
   export const clearProducts = async (): Promise<void> => {
       await Product.deleteMany({});
   };
   ```

3. **Update main seeder**: Add to `index.ts`
   ```typescript
   import { seedProducts, clearProducts } from './product.seeder';
   
   // In seedAll function:
   await seedProducts();
   
   // In clearAll function:
   await clearProducts();
   ```

4. **Add npm script**: Update `package.json`
   ```json
   "seed:products": "ts-node src/seeders/product.seeder.ts",
   "seed:products:force": "ts-node src/seeders/product.seeder.ts --force"
   ```

## 🛡️ Security Notes

- **Change default passwords** in production
- Default users are for **development/testing only**
- Never commit sensitive credentials to version control
- Use environment variables for production seeds

## 📝 Environment

The seeder uses the same MongoDB connection as your application:
- Connection URI: `MONGODB_URI` from `.env`
- Ensure your database is running before seeding

## ⚠️ Important

- Seeding will **skip** if data already exists (unless using `--force`)
- The `--force` flag will **delete all existing data**
- Always backup your database before using `--force` in production
- Test seeders in development environment first

## 🎯 Best Practices

1. **Keep seed data minimal** - Only essential default data
2. **Use realistic data** - Make it useful for testing
3. **Document credentials** - List all default users/passwords
4. **Version control** - Track changes to seed data
5. **Environment-specific** - Different seeds for dev/staging/prod
