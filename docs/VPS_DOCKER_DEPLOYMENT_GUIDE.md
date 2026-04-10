# FlexoHost Billing - Beginner VPS Deployment Guide (Docker)

This guide deploys your **frontend + backend + MongoDB replica set** on an Ubuntu VPS using Docker.

## 1) What was prepared in this project

These files are now included/updated:

- `Dockerfile` (backend, production multi-stage build)
- `../docker-compose.yml` (full stack: frontend, backend, mongo replica set)
- `scripts/mongo/init-replica.js` (auto initialize `rs0`)
- `.env.docker.example` (safe template for Docker deployment)
- `../FlexoHost-Billing-Frontend/Dockerfile` (frontend production standalone image)
- `../FlexoHost-Billing-Frontend/next.config.ts` (`output: "standalone"`)

## 2) VPS prerequisites

- Ubuntu 22.04 or 24.04 VPS
- Root access or user with `sudo`
- Domain pointed to VPS IP (optional but recommended)

## 3) Server setup (first login)

SSH into VPS:

```bash
ssh root@YOUR_VPS_IP
```

Update system:

```bash
apt update && apt upgrade -y
```

Create a deploy user (optional but recommended):

```bash
adduser deploy
usermod -aG sudo deploy
```

Switch user:

```bash
su - deploy
```

## 4) Install Docker + Compose plugin

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Allow current user to run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

## 5) Upload project to VPS

Recommended target structure:

```text
/home/deploy/apps/FlexoHost-Billing/
  FlexoHost-Billing-Backend/
  FlexoHost-Billing-Frontend/
```

Clone both repos into same parent folder:

```bash
mkdir -p ~/apps/FlexoHost-Billing
cd ~/apps/FlexoHost-Billing
git clone <BACKEND_REPO_URL> FlexoHost-Billing-Backend
git clone <FRONTEND_REPO_URL> FlexoHost-Billing-Frontend
```

> `docker-compose.yml` is in the parent `FlexoHost-Billing/` folder and expects both repos as siblings.

## 6) Configure environment safely

Go to backend:

```bash
cd ~/apps/FlexoHost-Billing/FlexoHost-Billing-Backend
```

Create deployment env file:

```bash
cp .env.docker.example .env.docker
```

Edit it:

```bash
nano .env.docker
```

Then go back to the parent folder (where `docker-compose.yml` is):

```bash
cd ~/apps/FlexoHost-Billing
```

Minimum required edits:

- Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Set production URLs:
  - `NEXT_PUBLIC_FRONTEND_URL=https://portal.flexohost.com`
  - `NEXT_PUBLIC_BACKEND_URL=https://portalapi.flexohost.com`
  - `FRONTEND_URL`, `CORS_ORIGIN`, `API_URL`, `WEBSITE_URL`
- Configure SMTP values
- Configure payment/provider keys if needed
- Set `COOKIE_DOMAIN=.flexohost.com`

Generate secure random secrets:

```bash
openssl rand -hex 64
```

## 7) Build and run the stack

From backend directory:

```bash
docker compose --env-file ./FlexoHost-Billing-Backend/.env.docker up -d --build
```

Check status:

```bash
docker compose ps
```

Check logs:

```bash
docker compose logs -f mongo
docker compose logs -f backend
docker compose logs -f frontend
```

Health checks:

```bash
curl http://YOUR_VPS_IP:5001/health
curl http://YOUR_VPS_IP:3000
```

## 8) Domain setup

In DNS:

- `A` record: `portal.flexohost.com` -> VPS IP
- `A` record: `portalapi.flexohost.com` -> VPS IP

### Option A (easy): reverse proxy with Caddy (recommended)

Install Caddy on host and proxy:

- `portal.flexohost.com` -> `localhost:3000`
- `portalapi.flexohost.com` -> `localhost:5001`

Caddy automatically handles HTTPS certificates.

### Option B: Nginx + Certbot

Use Nginx as reverse proxy and `certbot` for LetsEncrypt SSL.

## 9) Firewall and security basics

If using UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw allow 5001
sudo ufw enable
```

After reverse proxy is ready, close direct app ports (recommended):

```bash
sudo ufw delete allow 3000
sudo ufw delete allow 5001
```

Important:

- Do not commit `.env.docker`
- Rotate any leaked secrets immediately
- Keep Docker/images updated regularly

## 10) Data persistence (no data loss)

Docker named volumes are used:

- `mongo_data` (MongoDB data)
- `backend_uploads` (uploaded files)
- `backend_logs` (app logs)
- `mongo_backups` (backup artifacts)

Inspect volumes:

```bash
docker volume ls
```

## 11) MongoDB backup strategy

Create backup folder:

```bash
mkdir -p ~/backups/flexohost
```

Dump database:

```bash
docker compose exec -T mongo mongodump --archive --gzip > ~/backups/flexohost/mongo_$(date +%F_%H-%M-%S).gz
```

Restore from backup:

```bash
cat ~/backups/flexohost/mongo_YYYY-MM-DD_HH-MM-SS.gz | docker compose exec -T mongo mongorestore --archive --gzip --drop
```

## 12) Full migration to another VPS (portable)

On old VPS:

1. Export Mongo backup:
   ```bash
   docker compose exec -T mongo mongodump --archive --gzip > mongo_latest.gz
   ```
2. Archive uploads:
   ```bash
   docker run --rm -v flexohost-billing_backend_uploads:/data -v $PWD:/backup alpine sh -c "cd /data && tar czf /backup/uploads_latest.tar.gz ."
   ```
3. Copy to new VPS (`scp` or `rsync`):
   - `mongo_latest.gz`
   - `uploads_latest.tar.gz`
   - `.env.docker`

On new VPS:

1. Deploy app with same compose + `.env.docker`
2. Restore Mongo:
   ```bash
   cat mongo_latest.gz | docker compose exec -T mongo mongorestore --archive --gzip --drop
   ```
3. Restore uploads:
   ```bash
   docker run --rm -v flexohost-billing_backend_uploads:/data -v $PWD:/backup alpine sh -c "cd /data && tar xzf /backup/uploads_latest.tar.gz"
   ```

## 13) Operations cheat sheet

Start:

```bash
docker compose --env-file ./FlexoHost-Billing-Backend/.env.docker up -d
```

Stop:

```bash
docker compose down
```

Restart one service:

```bash
docker compose restart backend
```

Pull latest code and redeploy:

```bash
git pull
docker compose --env-file ./FlexoHost-Billing-Backend/.env.docker up -d --build
```

## 14) Production readiness checklist

- [ ] Secrets rotated and not exposed in git history
- [ ] `.env.docker` filled with production values
- [ ] Domain + HTTPS active
- [ ] Backups tested (backup + restore)
- [ ] Mongo replica set initialized (`rs.status()` shows PRIMARY)
- [ ] Health endpoints and logs verified
- [ ] Firewall only allows required ports
