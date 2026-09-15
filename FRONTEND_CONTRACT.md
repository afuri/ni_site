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
    "region_id": 77,
    "school_id": 12345,
    "school_not_found": false,
    "class_grade": 7,
    "subject": null
  }
  ```
  Response: `UserRead`

  Если школы нет в справочнике, передаются `school_id: null` и
  `school_not_found: true`. Для student с `class_grade: 0` школа не требуется;
  достаточно `region_id`. Клиент не может передавать `school_status` или `coins`.
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
  { "surname": "Иванов", "name": "Иван", "region_id": 16, "school_id": 6789 }
  ```
  Response: `UserRead`

  Пользователь может изменить собственные `region_id`/`school_id`, даже если
  текущий `school_status=selected`. Учитель по-прежнему не может изменить
  подтверждённую географию ученика; администратор может сделать это через
  `/admin/users/{id}`.

## School directory

- `GET /lookup/regions?query=&limit=100` →
  `list[{id,name,country_code,is_other}]`
- `GET /lookup/schools?region_id=77&query=лицей&limit=20` →
  `list[{id,short_name,full_name,city}]`
- `GET /lookup/cities` — deprecated, не использовать в новых формах.

Поиск школы начинается с двух символов, всегда ограничен `region_id` и не
возвращает адрес или административные признаки школы.

## School submissions

- `GET /users/me/school-submission` → последняя заявка или `null`
- `POST /users/me/school-submissions` → создать заявку пользователя без школы
  ```json
  {
    "city_name": "Москва",
    "school_short_name": "Школа № 1",
    "school_full_name": null,
    "address": null,
    "url": null,
    "email": null
  }
  ```

Статусы пользователя: `selected`, `missing`, `submission_pending`,
`submission_rejected`, `not_required`. Новая попытка доступна для `selected`,
`submission_pending`, `not_required`; диплом — только для `selected` и
`not_required`.

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

- `GET /admin/users` → `list[UserRead]`; поддерживаются `region_id`, `school_id`,
  `school_status` и канонические строковые фильтры региона/города/школы
- `PUT /admin/users/{id}` → `UserRead`; admin может менять `region_id` и `school_id`
- `POST /admin/users/{id}/temp-password`
  ```json
  { "temp_password": "TempPass1" }
  ```

## Admin: Schools and submissions

- `GET /admin/schools/summary` → `{ "total_count": 54517 }`
- `GET /admin/schools` → страница школ; фильтры `region_id`, `city_id`, `query`,
  `is_active`, `is_sirius`, `is_consortium`, `is_peterson`, `is_partner`,
  `is_platform`, `limit`, `offset`
- `GET /admin/schools/cities?region_id=...`
- `POST /admin/schools`, `PATCH /admin/schools/{id}`
- `GET /admin/school-submissions?status=pending|approved|rejected`
- `POST /admin/school-submissions/{id}/duplicate-candidates`
- `POST /admin/school-submissions/{id}/approve`
- `POST /admin/school-submissions/{id}/reject`

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
- `region_not_found`, `region_inactive`, `school_not_found`, `school_inactive`
- `school_region_mismatch`, `school_profile_required`, `school_profile_locked`
- `school_submission_exists`, `school_submission_not_found`, `school_submission_not_pending`
- `diploma_school_pending`

Details and full examples: `UI_ENDPOINTS.md`
