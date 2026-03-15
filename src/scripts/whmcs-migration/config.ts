import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root (works whether run from CLI or API)
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const password = process.env.WHMCS_MYSQL_PASSWORD?.trim() ?? '';

export const whmcsConfig = {
    host: process.env.WHMCS_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.WHMCS_MYSQL_PORT || '3306', 10),
    user: process.env.WHMCS_MYSQL_USER || 'root',
    password,
    database: process.env.WHMCS_MYSQL_DATABASE || 'whmcs',
};

export const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/billing-software';
