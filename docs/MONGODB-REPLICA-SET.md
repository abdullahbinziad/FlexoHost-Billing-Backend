# MongoDB Replica Set Setup

The backend uses **MongoDB transactions** for critical flows (e.g. client registration, orders, payments). Transactions are only supported when MongoDB runs as a **replica set**—not in standalone mode.

If you see:

```text
Transaction numbers are only allowed on a replica set member or mongos
```

then MongoDB is running as a standalone instance. Fix it by converting to a replica set and updating the connection string; do **not** remove transaction logic from the code.

---

## 1. Run MongoDB with replica set

Start MongoDB with a replica set name (e.g. `rs0`).

### Option A: Command line

```bash
mongod --replSet rs0 --bind_ip localhost --port 27017
```

### Option B: Config file (`mongod.conf`)

```yaml
replication:
  replSetName: rs0
net:
  bindIp: localhost
  port: 27017
```

Then start MongoDB as usual (e.g. `systemctl start mongod` or `mongod -f mongod.conf`).

### Option C: Docker

```bash
docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0
```

### Option D: Coolify / single-node

For a single MongoDB instance in Coolify:

1. In **Custom MongoDB Configuration** add:
   ```yaml
   replication:
     replSetName: "rs0"
   ```
2. (Optional but recommended for multi-node) Add a keyfile and:
   ```yaml
   security:
     authorization: enabled
     keyFile: /path/to/keyfile
   ```
3. Restart the MongoDB service.

---

## 2. Initialize the replica set

After MongoDB is running with `--replSet rs0`, connect and run **once**:

```bash
mongosh
```

```js
rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
```

- For **local single-node**: `host` can be `localhost:27017` (or `127.0.0.1:27017`).
- For **remote or Coolify**: use the host/port the app will use to connect (e.g. your server IP and public port, or the container hostname if applicable).

Check status:

```js
rs.status();
```

You should see one member in state `PRIMARY`.

---

## 3. Update the connection string

Set `MONGODB_URI` so the driver knows it is talking to a replica set.

**Single host (e.g. local or one Coolify instance):**

```env
MONGODB_URI=mongodb://username:password@host:27017/your-db?authSource=admin&replicaSet=rs0
```

**Multiple hosts (replica set with several nodes):**

```env
MONGODB_URI=mongodb://username:password@host1:27017,host2:27018,host3:27019/your-db?authSource=admin&replicaSet=rs0
```

Important:

- Include **`replicaSet=rs0`** (or whatever you used in `replSetName`).
- `authSource=admin` if your user is in the `admin` database.

Example for local dev (no auth):

```env
MONGODB_URI=mongodb://localhost:27017/billing-software?replicaSet=rs0
```

---

## 4. Verify

1. Restart the backend so it picks up the new `MONGODB_URI`.
2. Call the client registration endpoint, e.g.:
   ```bash
   curl -X POST http://localhost:5001/api/v1/clients/register \
     -H "Content-Type: application/json" \
     -d '{"userData":{"email":"test@example.com","password":"Test@123456"},"clientData":{"firstName":"Test","lastName":"User","contactEmail":"test@example.com"}}'
   ```
3. A successful response (e.g. 201 with client/user/tokens) and no transaction error in logs means the replica set is configured correctly and transaction-based flows like `/api/v1/clients/register` work.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Start MongoDB with `--replSet rs0` (or equivalent in config/Coolify). |
| 2 | Run `rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });` once. |
| 3 | Set `MONGODB_URI` with `?replicaSet=rs0` (and auth if needed). |
| 4 | Restart the backend and verify registration/transaction flows. |

The application code stays unchanged; the fix is entirely on the MongoDB deployment and connection string.
