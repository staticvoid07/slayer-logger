# Deploying Slayer Logger

## Prerequisites

- VPS running Ubuntu/Debian (or any Linux distro)
- Docker and Docker Compose installed
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

## 1. Copy the project to your VPS

```bash
scp -r . user@your-vps-ip:~/slayer-logger
```

Or clone from git if you push it to a repo:

```bash
git clone <your-repo-url> ~/slayer-logger
cd ~/slayer-logger
```

## 2. Create your .env file

```bash
cd ~/slayer-logger
cp .env.example .env
nano .env   # set a strong PGPASSWORD
```

## 3. Start the stack

```bash
docker compose up -d --build
```

The app will be available on port **3000**.

## 4. (Recommended) Put Nginx in front

Install Nginx and create `/etc/nginx/sites-available/slayer-logger`:

```nginx
server {
    listen 80;
    server_name your-domain.com;   # or your VPS IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/slayer-logger /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Add HTTPS with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Endpoints

| Method | Path       | Description                        |
|--------|------------|------------------------------------|
| POST   | /webhook   | Receive a slayer event (JSON body) |
| GET    | /          | Web UI — browse and filter events  |

## Useful commands

```bash
# View logs
docker compose logs -f app

# Stop
docker compose down

# Update after code changes
docker compose up -d --build

# Database backup
docker compose exec db pg_dump -U slayer slayer > backup.sql
```
