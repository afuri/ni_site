# UI Endpoints (v1)

Base URL: `http://localhost:8000/api/v1`

Auth header:
```
Authorization: Bearer <ACCESS_TOKEN>
```

Error schema (all errors include `request_id`):
```json
{
  "error": {
    "code": "some_error_code",
    "message": "some_error_code",
    "details": {}
  },
  "request_id": "req-..."
}
```

## Roles quick map

Moderator = teacher with `is_moderator=true`.

- Public: auth register/login/verify/reset, content read, health
- Student: profile, auth refresh/logout/change password, attempts (own), uploads GET, content read
- Teacher: student links, attempts review for linked students, moderator request, plus student access
- Moderator: task bank, content management, uploads presign, plus teacher access
- Admin: olympiads management, admin users, audit logs, plus moderator access

## API conventions

Pagination/filtering/sorting rules: `API_CONVENTIONS.md`
Uploads limits/types: `API_CONVENTIONS.md`

## Auth

- `POST /auth/register` — регистрация
  ```json
  {
    "login": "student01",
    "password": "StrongPass1",
    "role": "student",
    "email": "student01@example.com",
    "surname": "Иванов",
    "name": "Иван",
    "father_name": null,
    "country": "Россия",
    "city": "Москва",
    "school": "Школа",
    "class_grade": 7,
    "subject": null
  }
  ```
  Response: `UserRead`
  Пример ответа:
  ```json
  {
    "id": 1,
    "login": "student01",
    "email": "student01@example.com",
    "role": "student",
    "is_active": true,
    "is_email_verified": false,
    "must_change_password": false,
    "is_moderator": false,
    "moderator_requested": false,
    "surname": "Иванов",
    "name": "Иван",
    "father_name": null,
    "country": "Россия",
    "city": "Москва",
    "school": "Школа",
    "class_grade": 7,
    "subject": null
  }
  ```
- `POST /auth/login` — логин
  ```json
  { "login": "student01", "password": "StrongPass1" }
  ```
  Response:
  ```json
  { "access_token": "...", "refresh_token": "...", "token_type": "bearer", "must_change_password": false }
  ```
- `GET /auth/me` — профиль текущего пользователя (`UserRead`)
- `POST /auth/refresh` — обновить токены
  ```json
  { "refresh_token": "..." }
  ```
- `POST /auth/logout` — отозвать refresh
  ```json
  { "refresh_token": "..." }
  ```
- `POST /auth/verify/request` — письмо подтверждения email
  ```json
  { "email": "student01@example.com" }
  ```
- `POST /auth/verify/confirm` — подтвердить email
  ```json
  { "token": "..." }
  ```
- `POST /auth/password/change` — смена пароля
  ```json
  { "current_password": "OldPass1", "new_password": "NewPass123" }
  ```
- `POST /auth/password/reset/request` — запрос сброса
  ```json
  { "email": "student01@example.com" }
  ```
- `POST /auth/password/reset/confirm` — сброс по токену
  ```json
  { "token": "...", "new_password": "NewPass123" }
  ```

## Profile

- `GET /users/me` — получить профиль (`UserRead`)
  Пример ответа:
  ```json
  {
    "id": 2,
    "login": "teacher01",
    "email": "teacher01@example.com",
    "role": "teacher",
    "is_active": true,
    "is_email_verified": true,
    "must_change_password": false,
    "is_moderator": true,
    "moderator_requested": true,
    "surname": "Петров",
    "name": "Петр",
    "father_name": null,
    "country": "Россия",
    "city": "Казань",
    "school": "Лицей",
    "class_grade": null,
    "subject": "math"
  }
  ```
- `PUT /users/me` — обновить профиль
  ```json
  { "surname": "Иванов", "name": "Иван", "city": "Казань" }
  ```

## Attempts (student)

- `POST /attempts/start`
  ```json
  { "olympiad_id": 1 }
  ```
  Response: `AttemptRead`
  Пример ответа:
  ```json
  {
    "id": 10,
    "olympiad_id": 1,
    "user_id": 1,
    "started_at": "2026-01-05T10:00:00Z",
    "deadline_at": "2026-01-05T10:10:00Z",
    "duration_sec": 600,
    "status": "active",
    "score_total": 0,
    "score_max": 1,
    "passed": null,
    "graded_at": null
  }
  ```
