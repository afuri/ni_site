# Security Review: ni_site_v2

## Scope

Standard source review of the full NI_SITE v2 repository at the authoritative Git revision.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_5cbe285bcf4f423ff4c348816db7570d848536ef8d570415e66f85dfd57cbbef
- Revision: bdeb3294ee704b7dab3c9e25281b53e9b14622a7
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: Static source review only; no live production requests or exploit execution.
- Artifacts reviewed: FastAPI routes/services/repositories/models/schemas, React main and admin applications, Docker Compose and storage deployment documentation, tracked configuration and operational CSV metadata, authentication, authorization, attempt grading, uploads, PDF generation and Markdown rendering

Limitations and exclusions:
- Generated dependencies and binary media were inventoried but not line-reviewed.
- External tunnel reachability and current production configuration were not tested.
- Excluded frontend/node_modules/\*\*: Vendored/generated dependencies; application call sites and manifests were reviewed instead.
- Excluded binary media and fonts: Binary media and font assets are not statically reviewable as source code.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 13 |
| Severity mix | high: 7, medium: 5, low: 1 |
| Confidence mix | high: 12, medium: 1 |
| Coverage | partial |
| Validation mode | Three independent discovery receipts followed by one centralized source-to-sink validation pass. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Internet-facing olympiad platform with student, teacher/moderator and administrator roles, JWT sessions, PostgreSQL/Redis state, and MinIO object storage.

### Assets

- Account credentials and roles
- student PII and educational records
- attempt answers, grades and result confidentiality
- task-bank correct answers and competition integrity
- diplomas and teacher certificates
- deployment secrets

### Trust Boundaries

- Browser to FastAPI API
- JWT/refresh tokens to database and Redis session state
- FastAPI to MinIO object storage
- moderator-authored content to student/admin browser rendering
- repository and deployment configuration to production

### Attacker Capabilities

- Unauthenticated Internet requests
- authenticated student requests
- malicious or compromised moderator account
- compromised administrator access token
- repository or source-artifact read access

### Security Objectives

- Enforce role and ownership boundaries
- protect participant privacy and private artifacts
- preserve grading and task-bank integrity
- prevent browser/server injection and resource exhaustion
- invalidate compromised sessions and keep secrets out of source

### Assumptions

