# Развёртывание на Ubuntu + Docker (https://www.nevsky-integral.ru)

Ниже пошаговая инструкция для сервера `root@89.111.175.57`.

## 0) DNS

Убедитесь, что в DNS есть A‑записи:

- `nevsky-integral.ru` -> `89.111.175.57`
- `www.nevsky-integral.ru` -> `89.111.175.57`

## 1) Подключение к серверу

```bash
ssh root@89.111.175.57
```

## 2) Базовые пакеты и сервисы

```bash
apt update
apt install -y git curl nginx
apt install -y docker.io docker-compose-plugin
systemctl enable --now docker
```

Опционально firewall:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

## 3) Клонирование проекта

```bash
mkdir -p /opt
cd /opt
git clone <URL_РЕПОЗИТОРИЯ> ni_site
cd /opt/ni_site
```

> Замените `<URL_РЕПОЗИТОРИЯ>` на ваш Git URL (HTTPS/SSH).

## 4) Продакшн‑настройки Docker Compose

Откройте `docker-compose.yml` и замените dev‑значения на продакшн:

```bash
nano /opt/ni_site/docker-compose.yml
```

Рекомендуется:
- выставить `ENV=prod` и `LOG_FORMAT=json` для `api` и `worker`.
- задать безопасные `JWT_SECRET`, `SMTP_PASSWORD`, `STORAGE_*` и пр.
- привязать сервисы к localhost там, где нет внешнего доступа.

Примерно так (схематично):

```yaml
services:
  api:
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      ENV: "prod"
      LOG_FORMAT: "json"
      EMAIL_BASE_URL: "https://www.nevsky-integral.ru"
      JWT_SECRET: "<strong_secret>"
      # остальные секреты и настройки...

  db:
    ports:
      - "127.0.0.1:5432:5432"
```

## 5) Запуск контейнеров

```bash
docker compose up -d --build
```

Проверьте состояние:

```bash
docker compose ps
```

## 6) Миграции

```bash
docker compose exec api alembic -c /app/alembic.ini upgrade head
```

Если нужно загрузить список школ из CSV:

```bash
docker compose exec api python /app/scripts/load_school.py --truncate
```

## 7) Сборка фронтенда

Устанавливаем Node.js (если нет):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Сборка:

```bash
cd /opt/ni_site/frontend
npm ci
npm run build:app
npm run build:admin
```

Размещение статики (основной сайт + админка):

```bash
mkdir -p /var/www/nevsky-integral
rsync -a --delete /opt/ni_site/frontend/apps/main/dist/ /var/www/nevsky-integral/
rsync -a --delete /opt/ni_site/frontend/apps/admin/dist/ /var/www/nevsky-integral/admin/
```

Если используете документы PDF на главной, убедитесь, что они в:

```
/opt/ni_site/frontend/apps/main/public/docs/
```

и пересоберите фронт.

## 8) Nginx (SSL + прокси на API)

Создайте конфиг:

```bash
nano /etc/nginx/sites-available/nevsky-integral
```

Содержимое:

```nginx
server {
  listen 80;
  server_name nevsky-integral.ru www.nevsky-integral.ru;

  root /var/www/nevsky-integral;
  index index.html;

  location /api/v1/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
    proxy_connect_timeout 5s;
    client_max_body_size 10m;
  }

  location /admin/ {
    try_files $uri /admin/index.html;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

Активируйте сайт и перезапустите nginx:

```bash
ln -s /etc/nginx/sites-available/nevsky-integral /etc/nginx/sites-enabled/nevsky-integral
nginx -t
systemctl reload nginx
```

## 9) SSL (Let’s Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d nevsky-integral.ru -d www.nevsky-integral.ru
```

Проверка автообновления:

```bash
systemctl status certbot.timer
```

## 10) Проверка

- `https://www.nevsky-integral.ru/` — фронт
- `https://www.nevsky-integral.ru/admin` — админка
- `https://www.nevsky-integral.ru/api/v1/health` — API

## 11) Обновление проекта

```bash
cd /opt/ni_site
git pull

docker compose up -d --build

docker compose exec api alembic -c /app/alembic.ini upgrade head

cd /opt/ni_site/frontend
npm ci
npm run build:app
npm run build:admin
rsync -a --delete /opt/ni_site/frontend/apps/main/dist/ /var/www/nevsky-integral/
rsync -a --delete /opt/ni_site/frontend/apps/admin/dist/ /var/www/nevsky-integral/admin/
```

---

## Принятые решения

- Nginx на хосте для TLS и отдачи статики.
- MinIO остаётся в Docker Compose.
- Админка остаётся на `/admin` без отдельного домена.