- `GET /attempts/{attempt_id}` — попытка + задания + текущие ответы
  Пример ответа (`AttemptView`):
  ```json
  {
    "attempt": {
      "id": 10,
      "olympiad_id": 1,
      "user_id": 1,
      "started_at": "2026-01-05T10:00:00Z",
      "deadline_at": "2026-01-05T10:10:00Z",
      "duration_sec": 600,
      "status": "active",
      "score_total": 0,
      "score_max": 1,
      "passed": null,
      "graded_at": null
    },
    "olympiad_title": "Олимпиада 7-8",
    "tasks": [
      {
        "task_id": 5,
        "title": "2+2",
        "content": "2+2?",
        "task_type": "single_choice",
        "image_key": null,
        "payload": { "options": [{ "id": "a", "text": "4" }, { "id": "b", "text": "5" }] },
        "sort_order": 1,
        "max_score": 1,
        "current_answer": null
      }
    ]
  }
  ```
- `POST /attempts/{attempt_id}/answers`
  ```json
  { "task_id": 10, "answer_payload": { "choice_id": "a" } }
  ```
- `POST /attempts/{attempt_id}/submit` — отправить на проверку
  Пример ответа:
  ```json
  { "status": "submitted" }
  ```
- `GET /attempts/{attempt_id}/result` — результат
  Пример ответа:
  ```json
  {
    "attempt_id": 10,
    "olympiad_id": 1,
    "status": "submitted",
    "score_total": 1,
    "score_max": 1,
    "percent": 100,
    "passed": true,
    "graded_at": "2026-01-05T10:05:00Z"
  }
  ```
- `GET /attempts/results/my` — список результатов текущего ученика
  Пример ответа:
  ```json
  [
    {
      "attempt_id": 10,
      "olympiad_id": 1,
      "status": "submitted",
      "score_total": 1,
      "score_max": 1,
      "percent": 100,
      "passed": true,
      "graded_at": "2026-01-05T10:05:00Z"
    }
  ]
  ```

## Teacher / Students

- `GET /teacher/olympiads/{olympiad_id}/attempts` — попытки по олимпиаде
- `GET /teacher/attempts/{attempt_id}` — просмотр попытки ученика
  Пример ответа (`TeacherAttemptView`):
  ```json
  {
    "attempt": {
      "id": 10,
      "olympiad_id": 1,
      "user_id": 1,
      "started_at": "2026-01-05T10:00:00Z",
      "deadline_at": "2026-01-05T10:10:00Z",
      "duration_sec": 600,
      "status": "submitted",
      "score_total": 1,
      "score_max": 1,
      "passed": true,
      "graded_at": "2026-01-05T10:05:00Z"
    },
    "user": { "id": 1, "email": "student01@example.com", "role": "student", "is_active": true },
    "olympiad_title": "Олимпиада 7-8",
    "tasks": [
      {
        "task_id": 5,
        "title": "2+2",
        "content": "2+2?",
        "task_type": "single_choice",
        "sort_order": 1,
        "max_score": 1,
        "answer_payload": { "choice_id": "a" },
        "updated_at": "2026-01-05T10:03:00Z"
      }
    ]
  }
  ```
- `POST /teacher/moderator/request` — запросить модератора
  Пример ответа:
  ```json
  { "status": "requested" }
  ```
- `POST /teacher/students` — создать/прикрепить ученика
  ```json
  { "attach": { "student_login": "student01" } }
  ```
  или
  ```json
  { "create": { "login": "student02", "password": "StrongPass1", "email": "s2@example.com", "surname": "Иванов", "name": "Иван", "father_name": null, "country": "Россия", "city": "Москва", "school": "Школа", "class_grade": 7 } }
  ```
- `POST /teacher/students/{student_id}/confirm` — подтвердить связь
  Пример ответа:
  ```json
  { "id": 1, "teacher_id": 2, "student_id": 3, "status": "confirmed", "created_at": "2026-01-05T10:00:00Z", "confirmed_at": "2026-01-05T10:02:00Z" }
  ```
