# ni_site service commands

## Быстрый старт (Docker)

```bash
docker compose up --build
docker compose exec api alembic -c /app/alembic.ini upgrade head
```

- API health: `http://localhost:8000/api/v1/health`
- API readiness: `http://localhost:8000/api/v1/health/ready`

## Локальный запуск (backend)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic -c alembic.ini upgrade head
uvicorn app.main:app --reload
```

## Полезные команды

### Список пользователей

```bash
docker exec -it <pg_container> psql -U postgres -d ni_site \
  -c "SELECT id, login, email, role, is_email_verified, is_moderator FROM users ORDER BY id;"
```

### Вручную подтвердить email

```bash
docker exec -it <pg_container> psql -U postgres -d ni_site \
  -c "UPDATE users SET is_email_verified=true WHERE login='student01';"
```

### Вручную создать admin

```bash
docker exec -it <pg_container> psql -U postgres -d ni_site -c "
  INSERT INTO users (login, email, password_hash, role, is_active, is_email_verified,
                     surname, name, father_name, country, city, school)
  SELECT
    'admin01',
    'admin@mail.ru',
    (SELECT password_hash FROM users WHERE login='student01'),
    'admin',
    true,
    true,
    'Иванов',
    'Иван',
    'Иванович',
    'Россия',
    'Москва',
    'Школа'
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE login='admin01');
"
```

## Примеры curl

### Регистрация пользователя

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "login": "student01",
    "password": "StrongPass1",
    "role": "student",
    "email": "student01@example.com",
    "surname": "Иванов",
    "name": "Иван",
    "father_name": "Иванович",
    "country": "Россия",
    "city": "Москва",
    "school": "Школа",
    "class_grade": 7,
    "subject": "Math"
  }'
```

### Логин (по login)

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"student01","password":"StrongPass1"}'
```

### Получить попытку и ответы

```bash
curl http://localhost:8000/api/v1/attempts/1 \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Сохранить ответ

```bash
curl -X POST http://localhost:8000/api/v1/attempts/1/answers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"task_id": 1, "answer_payload": {"choice_id": "a"}}'
```

### Создать контент (admin/moderator)

```bash
curl -X POST http://localhost:8000/api/v1/admin/content \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"content_type":"news","title":"Новость","body":"Короткая новость","publish":true}'
```

### Удалить олимпиаду (admin)

```bash
curl -X DELETE http://localhost:8000/api/v1/admin/olympiads/1 \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Получить presign URL для загрузки

```bash
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"filename":"photo.jpg","content_type":"image/jpeg","prefix":"content"}'
```
