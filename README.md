# ni_site
Проект сайта Невский Интеграл

backend/
  app/
    main.py
    api/
      v1/
        router.py
        health.py
        auth.py
        olympiads.py
        attempts.py
        teacher.py
    core/
      config.py
      security.py
      deps.py
      logging.py
    db/
      session.py
      base.py
    models/
      user.py
      olympiad.py
      attempt.py
    schemas/
      auth.py
      user.py
      olympiad.py
      attempt.py
    repos/
      users.py
      olympiads.py
      attempts.py
    services/
      auth.py
      olympiads.py
      attempts.py
  alembic/
  alembic.ini
  requirements.txt
  Dockerfile


### достаем teacher token

curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher1@example.com","password":"StrongPass123"}'

### Создаем ученика

curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@example.com","password":"StrongPass123","role":"student"}'

#### Достаем токен ученика

curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@example.com","password":"StrongPass123"}'

### Токен ученика

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NjY5MCwiZXhwIjoxNzY3MjU4NDkwfQ.8RjMrBL492HJ2PLZu8j45yAjiz6eUZ2vzOvnSFwCdLU

### Проверяем доступ к попытке

curl -X POST http://localhost:8000/api/v1/attempts/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NjY5MCwiZXhwIjoxNzY3MjU4NDkwfQ.8RjMrBL492HJ2PLZu8j45yAjiz6eUZ2vzOvnSFwCdLU" \
  -d '{"olympiad_id": 1}'

### Получить попытку с заданиями и текущими ответами
curl http://localhost:8000/api/v1/attempts/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NjY5MCwiZXhwIjoxNzY3MjU4NDkwfQ.8RjMrBL492HJ2PLZu8j45yAjiz6eUZ2vzOvnSFwCdLU"

### Сохранить ответ (upsert)
curl -X POST http://localhost:8000/api/v1/attempts/1/answers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NjY5MCwiZXhwIjoxNzY3MjU4NDkwfQ.8RjMrBL492HJ2PLZu8j45yAjiz6eUZ2vzOvnSFwCdLU" \
  -d '{"task_id": 1, "answer_text": "4"}'

### Submit
curl -X POST http://localhost:8000/api/v1/attempts/1/submit \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NjY5MCwiZXhwIjoxNzY3MjU4NDkwfQ.8RjMrBL492HJ2PLZu8j45yAjiz6eUZ2vzOvnSFwCdLU"

###  Под учителем: список попыток
curl http://localhost:8000/api/v1/teacher/olympiads/1/attempts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI1NzA0NSwiZXhwIjoxNzY3MjU4ODQ1fQ.3LQJVSFLzOyceqjNJ1nCCrzxSQY03AeBPl3cQpWI9x8"


### Учитель: список попыток с email
curl http://localhost:8000/api/v1/teacher/olympiads/1/attempts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI2NzQ5NiwiZXhwIjoxNzY3MjY5Mjk2fQ.xkq36DXp62mvpZfUyJwBgWGNDVRNP58LK9VsUgzOVQ0"

###  Учитель: открыть попытку для проверки
curl http://localhost:8000/api/v1/teacher/attempts/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NzI2NzQ5NiwiZXhwIjoxNzY3MjY5Mjk2fQ.xkq36DXp62mvpZfUyJwBgWGNDVRNP58LK9VsUgzOVQ0"


Ожидаемо: вернётся user (email/role) + tasks с answer_text.
Пример: 

```bash
{"attempt":{"id":1,"olympiad_id":1,"user_id":2,"started_at":"2026-01-01T08:39:23.464797Z","deadline_at":"2026-01-01T09:09:23.464797Z","duration_sec":1800,"status":"submitted"},"user":{"id":2,"email":"student1@example.com","role":"student","is_active":true},"olympiad_title":"Невский интеграл — тренировка 1","tasks":[{"task_id":1,"prompt":"2+2=?","answer_max_len":20,"sort_order":1,"answer_text":"3","updated_at":"2026-01-01T08:41:22.786765Z"}]}% 
```


### Скрипт для проверки rate limit.
Что делает скрипт:
Отправляет 25 запросов к эндпоинту POST /api/v1/attempts/{attempt_id}/answers (лимит — 20 за 10 секунд)
Показывает статус каждого запроса и заголовки rate limit
Подсчитывает успешные (200), заблокированные (429) и другие ошибки
Проверяет восстановление лимита после ожидания 11 секунд
Использование:

```bash
ni_site/backend./test_rate_limit.sh 'YOUR_TOKEN' 1 1
```

Ответ

```bash
=== Тест Rate Limit для сохранения ответов ===
Эндпоинт: http://localhost:8000/api/v1/attempts/1/answers
Attempt ID: 1
Task ID: 1
Лимит: 20 запросов за 10 секунд

Отправка 25 запросов...

[1] Status: 409
[2] Status: 409
[3] Status: 409
[4] Status: 409
[5] Status: 409
[6] Status: 409
[7] Status: 409
[8] Status: 409
[9] Status: 409
[10] Status: 409
[11] Status: 409
[12] Status: 409
[13] Status: 409
[14] Status: 409
[15] Status: 409
[16] Status: 409
[17] Status: 409
[18] Status: 409
[19] Status: 409
[20] Status: 409
[21] Status: 429 (RATE LIMITED) | Retry-After: s
[22] Status: 429 (RATE LIMITED) | Retry-After: s
[23] Status: 429 (RATE LIMITED) | Retry-After: s
[24] Status: 429 (RATE LIMITED) | Retry-After: s
[25] Status: 429 (RATE LIMITED) | Retry-After: s

=== Результаты ===
Всего запросов: 25
Успешных (200): 0
Rate Limited (429): 5
Ошибок (другие): 20
Время выполнения: 3 секунд

✓ Rate limit работает корректно!
   Запросы после лимита (20) были заблокированы.

=== Проверка восстановления лимита ===
Ожидание 11 секунд для сброса окна rate limit...
Отправка тестового запроса после ожидания...
⚠ Запрос вернул статус: 409
```