- `GET /teacher/students?status=pending|confirmed` — список учеников
  Пример ответа:
  ```json
  [
    { "id": 1, "teacher_id": 2, "student_id": 3, "status": "confirmed", "created_at": "2026-01-05T10:00:00Z", "confirmed_at": "2026-01-05T10:02:00Z" }
  ]
  ```

## Content

- `GET /content` — список опубликованного контента
  - Query: `content_type` (news|article), `limit`, `offset`
- `GET /content/{content_id}` — деталь контента
  Пример ответа (`ContentRead`):
  ```json
  {
    "id": 10,
    "content_type": "article",
    "status": "published",
    "title": "Как готовиться к олимпиаде",
    "body": "Текст статьи...",
    "image_keys": [],
    "author_id": 1,
    "published_by_id": 1,
    "published_at": "2026-01-05T09:00:00Z",
    "created_at": "2026-01-05T08:00:00Z",
    "updated_at": "2026-01-05T09:00:00Z"
  }
  ```
- `POST /admin/content` — создать (admin/moderator)
  ```json
  { "content_type": "article", "title": "Заголовок", "body": "Текст...", "publish": false }
  ```
  Пример ответа (`ContentRead`):
  ```json
  {
    "id": 10,
    "content_type": "article",
    "status": "draft",
    "title": "Заголовок",
    "body": "Текст...",
    "image_keys": [],
    "author_id": 1,
    "published_by_id": null,
    "published_at": null,
    "created_at": "2026-01-05T08:00:00Z",
    "updated_at": "2026-01-05T08:00:00Z"
  }
  ```
- `PUT /admin/content/{content_id}` — обновить
- `DELETE /admin/content/{content_id}` — удалить
- `POST /admin/content/{content_id}/publish?publish=true|false` — публикация

## Admin: Tasks

- `POST /admin/tasks` — создать задание
  ```json
  { "subject": "math", "title": "2+2", "content": "2+2?", "task_type": "single_choice", "payload": { "options": [{"id":"a","text":"4"}], "correct_option_id":"a" } }
  ```
- `GET /admin/tasks` — список
  Пример ответа (`TaskRead[]`):
  ```json
  [
    {
      "id": 5,
      "subject": "math",
      "title": "2+2",
      "content": "2+2?",
      "task_type": "single_choice",
      "image_key": null,
      "payload": { "options": [{ "id": "a", "text": "4" }, { "id": "b", "text": "5" }], "correct_option_id": "a" },
      "created_by_user_id": 1
    }
  ]
  ```
- `GET /admin/tasks/{task_id}` — деталь
  Пример ответа (`TaskRead`):
  ```json
  {
    "id": 5,
    "subject": "math",
    "title": "2+2",
    "content": "2+2?",
    "task_type": "single_choice",
    "image_key": null,
    "payload": { "options": [{ "id": "a", "text": "4" }, { "id": "b", "text": "5" }], "correct_option_id": "a" },
    "created_by_user_id": 1
  }
  ```
- `PUT /admin/tasks/{task_id}` — обновить
- `DELETE /admin/tasks/{task_id}` — удалить

## Admin: Olympiads

- `POST /admin/olympiads` — создать
  ```json
  { "title": "Олимпиада", "description": "Desc", "age_group": "7-8", "attempts_limit": 1, "duration_sec": 600, "available_from": "2026-01-01T00:00:00Z", "available_to": "2026-01-02T00:00:00Z", "pass_percent": 60 }
  ```
- `GET /admin/olympiads?mine=true` — список
  Пример ответа (`OlympiadRead[]`):
  ```json
  [
    {
      "id": 1,
      "title": "Олимпиада 7-8",
      "description": "Desc",
      "scope": "global",
      "age_group": "7-8",
      "attempts_limit": 1,
      "duration_sec": 600,
      "available_from": "2026-01-05T10:00:00Z",
      "available_to": "2026-01-05T12:00:00Z",
      "pass_percent": 60,
      "is_published": true,
      "created_by_user_id": 1
    }
  ]
  ```