- Documented Compose/nginx production-style storage path may reflect deployed configuration.
- Moderators are less trusted than administrators as stated in codex.md.
- Tracked repository files may be distributed through clones, archives, or CI artifacts.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Any administrator can replace another administrator's password without OTP](#finding-1) | high | high | inline below |
| [Tracked CSV exports expose participant personal data](#finding-2) | high | high | inline below |
| [Anonymous bucket reads bypass diploma and certificate authorization](#finding-3) | high | high | inline below |
| [Markdown link validation permits stored script URLs](#finding-4) | high | high | inline below |
| [Promotion to administrator bypasses the configured OTP control](#finding-5) | high | high | inline below |
| [Production-style administrator credentials are committed in plaintext](#finding-6) | high | medium | inline below |
| [Moderators can read and alter every task, including live olympiad tasks](#finding-7) | high | high | inline below |
| [Students receive per-task correctness after results release](#finding-8) | medium | high | inline below |
| [Legacy presigned PUT uploads omit the configured size limit](#finding-9) | medium | high | inline below |
| [CSV exports preserve formulas from attacker-controlled fields](#finding-10) | medium | high | inline below |
| [Password changes leave previously issued refresh tokens usable](#finding-11) | medium | high | inline below |
| [Task image URLs enable stored SSRF during PDF export](#finding-12) | medium | high | inline below |
| [Password-reset responses disclose registered email addresses](#finding-13) | low | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Any administrator can replace another administrator's password without OTP

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity is lower if every administrator is intentionally trusted to recover every peer administrator without step-up. |
| Category | authorization |
| CWE | CWE-862 |
| Affected lines | backend/app/api/v1/admin_users.py:503-526, backend/app/api/v1/admin_users.py:567-586, backend/app/api/v1/admin_users.py:420-430 |

#### Summary

Temporary-password endpoints accept any admin actor, load the target solely by user ID, and reset even another administrator without the target-aware super-admin and OTP checks used by the general update route.

#### Validation

Validated by direct source inspection. Counterevidence: Severity is lower if every administrator is intentionally trusted to recover every peer administrator without step-up. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/admin_users.py:503-526, backend/app/api/v1/admin_users.py:567-586, backend/app/api/v1/admin_users.py:420-430, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — Only an already authenticated administrator or service token can reach the route; refresh tokens are revoked and the action is audited.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

For administrator targets, require the configured super-admin plus fresh purpose- and target-bound OTP before mutation; prefer out-of-band recovery and avoid returning admin passwords in API responses.

<a id="finding-2"></a>

### [2] Tracked CSV exports expose participant personal data

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity is lower only if all rows are demonstrably synthetic or intentionally public with valid consent. |
| Category | privacy |
| CWE | CWE-359 |
| Affected lines | emails_final.csv:1-238, users_geo_main.csv:1-15357, inf_final_attempts.csv:1-9 |

#### Summary

Three tracked exports contain 237 email rows, more than 15,000 user/location/school mappings, and attempt rows with names, gender, grade, timestamps and scores.

#### Validation

Validated by direct source inspection. Counterevidence: Severity is lower only if all rows are demonstrably synthetic or intentionally public with valid consent. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at emails_final.csv:1-238, users_geo_main.csv:1-15357, inf_final_attempts.csv:1-9, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — Repository access is required; no consent or anonymization evidence was found.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Remove operational datasets from the repository and history, assess incident obligations, move them to access-controlled storage, replace fixtures with synthetic data, and add PII pre-commit scanning.

<a id="finding-3"></a>

### [3] Anonymous bucket reads bypass diploma and certificate authorization

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if production does not expose `/storage/` or the bucket is private there. |
| Category | storage |
| CWE | CWE-200 |
| Affected lines | docker-compose.yml:47-52, backend/app/api/v1/attempts.py:293-317, backend/app/api/v1/teacher.py:192-223 |

#### Summary

Compose grants anonymous download on the entire `ni-site` bucket while diplomas and teacher certificates use predictable identity-derived keys and documented deployment exposes the bucket through `/storage/`.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if production does not expose `/storage/` or the bucket is private there. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at docker-compose.yml:47-52, backend/app/api/v1/attempts.py:293-317, backend/app/api/v1/teacher.py:192-223, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — MinIO binds to localhost; Internet exposure depends on the documented reverse proxy and anonymous policy being active.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Make private artifacts private, split public assets into a separate bucket, remove anonymous download, issue short-lived presigned GET URLs only after authorization, and use opaque stored object keys.

<a id="finding-4"></a>

### [4] Markdown link validation permits stored script URLs

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if a strict CSP blocks script URLs and all affected content writers are fully trusted. |
| Category | xss |
| CWE | CWE-79 |
| Affected lines | frontend/apps/main/src/utils/markdown.ts:24-35, frontend/apps/main/src/pages/OlympiadPage.tsx:822, backend/app/api/v1/admin_tasks.py:33-39 |

#### Summary

The custom renderers reject only strings beginning exactly with `javascript:`; internal ASCII tab/newline controls can survive the regex check and be normalized by the browser URL parser before a generated anchor is inserted with `dangerouslySetInnerHTML`.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if a strict CSP blocks script URLs and all affected content writers are fully trusted. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at frontend/apps/main/src/utils/markdown.ts:24-35, frontend/apps/main/src/pages/OlympiadPage.tsx:822, backend/app/api/v1/admin_tasks.py:33-39, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — Raw HTML is escaped, exact javascript: is blocked, and victim interaction is required.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Replace custom Markdown with a maintained renderer plus sanitizer; parse destinations after rejecting C0 controls and allow only explicit safe schemes/relative URLs. Centralize the renderer and add CSP and regression tests.

<a id="finding-5"></a>

### [5] Promotion to administrator bypasses the configured OTP control

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if OTP is not intended to protect administrative role grants. |
| Category | authentication |
| CWE | CWE-862 |
| Affected lines | backend/app/api/v1/admin_users.py:116-119, backend/app/api/v1/admin_users.py:392-430 |

#### Summary

`_requires_admin_otp` checks the target's current role, so promoting a student or teacher to admin skips OTP even though the patch grants administrative privilege.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if OTP is not intended to protect administrative role grants. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/admin_users.py:116-119, backend/app/api/v1/admin_users.py:392-430, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — The caller must already possess an admin access token; the change is audited.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Base step-up decisions on the requested transition: require a fresh OTP and super-admin authority for every role change into or out of admin, and enforce the single-admin invariant transactionally.

<a id="finding-6"></a>

### [6] Production-style administrator credentials are committed in plaintext

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | medium |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity drops if the tunnel is gone and every exposed credential has been rotated. |
| Category | secrets |
| CWE | CWE-798 |
| Affected lines | maintest.md:6-9, backend/.env:71 |

#### Summary

`maintest.md` publishes an administrator login and password next to a public Cloudflare tunnel; the tracked `backend/.env` also contains a non-empty administrator password.

#### Validation

Validated by direct source inspection. Counterevidence: Severity drops if the tunnel is gone and every exposed credential has been rotated. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at maintest.md:6-9, backend/.env:71, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — The tunnel may be temporary or the password may already have been rotated; reachability was not tested.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Rotate the administrator password, revoke active sessions, disable obsolete tunnels, remove secrets from current files and Git history, and distribute test credentials through an approved secret channel.

<a id="finding-7"></a>

### [7] Moderators can read and alter every task, including live olympiad tasks

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if product policy intentionally grants moderators full task-bank administration and immutable grading snapshots exist elsewhere. |
| Category | authorization |
| CWE | CWE-862 |
| Affected lines | backend/app/api/v1/admin_tasks.py:98-137, backend/app/services/tasks.py:30-51, codex.md:49-52 |

#### Summary

All task-bank list/read/update/delete routes accept moderators, and updates select only by task ID without creator ownership or publication-state checks.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if product policy intentionally grants moderators full task-bank administration and immutable grading snapshots exist elsewhere. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/admin_tasks.py:98-137, backend/app/services/tasks.py:30-51, codex.md:49-52, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — Deleting referenced tasks may fail on a foreign key, but reads and updates remain permitted.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Restrict list/read/update/delete to administrators or enforce creator ownership; make tasks attached to published/completed olympiads immutable and grade against versioned snapshots.

<a id="finding-8"></a>

### [8] Students receive per-task correctness after results release

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if tasks are guaranteed never to be reused and policy is changed explicitly. |
| Category | privacy |
| CWE | CWE-200 |
| Affected lines | backend/app/api/v1/attempts.py:120-143, codex.md:47-52 |

#### Summary

The student attempt response serializes `grade.is_correct` when `results_released` is true, contradicting the explicit rule that students never see correctness per task.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if tasks are guaranteed never to be reused and policy is changed explicitly. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/attempts.py:120-143, codex.md:47-52, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — Before release the field is null and canonical correct-answer payload fields are removed.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Remove `is_correct` from every student response regardless of release state and expose it only through separately authorized teacher/admin review schemas.

<a id="finding-9"></a>

### [9] Legacy presigned PUT uploads omit the configured size limit

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity rises if storage has no external quota or billing/availability impact is large. |
| Category | availability |
| CWE | CWE-770 |
| Affected lines | backend/app/api/v1/uploads.py:93-129, backend/app/core/storage.py:142-166, backend/app/core/storage.py:169-180 |

#### Summary

The active moderator upload path signs PUT with content type but no content-length bound, while the separate POST path demonstrates the intended `content-length-range` control.

#### Validation

Validated by direct source inspection. Counterevidence: Severity rises if storage has no external quota or billing/availability impact is large. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/uploads.py:93-129, backend/app/core/storage.py:142-166, backend/app/core/storage.py:169-180, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — Only administrators and moderators can obtain URLs; prefixes and claimed MIME types are constrained.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Remove the PUT endpoint and migrate callers to bounded POST policies, or enforce provider-supported size/checksum controls; add quotas, rate limits, lifecycle cleanup, and server-side content validation.

<a id="finding-10"></a>

### [10] CSV exports preserve formulas from attacker-controlled fields

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity falls if exported files are never opened in formula-evaluating software or imports force all cells to text. |
| Category | injection |
| CWE | CWE-1236 |
| Affected lines | frontend/apps/admin/src/pages/UsersPage.tsx:61-68, frontend/apps/admin/src/pages/UsersPage.tsx:95-119, backend/app/api/v1/admin_audit.py:86-118 |

#### Summary

User/result export helpers quote delimiters but do not neutralize leading formula markers; the audit export likewise writes attacker-controlled User-Agent and path values through `csv.writer`.

#### Validation

Validated by direct source inspection. Counterevidence: Severity falls if exported files are never opened in formula-evaluating software or imports force all cells to text. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at frontend/apps/admin/src/pages/UsersPage.tsx:61-68, frontend/apps/admin/src/pages/UsersPage.tsx:95-119, backend/app/api/v1/admin_audit.py:86-118, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — Plain-text viewers are unaffected and exploitation depends on spreadsheet behavior.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Apply one shared spreadsheet-cell sanitizer before CSV quoting, forcing values beginning with `=`, `+`, `-`, `@`, tab, or carriage return to text, with regression tests across every export.

<a id="finding-11"></a>

### [11] Password changes leave previously issued refresh tokens usable

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity rises where refresh-token theft is likely or the lifetime exceeds the current 30-day default. |
| Category | session |
| CWE | CWE-613 |
| Affected lines | backend/app/api/v1/auth.py:224-262, backend/app/services/auth.py:134-175 |

#### Summary

The authenticated password-change route updates only the password hash; it does not revoke refresh-token records, which remain valid and rotatable for the configured lifetime.

#### Validation

Validated by direct source inspection. Counterevidence: Severity rises where refresh-token theft is likely or the lifetime exceeds the current 30-day default. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/api/v1/auth.py:224-262, backend/app/services/auth.py:134-175, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — The attacker must already possess a valid refresh token; rotation revokes the specific token when first used.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Atomically revoke all refresh tokens on every successful password change, optionally issue one replacement session for the current device, and consider a user-level session/password version.

<a id="finding-12"></a>

### [12] Task image URLs enable stored SSRF during PDF export

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity rises if moderators can directly trigger export or internal response data can be exfiltrated reliably. |
| Category | ssrf |
| CWE | CWE-918 |
| Affected lines | backend/app/schemas/tasks.py:14-20, backend/app/services/olympiad_pdf.py:146-154, backend/app/api/v1/admin_olympiads.py:387-410 |

#### Summary

Task schemas accept arbitrary `image_key` strings; PDF export treats stored http(s) values as direct destinations and calls `urlopen(...).read()` without host, redirect, address-range, or response-size validation.

#### Validation

Validated by direct source inspection. Counterevidence: Severity rises if moderators can directly trigger export or internal response data can be exfiltrated reliably. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/schemas/tasks.py:14-20, backend/app/services/olympiad_pdf.py:146-154, backend/app/api/v1/admin_olympiads.py:387-410, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — The export trigger is admin-only, exceptions are swallowed, and fetched bytes must decode as an image for direct PDF inclusion.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Accept only canonical object-store keys and fetch through the storage client. If remote images are required, allowlist hosts, reject private/link-local/loopback ranges on every redirect, and enforce byte/time limits.

<a id="finding-13"></a>

### [13] Password-reset responses disclose registered email addresses

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Validated by direct source inspection. Counterevidence: Severity rises if registration membership is highly sensitive or rate limiting is unavailable. |
| Category | privacy |
| CWE | CWE-204 |
| Affected lines | backend/app/services/auth.py:241-245, backend/app/api/v1/auth.py:265-294 |

#### Summary

The reset service raises `USER_NOT_FOUND` for an absent email and the public route maps it to a distinct HTTP 404 while existing accounts receive 200.

#### Validation

Validated by direct source inspection. Counterevidence: Severity rises if registration membership is highly sensitive or rate limiting is unavailable. Validation details were not recorded separately.

Validation method: Independent source-to-sink review

#### Dataflow

The canonical finding records the affected path at backend/app/services/auth.py:241-245, backend/app/api/v1/auth.py:265-294, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Low** — Per-IP-and-email Redis rate limiting slows enumeration, though distributed sources remain possible.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Return the same status, body, and similar timing for existing and nonexistent accounts while only sending a token for eligible existing users; retain rate limiting and monitoring.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Authentication, password recovery and token lifecycle | account security | Reported | No additional canonical notes were recorded. |
| Administrator, moderator, teacher and student authorization | privilege boundaries | Reported | No additional canonical notes were recorded. |
| Attempt ownership, answers, grading and result disclosure | competition integrity | Reported | No additional canonical notes were recorded. |
| MinIO storage, uploads, diplomas and certificates | privacy and availability | Reported | No additional canonical notes were recorded. |
| Markdown and browser rendering | stored XSS | Reported | No additional canonical notes were recorded. |
| CSV exports and tracked operational data | privacy and client-side injection | Reported | No additional canonical notes were recorded. |
| SQLAlchemy query construction and common IDOR paths | injection and tenant isolation | No issue found | No additional canonical notes were recorded. |
| Compose, reverse proxy documentation and operational scripts | configuration exposure | Reported | No additional canonical notes were recorded. |

## Open Questions And Follow Up

- Are the committed administrator credentials still valid on any reachable environment?
- Is the production MinIO bucket currently anonymous and exposed through /storage/?
- Should all published olympiads remain directly startable when they belong to an active assignment pool?
- Current tunnel reachability, credential validity, deployed bucket policy and reverse proxy state require authorized runtime verification.
  - Follow-up prompt: Review deferred unit runtime-production-state and close its stated proof gap. Paths: maintest.md, docker-compose.yml, updates.md.
- Service-token scope and direct-start behavior for pool olympiads require product-owner intent before classification.
  - Follow-up prompt: Review deferred unit low-confidence-business-rules and close its stated proof gap. Paths: backend/app/api/v1/admin_users.py, backend/app/services/attempts.py, backend/app/services/olympiad_pools.py.
