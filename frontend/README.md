## 6. Frontend

Чтобы родителям и детям было приятно этим пользоваться:

- **Вариант 1 (современный SPA):**
    
    - `React` + `TypeScript`.
    - UI-библиотека: `MUI`, `Ant Design` или `Chakra UI`.
    - Обмен данными: REST по HTTPS (можно при желании GraphQL).
        
- **Вариант 2 (проще, но тоже рабочий):**
    
    - Server-side рендеринг: `Jinja2` + классический HTML/CSS + немного JS.
    - Для онлайн-теста можно добавить легкий Vue/React только для страниц с заданиями.
        

С учётом 10k одновременных пользователей я бы делал отдельный SPA, статически отдаваемый с CDN / object storage, а backend только как API.

---

## 7. Таймеры, защита от читерства и корректность

### Таймеры и ограничение по времени

- Таймер на клиенте (JS), но **истина на стороне сервера**:
    
    - При старте попытки — записываем `started_at`, `duration`, `deadline` в БД/Redis.
    - При каждом сохранении ответа сервер проверяет, не истекло ли время.
    - Можно хранить «снимок» в Redis, а по завершению/истечении — фиксировать попытку в PostgreSQL.

---

## Frontend implementation layout (React SPA)

- `apps/main`: guest + student + teacher + moderator experience
- `apps/admin`: admin-only application
- `packages/ui`, `packages/api`, `packages/utils`: shared code across apps
- Workspace root: `frontend/package.json` (npm workspaces)

Local dev:
```
npm --workspace @ni/app-main run dev
npm --workspace @ni/app-admin run dev
```