- `GET /admin/olympiads/{olympiad_id}` — деталь
  Пример ответа (`OlympiadRead`):
  ```json
  {
    "id": 1,
    "title": "Олимпиада 7-8",
    "description": "Desc",
    "scope": "global",
    "age_group": "7-8",
    "attempts_limit": 1,
    "duration_sec": 600,
    "available_from": "2026-01-05T10:00:00Z",
    "available_to": "2026-01-05T12:00:00Z",
    "pass_percent": 60,
    "is_published": true,
    "created_by_user_id": 1
  }
  ```
- `PUT /admin/olympiads/{olympiad_id}` — обновить
- `DELETE /admin/olympiads/{olympiad_id}` — удалить
- `POST /admin/olympiads/{olympiad_id}/tasks` — добавить задание
  ```json
  { "task_id": 10, "sort_order": 1, "max_score": 1 }
  ```
- `GET /admin/olympiads/{olympiad_id}/tasks` — список заданий
  Пример ответа (`OlympiadTaskRead[]`):
  ```json
  [
    { "id": 1, "olympiad_id": 1, "task_id": 5, "sort_order": 1, "max_score": 1 }
  ]
  ```
- `GET /admin/olympiads/{olympiad_id}/tasks/full` — список + контент
  Пример ответа (`OlympiadTaskFullRead[]`):
  ```json
  [
    {
      "task_id": 5,
      "sort_order": 1,
      "max_score": 1,
      "task": {
        "id": 5,
        "subject": "math",
        "title": "2+2",
        "content": "2+2?",
        "task_type": "single_choice",
        "image_key": null,
        "payload": { "options": [{ "id": "a", "text": "4" }, { "id": "b", "text": "5" }], "correct_option_id": "a" },
        "created_by_user_id": 1
      }
    }
  ]
  ```
- `DELETE /admin/olympiads/{olympiad_id}/tasks/{task_id}` — удалить задание
- `POST /admin/olympiads/{olympiad_id}/publish?publish=true|false` — публикация

## Admin: Users & Audit

- `GET /admin/users` — список пользователей
  - Query: `user_id`, `role`, `is_active`, `is_email_verified`, `must_change_password`, `is_moderator`, `moderator_requested`, `login`, `email`, `surname`, `name`, `father_name`, `country`, `city`, `school`, `class_grade`, `subject`, `limit`, `offset`
  Пример ответа (`UserRead[]`):
  ```json
  [
    {
      "id": 1,
      "login": "student01",
      "email": "student01@example.com",
      "role": "student",
      "is_active": true,
      "is_email_verified": true,
      "must_change_password": false,
      "is_moderator": false,
      "moderator_requested": false,
      "surname": "Ivanov",
      "name": "Ivan",
      "father_name": null,
      "country": "Russia",
      "city": "Moscow",
      "school": "School 1",
      "class_grade": 7,
      "subject": null
    }
  ]
  ```
- `GET /admin/users/{user_id}` — получить пользователя по ID
  Пример ответа (`UserRead`):
  ```json
  {
    "id": 3,
    "login": "student01",
    "email": "student01@example.com",
    "role": "student",
    "is_active": true,
    "is_email_verified": true,
    "must_change_password": false,
    "is_moderator": false,
    "moderator_requested": false,
    "surname": "Ivanov",
    "name": "Ivan",
    "father_name": null,
    "country": "Russia",
    "city": "Moscow",
    "school": "School 1",
    "class_grade": 7,
    "subject": null
  }
  ```
- `POST /admin/users/otp` — получить OTP для критичных действий
  Пример ответа:
  ```json
  { "sent": true, "otp": "123456" }
  ```
- `PUT /admin/users/{user_id}/moderator` — назначить модератора
  ```json
  { "is_moderator": true }
  ```
  Пример ответа (`UserRead`):
  ```json
  {
    "id": 2,
    "login": "teacher01",
    "email": "teacher01@example.com",
    "role": "teacher",
    "is_active": true,
    "is_email_verified": true,
    "must_change_password": false,
    "is_moderator": true,
    "moderator_requested": true,
    "surname": "Petrov",
    "name": "Petr",
    "father_name": null,
    "country": "Russia",
    "city": "Kazan",
    "school": "Lyceum",
    "class_grade": null,
    "subject": "math"
  }
  ```
