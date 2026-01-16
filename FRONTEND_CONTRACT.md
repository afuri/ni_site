"""
Frontend Contract (v1)

Краткий контракт для фронтенда: ключевые эндпойнты, формы JSON и единый формат ошибок.
Полные примеры payloads и детальные ответы: UI_ENDPOINTS.md.
"""

Base URL: `http://localhost:8000/api/v1`

Auth header:
```
Authorization: Bearer <ACCESS_TOKEN>
```

Error schema (все ошибки включают `request_id`):
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

## Auth

- `POST /auth/register`
  ```json
  {
    "login": "student01",
    "password": "StrongPass1",
    "role": "student",
    "email": "student01@example.com",
    "gender": "male",
    "subscription": 0,
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
- `POST /auth/login`
  ```json
  { "login": "student01", "password": "StrongPass1" }
  ```
  Response:
  ```json
  { "access_token": "...", "refresh_token": "...", "token_type": "bearer", "must_change_password": false }
  ```
- `GET /auth/me` → `UserRead`
- `POST /auth/refresh`
  ```json
  { "refresh_token": "..." }
  ```
- `POST /auth/logout`
  ```json
  { "refresh_token": "..." }
  ```
- `POST /auth/verify/request`
  ```json
  { "email": "student01@example.com" }
  ```
- `POST /auth/verify/confirm`
  ```json
  { "token": "..." }
  ```
- `POST /auth/password/change`
  ```json
  { "current_password": "OldPass1", "new_password": "NewPass123" }
  ```
- `POST /auth/password/reset/request`
  ```json
  { "email": "student01@example.com" }
  ```
- `POST /auth/password/reset/confirm`
  ```json
  { "token": "...", "new_password": "NewPass123" }
  ```

## Profile (student/teacher/moderator/admin)

- `GET /users/me` → `UserRead`
- `PUT /users/me`
  ```json
  { "surname": "Иванов", "name": "Иван", "city": "Казань" }
  ```
  Response: `UserRead`

## Olympiads (student)

- `GET /olympiads` (фильтры/пагинация в `API_CONVENTIONS.md`)
  Response: `list[OlympiadRead]`
- `GET /olympiads/{id}` → `OlympiadRead`

## Attempts (student)

- `POST /attempts/start`
  ```json
  { "olympiad_id": 1 }
  ```
  Response: `AttemptRead`
- `GET /attempts/{attempt_id}` → `AttemptView`
- `POST /attempts/{attempt_id}/answers`
  ```json
  { "task_id": 5, "answer_payload": { "choice_id": "a" } }
  ```
- `POST /attempts/{attempt_id}/submit`
- `GET /attempts/{attempt_id}/result` → `AttemptResult`

## Teacher / Students

- `GET /teacher/students` → `list[TeacherStudentRead]`
- `POST /teacher/students/request`
  ```json
  { "student_id": 1 }
  ```
- `POST /teacher/students/confirm`
  ```json
  { "student_id": 1 }
  ```
- `DELETE /teacher/students/{student_id}`
- `POST /teacher/moderator/request` (teacher → moderator)

## Content (public + moderator/admin)

- `GET /content` (public)
- `GET /content/{id}` (public)
- `POST /content` (moderator/admin)
  ```json
  {
    "content_type": "news",
    "title": "Заголовок",
    "body": "Текст",
    "preview_image_key": null,
    "image_keys": []
  }
  ```
- `PATCH /content/{id}` (moderator/admin)
- `POST /content/{id}/publish` (moderator/admin)
- `DELETE /content/{id}` (moderator/admin)

## Uploads

- `GET /uploads/presign` (student/teacher/moderator/admin)
  Query: `prefix`, `filename`, `content_type`
  Response: `PresignGetResponse`
- `POST /uploads/presign-post` (moderator/admin)
  Query: `prefix`, `filename`, `content_type`, `content_length`
  Response: `PresignPostResponse`

## Admin: Tasks

- `POST /admin/tasks` → `TaskRead`
- `GET /admin/tasks` → `list[TaskRead]`
- `GET /admin/tasks/{id}` → `TaskRead`
- `PATCH /admin/tasks/{id}` → `TaskRead`
- `DELETE /admin/tasks/{id}` → 204

## Admin: Olympiads

- `POST /admin/olympiads` → `OlympiadRead`
- `GET /admin/olympiads` → `list[OlympiadRead]`
- `GET /admin/olympiads/{id}` → `OlympiadRead`
- `PATCH /admin/olympiads/{id}` → `OlympiadRead`
- `POST /admin/olympiads/{id}/publish?publish=true|false`
- `POST /admin/olympiads/{id}/tasks`
  ```json
  { "task_id": 5, "sort_order": 1, "max_score": 1 }
  ```
- `DELETE /admin/olympiads/{id}/tasks/{task_id}`

## Admin: Users

- `GET /admin/users` → `list[UserRead]`
- `PUT /admin/users/{id}` → `UserRead`
- `POST /admin/users/{id}/temp-password`
  ```json
  { "temp_password": "TempPass1" }
  ```

## Admin: Audit

- `GET /admin/audit` → `list[AuditLogRead]`

## Health

- `GET /health/live`
- `GET /health/ready`
- `GET /health/queues`

## Common error codes (non-exhaustive)

- `missing_token`, `invalid_token`, `invalid_credentials`, `email_not_verified`
- `rate_limited`, `forbidden`, `password_change_required`
- `task_not_found`, `task_in_olympiad`, `olympiad_not_found`, `olympiad_age_group_mismatch`
- `attempt_not_found`, `attempt_expired`, `attempt_not_active`
- `content_not_found`, `publish_forbidden`

Details and full examples: `UI_ENDPOINTS.md`
