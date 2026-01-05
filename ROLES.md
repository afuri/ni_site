# Roles and Permissions

Moderator = teacher with `is_moderator=true`.

## Public (no auth)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/verify/request`, `POST /auth/verify/confirm`, `POST /auth/password/reset/*`
- Content: `GET /content`, `GET /content/{id}`
- Health: `GET /health`, `/health/ready`, `/health/queues`, `/health/deps`

## Student
- Profile: `GET /auth/me`, `GET/PUT /users/me`
- Auth: `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password/change`
- Attempts (own only): `POST /attempts/start`, `GET /attempts/{id}`, `POST /attempts/{id}/answers`, `POST /attempts/{id}/submit`, `GET /attempts/{id}/result`, `GET /attempts/results/my`
- Uploads: `GET /uploads/{key}` (read-only presign)
- Content: `GET /content`, `GET /content/{id}`

## Teacher
- Teacher-student links: `POST /teacher/students`, `POST /teacher/students/{student_id}/confirm`, `GET /teacher/students`
- Attempts review: `GET /teacher/olympiads/{id}/attempts`, `GET /teacher/attempts/{id}`
- Moderator request: `POST /teacher/moderator/request`
- Profile/Auth/Content/Uploads: same as Student

## Moderator
- Everything from Teacher
- Task bank: `POST /admin/tasks`, `GET /admin/tasks`, `GET /admin/tasks/{id}`, `PUT /admin/tasks/{id}`, `DELETE /admin/tasks/{id}`
- Content management: `GET /admin/content`, `GET /admin/content/{id}`, `POST /admin/content`, `PUT /admin/content/{id}`, `POST /admin/content/{id}/publish`, `POST /admin/content/{id}/unpublish`
- Uploads: `POST /uploads/presign`, `POST /uploads/presign-post`, `GET /uploads/{key}`

## Admin
- Everything from Moderator
- Olympiads: `POST /admin/olympiads`, `GET /admin/olympiads`, `GET /admin/olympiads/{id}`, `PUT /admin/olympiads/{id}`, `DELETE /admin/olympiads/{id}`,
  `POST /admin/olympiads/{id}/tasks`, `GET /admin/olympiads/{id}/tasks`, `GET /admin/olympiads/{id}/tasks/full`,
  `DELETE /admin/olympiads/{id}/tasks/{task_id}`, `POST /admin/olympiads/{id}/publish`
- Users/admin actions: `POST /admin/users/otp`, `PUT /admin/users/{id}`, `PUT /admin/users/{id}/moderator`,
  `POST /admin/users/{id}/temp-password`, `POST /admin/users/{id}/temp-password/generate`
- Audit: `GET /admin/audit-logs`, `GET /admin/audit-logs/export`

## Notes
- Some endpoints enforce ownership/business rules (e.g. attempts access, teacher-student relation).
- Admin role changes and deactivation require OTP confirmation.
