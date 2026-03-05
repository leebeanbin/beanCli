# Session Management & User System

This document covers JWT sessions, user management, RBAC, rate limits, password policy, and known limitations.

---

## JWT Sessions

### Token format

- Algorithm: **HMAC-SHA256** (`HS256`), signed with `JWT_SECRET` env var
- Expiry: **24 hours** (`exp` claim)
- Payload: `{ sub: username, role: UserRole, iat, exp }`

### Storage locations

| Client | Storage | Path |
|--------|---------|------|
| Web console | `localStorage` | key: `tfsdc_token` |
| CLI | File (mode `0o600`) | `~/.config/beanCli/session.json` |

The CLI session file also stores the token `exp` timestamp; the file is silently discarded when the JWT has expired.

### Session lifecycle

- **Web**: `AuthContext` validates `exp` on mount and redirects to `/auth` if missing or expired. Logout clears the token from `localStorage` and resets React state.
- **CLI**: `loadSession()` reads the file; expired sessions return `null` and the user is prompted to log in again. `clearSession()` deletes the file.

### Why no refresh tokens

Refresh tokens add server-side state (token store / revocation list). For this v1 scope, 24-hour JWTs with re-authentication are the accepted trade-off. See ADR-005.

---

## RBAC Matrix

| Role | State Read | State Write | DDL/DML (dev) | Changes | Approvals | Audit | Users | Admin |
|------|-----------|------------|---------------|---------|-----------|-------|-------|-------|
| `ANALYST` | ✓ | — | — | — | — | — | — | — |
| `MANAGER` | ✓ | ✓ | — | create/execute | approve | read | — | — |
| `DBA` | ✓ | ✓ | ✓ | create/execute | approve/reject | read | **full** | ✓ |
| `SECURITY_ADMIN` | ✓ | — | — | — | — | read | — | — |

- `SECURITY_ADMIN` was previously allowed on `/admin/users` — this was narrowed to `DBA` only (2026-03-05) because user creation/deletion is a privileged DBA operation, not a security-audit operation.
- All authenticated roles can change their own password via `POST /api/v1/auth/change-password`.

---

## Rate Limits

Global rate limit (all endpoints): **60 requests / minute** per IP.

Per-endpoint overrides:

| Endpoint | Limit | Reason |
|----------|-------|--------|
| `POST /api/v1/auth/change-password` | 5 req / hour | Brute-force protection |
| `POST /api/v1/connections/test` | 10 req / min | External DB connect cost |
| `POST /api/v1/connections/execute` | 120 req / min | Higher throughput for CLI |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` are included in 429 responses.

---

## Password Policy

- Minimum length: **8 characters** (enforced on create + change-password)
- Hashing: **bcrypt** with cost factor **12** (`gen_salt('bf', 12)` via pgcrypto)
- Verification: `crypt($input, password_hash)` — timing-safe comparison inside PostgreSQL
- Stored in: `cli_users.password_hash` (never logged — Pino redacts `body.password`, `body.currentPassword`, `body.newPassword`)

---

## Username Policy

- Length: 3–64 characters
- Uniqueness: enforced by `UNIQUE` constraint on `cli_users.username`
- Rename: `PATCH /api/v1/users/:username` with `{ "newUsername": "..." }` (DBA only)
  - Renaming your own account is allowed; the server returns `{ "selfRenamed": true }` and the client must log out (the old JWT subject is now invalid)
  - Collision → HTTP 409 `{ "error": "Username already exists" }`

---

## Known Limitations

| # | Description | Severity |
|---|-------------|----------|
| 1 | No token revocation — stolen JWTs remain valid until expiry (24 h) | Medium |
| 2 | `localStorage` storage in web console is vulnerable to XSS | Medium |
| 3 | No refresh token — users must re-authenticate every 24 hours | Low |
| 4 | Single JWT secret — rotation requires a server restart and invalidates all sessions | Medium |
| 5 | HMAC key rotation (`HMAC_KEY_ROTATION_DAYS = 30`) applies to data signing, not JWT | Low (doc clarity) |
| 6 | CLI session file is user-scoped (0600) but unencrypted on disk | Low |
| 7 | No account lockout after N failed logins (rate limit is IP-based only) | Medium |
