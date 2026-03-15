# WHMCS to FlexoHost Migration

Migrates data from WHMCS (MySQL) to FlexoHost Billing (MongoDB).

## Quick Start

1. **Place your WHMCS SQL file** (`.sql` or `.sql.zip`) in the project or note its path.

2. **Set environment variables** in `.env`:

   ```
   # WHMCS MySQL (source)
   WHMCS_MYSQL_HOST=localhost
   WHMCS_MYSQL_PORT=3306
   WHMCS_MYSQL_USER=root
   WHMCS_MYSQL_PASSWORD=yourpassword
   WHMCS_MYSQL_DATABASE=whmcs_migrate

   # Optional: path to SQL file (for import script)
   WHMCS_SQL_PATH=./whmcs_backup.sql.zip
   ```

3. **Import SQL** (if MySQL client is installed):

   ```bash
   npm run migrate:whmcs:import -- ./whmcs_backup.sql.zip
   # Or: npm run migrate:whmcs:import -- ./whmcs_backup.sql
   ```

4. **Run migration**:

   ```bash
   npm run migrate:whmcs
   ```

## Manual SQL Import

If you prefer to import manually:

```bash
unzip whmcs_backup.sql.zip
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS whmcs_migrate;"
mysql -u root -p whmcs_migrate < whmcs_backup.sql
```

## Migration Order

1. Users (admin)
2. Clients + Users (client login accounts)
3. Products
4. Servers
5. TLDs
6. Orders + OrderItems
7. Invoices + InvoiceItems
8. Services (hosting, domains)
9. Transactions
10. Domain details (nameservers, contacts)

## ID Mapping

The script stores `whmcs_id → flexohost_id` mappings in the `WhmcsIdMapping` collection so foreign keys are resolved correctly.

## Passwords

WHMCS uses MD5; FlexoHost uses bcrypt. Migrated clients will need to **reset their password** on first login, or you can set a temporary password.

## Dry Run

Use `--dry-run` to see what would be migrated without writing to MongoDB:

```bash
npm run migrate:whmcs -- --dry-run
```