- `PUT /admin/users/{user_id}` — обновить пользователя (кроме email)
  ```json
  { "login": "newlogin", "city": "Казань", "is_active": true, "admin_otp": "123456" }
  ```
  Пример ответа (`UserRead`):
  ```json
  {
    "id": 3,
    "login": "newlogin",
    "email": "student01@example.com",
    "role": "student",
    "is_active": true,
    "is_email_verified": true,
    "must_change_password": false,
    "is_moderator": false,
    "moderator_requested": false,
    "surname": "Ivanov",
    "name": "Ivan",
    "father_name": null,
    "country": "Russia",
    "city": "Kazan",
    "school": "School 1",
    "class_grade": 7,
    "subject": null
  }
  ```
- `POST /admin/users/{user_id}/temp-password` — задать временный пароль
  ```json
  { "temp_password": "TempPass1" }
  ```
  Пример ответа (`UserRead`):
  ```json
  {
    "id": 3,
    "login": "student01",
    "email": "student01@example.com",
    "role": "student",
    "is_active": true,
    "is_email_verified": true,
    "must_change_password": true,
    "is_moderator": false,
    "moderator_requested": false,
    "surname": "Ivanov",
    "name": "Ivan",
    "father_name": null,
    "country": "Russia",
    "city": "Moscow",
    "school": "School 1",
    "class_grade": 7,
    "subject": null
  }
  ```
- `POST /admin/users/{user_id}/temp-password/generate` — сгенерировать временный пароль
  Пример ответа:
  ```json
  { "temp_password": "TempPass1" }
  ```
- `GET /admin/audit-logs` — список audit логов
  Пример ответа (`AuditLogRead[]`):
  ```json
  [
    {
      "id": 1,
      "user_id": 1,
      "action": "request",
      "method": "POST",
      "path": "/api/v1/admin/tasks",
      "status_code": 201,
      "ip": "127.0.0.1",
      "user_agent": "Mozilla/5.0",
      "request_id": "req-123e4567-e89b-12d3-a456-426614174000",
      "details": { "task_id": 10 },
      "created_at": "2026-01-05T10:00:00Z"
    }
  ]
  ```
- `GET /admin/audit-logs/export` — CSV выгрузка

## Uploads

- `POST /uploads/presign` — presign PUT
  ```json
  { "filename": "photo.jpg", "content_type": "image/jpeg", "prefix": "content" }
  ```
  Пример ответа (`UploadPresignResponse`):
  ```json
  {
    "key": "content/2026/01/05/photo.jpg",
    "upload_url": "https://storage.example.com/bucket",
    "headers": { "Content-Type": "image/jpeg" },
    "public_url": "https://cdn.example.com/content/2026/01/05/photo.jpg",
    "expires_in": 3600
  }
  ```
- `POST /uploads/presign-post` — presign POST (multipart)
  Пример ответа (`UploadPresignPostResponse`):
  ```json
  {
    "key": "tasks/2026/01/05/task.png",
    "upload_url": "https://storage.example.com/bucket",
    "fields": {
      "key": "tasks/2026/01/05/task.png",
      "policy": "base64-policy",
      "signature": "signature"
    },
    "public_url": null,
    "expires_in": 3600,
    "max_size_bytes": 10485760
  }
  ```
- `GET /uploads/{key}` — presign GET
  Пример ответа (`UploadGetResponse`):
  ```json
  { "url": "https://storage.example.com/bucket/content/2026/01/05/photo.jpg", "expires_in": 3600 }
  ```

## Health (not UI flow)

- `GET /health`
  Пример ответа:
  ```json
  { "status": "ok" }
  ```
- `GET /health/ready`
  Пример ответа:
  ```json
  { "status": "ok", "db": true, "read_db": true, "redis": true }
  ```
- `GET /health/queues`
  Пример ответа:
  ```json
  { "queue": "celery", "length": 0 }
  ```
- `GET /health/deps`
  Пример ответа:
  ```json
  {
    "status": "ok",
    "storage": true,
    "email": true,
    "storage_required": true,
    "email_required": false
  }
  ```
