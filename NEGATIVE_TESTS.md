# API negative tests checklist

## Auth

- Register with weak password -> 422 `weak_password`
- Register with existing login/email -> 409 `login_taken` / `email_taken`
- Login with wrong password -> 401 `invalid_credentials`
- Login with unverified email -> 403 `email_not_verified`
- Verify email with bad token -> 422 `invalid_token`
- Password reset with bad token -> 422 `invalid_token`
- Rate limit on login/register/reset -> 429 `rate_limited`

## Attempts

- Start attempt for non‑existent olympiad -> 404 `olympiad_not_found`
- Start attempt for unpublished olympiad -> 409 `olympiad_not_published`
- Start attempt for out‑of‑window olympiad -> 409 `olympiad_not_available`
- Start attempt when olympiad has no tasks -> 409 `olympiad_has_no_tasks`
- Upsert answer for чужая попытка -> 403 `forbidden`
- Upsert answer after deadline -> 409 `attempt_expired`
- Submit чужую попытку -> 403 `forbidden`
- Get result for чужую попытку -> 403 `forbidden`

## Admin/Olympiads

- Publish invalid availability (available_to <= available_from) -> 422 `invalid_availability`
- Change time rules for published olympiad -> 409 `cannot_change_published_rules`
- Add task to published olympiad -> 409 `cannot_modify_published`
- Delete olympiad as non-admin -> 403 `forbidden`
- Delete non-existent olympiad -> 404 `olympiad_not_found`

## Content

- Create news with image -> 422 `image_not_allowed`
- Create article with body < 100 or > 5000 -> 422 `invalid_body`
- Moderator publish чужой контент -> 403 `forbidden`
- Unpublish as non‑admin -> 403 `forbidden`

## Uploads

- Presign without auth -> 401
- Presign with invalid prefix -> 422 `invalid_prefix`
- Presign with invalid content type -> 422 `unsupported_content_type`

## Health

- Queues health when broker unavailable -> 503
