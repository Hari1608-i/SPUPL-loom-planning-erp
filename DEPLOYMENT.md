# SPU LOOM ERP SYSTEM - PRODUCTION DEPLOYMENT GUIDE

Domain: **`https://loomplanning.santhiprocessing.com`**

Comprehensive guide for hosting, securing, deploying, and maintaining the **SPU Loom ERP System** on a production server.

---

## 📑 TABLE OF CONTENTS
1. [Production Domain & Architecture](#1-production-domain--architecture)
2. [Diagnosing & Fixing "502 Bad Gateway"](#2-diagnosing--fixing-502-bad-gateway)
3. [Prerequisites & Server Setup](#3-prerequisites--server-setup)
4. [Environment Configuration (`.env`)](#4-environment-configuration-env)
5. [Production Build & Installation](#5-production-build--installation)
6. [Nginx Reverse Proxy Configuration for `santhiprocessing.com`](#6-nginx-reverse-proxy-configuration-for-santhiprocessingcom)
7. [SSL (HTTPS) Certbot Setup](#7-ssl-https-certbot-setup)
8. [PM2 Process Manager Setup](#8-pm2-process-manager-setup)
9. [Database Backup & Restoration](#9-database-backup--restoration)
10. [Final Production Verification Checklist](#10-final-production-verification-checklist)

---

## 1. PRODUCTION DOMAIN & ARCHITECTURE

```
                      User Accesses:
         https://loomplanning.santhiprocessing.com
                             │
                             ▼
                 [ Nginx Reverse Proxy ]
                 (SSL via Certbot Let's Encrypt)
                ┌────────────┴────────────┐
                │                         │
     Static Web App Files           API Requests (/api/*)
    (frontend/dist bundle)          Proxy to Port 3002
                │                         │
                ▼                         ▼
         [ React Frontend ]     [ Node.js Express Backend ]
                                          │
                                          ▼
                                 [ Production Database ]
```

- **Production Frontend Domain**: `https://loomplanning.santhiprocessing.com`
- **Production Backend API URL**: `https://loomplanning.santhiprocessing.com/api` (or `https://api-loomplanning.santhiprocessing.com`)
- **Backend Service Port**: `3002`

---

## 2. DIAGNOSING & FIXING "502 BAD GATEWAY"

A **502 Bad Gateway** error means Nginx received the request for `loomplanning.santhiprocessing.com`, but the upstream Node.js backend API process on port 3002 is **either not running, crashed, or blocked**.

### 🔍 4 Steps to Fix 502 Bad Gateway Immediately:

#### Step 1: Check if Node.js Backend API is Running
Run on server terminal:
```bash
pm2 status
```
- If `spu-loom-backend` shows `stopped` or `errored`:
  ```bash
  pm2 restart spu-loom-backend
  pm2 logs spu-loom-backend --lines 50
  ```
- If Node.js is not managed via PM2, test starting manually:
  ```bash
  cd /var/www/spu-loom-erp/backend
  node upload_server.js
  ```

#### Step 2: Test Local Backend Connectivity on Port 3002
Run:
```bash
curl http://127.0.0.1:3002/api/system-health
```
- **Expected Output**: `{"status":"ok", ...}` (HTTP 200)
- If `Connection refused`: The backend API process is not listening on port 3002.

#### Step 3: Verify Nginx `proxy_pass` Configuration
Inspect `/etc/nginx/sites-available/loomplanning.santhiprocessing.com`:
Ensure Nginx proxies `/api/` to `http://127.0.0.1:3002/api/` (see Section 6 below).

#### Step 4: Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. PREREQUISITES & SERVER SETUP

### Server Hardware Requirements
- **OS**: Ubuntu 22.04 LTS / 24.04 LTS (Recommended)
- **CPU**: 2 vCPUs
- **RAM**: 4 GB RAM minimum
- **Disk**: 25 GB SSD

### Required Software Installation
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
```

---

## 4. ENVIRONMENT CONFIGURATION (`.env`)

### A. Backend Environment (`backend/.env`)
Create `backend/.env`:

```env
PORT=3002
NODE_ENV=production
DATABASE_URL="file:./dev.db"
JWT_SECRET="spu_loom_erp_super_secret_key_2026_change_in_prod"
DEFAULT_ADMIN_USERNAME="Admin"
DEFAULT_ADMIN_PASSWORD="!@#$%open"
FRONTEND_URL="https://loomplanning.santhiprocessing.com"
CORS_ORIGIN="https://loomplanning.santhiprocessing.com"
```

### B. Frontend Environment (`frontend/.env`)
Create `frontend/.env`:

```env
FRONTEND_URL=https://loomplanning.santhiprocessing.com
VITE_API_BASE_URL=https://loomplanning.santhiprocessing.com/api
```

---

## 5. PRODUCTION BUILD & INSTALLATION

```bash
# 1. Navigate to project root
cd /var/www/spu-loom-erp

# 2. Setup Backend
cd backend
npm install --production=false
npx prisma generate
npx prisma db push

# 3. Build Frontend
cd ../frontend
npm install
npm run build
```

---

## 6. NGINX REVERSE PROXY CONFIGURATION FOR `santhiprocessing.com`

Create Nginx site configuration file at `/etc/nginx/sites-available/loomplanning.santhiprocessing.com`:

```nginx
server {
    listen 80;
    server_name loomplanning.santhiprocessing.com;

    # Serve Production React Frontend (Dist Bundle)
    location / {
        root /var/www/spu-loom-erp/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API Requests to Node.js Backend Server on Port 3002
    location /api/ {
        proxy_pass http://127.0.0.1:3002/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/loomplanning.santhiprocessing.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. SSL (HTTPS) CERTBOT SETUP

Enable HTTPS certificate for `loomplanning.santhiprocessing.com`:

```bash
sudo certbot --nginx -d loomplanning.santhiprocessing.com
```

Certbot automatically configures HTTPS redirect and updates Nginx configuration to force secure connections.

---

## 8. PM2 PROCESS MANAGER SETUP

Create `backend/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'spu-loom-backend',
      script: 'upload_server.js',
      cwd: '/var/www/spu-loom-erp/backend',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      restart_delay: 3000,
      max_restarts: 10,
      error_file: './logs/err.log',
      out_file: './logs/out.log'
    }
  ]
};
```

Start service with autostart on system boot:

```bash
cd /var/www/spu-loom-erp/backend
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## 9. DATABASE BACKUP & RESTORATION

### Manual Backup Command
```bash
cd /var/www/spu-loom-erp/backend
node backup_db.js
```
Backups are saved to `backend/backups/spu_loom_erp_backup_YYYY-MM-DD...db`.

### Daily Automated Backup (Cron)
Add to crontab (`crontab -e`):
```cron
0 2 * * * cd /var/www/spu-loom-erp/backend && /usr/bin/node backup_db.js >> /var/log/spu_backup.log 2>&1
```

---

## 10. FINAL PRODUCTION VERIFICATION CHECKLIST

Test after pointing DNS to your server IP:

1. **HTTPS Connection**: `https://loomplanning.santhiprocessing.com` loads valid SSL certificate.
2. **Access Control Lock**: Unauthenticated visitors are directed to Login Screen (`/login`).
3. **Admin Authentication**: Login as `Admin` with password `!@#$%open` succeeds.
4. **Backend API Health Check**: `https://loomplanning.santhiprocessing.com/api/system-health` returns `200 OK`.
5. **Data Flow**:
   - Order Management → Loom Planning → Beam Requirements → Main Entry → Runout Monitor functions without error.
6. **Excel & PDF Exports**: Export Excel and PDF generation work properly over HTTPS.

---

**SPU LOOM ERP System — Production Deployment Ready.**  
Domain Target: **`https://loomplanning.santhiprocessing.com`**
