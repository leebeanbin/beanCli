# BeanCLI API Load Test Report

> Generated: 2026-03-05 05:07:15 UTC  
> Tool: [autocannon](https://github.com/mcollina/autocannon)  
> Environment: Node.js v25.4.0, macOS (Darwin)  
> Server: Fastify (mocked DB — pure routing throughput)  

---

## Summary

| Suite | Scenarios | Avg Req/s | Best Req/s | Worst p99 (ms) |
|-------|:---------:|----------:|----------:|---------------:|
| **auth** | 7 | 3833 | 15389 | 406.0 |
| **data** | 11 | 8217 | 13183 | 899.0 |

---

## Suite: `auth`

_Run at: 2026-03-05T02:44:26.341Z_

| # | Endpoint | c | Req/s avg | p50 ms | p99 ms | p99.9 ms | Err |
|---|----------|:-:|----------:|-------:|-------:|---------:|:---:|
| 1 | `GET /auth/setup-status (c=50)` | 50 | **15389** | 2.0 | 8.0 | 40.0 | ✓ |
| 2 | `POST /auth/login (c=5,  bcrypt=200ms)` | 5 | **24** | 202.0 | 206.0 | 206.0 | ✓ |
| 3 | `POST /auth/login (c=20, bcrypt=200ms)` | 20 | **96** | 203.0 | 208.0 | 209.0 | ✓ |
| 4 | `POST /auth/login (c=50, bcrypt=200ms)` | 50 | **230** | 204.0 | 388.0 | 388.0 | ✓ |
| 5 | `POST /auth/change-password (c=5, 2×bcrypt)` | 5 | **12** | 404.0 | 406.0 | 406.0 | ✓ |
| 6 | `GET /api/v1/users (c=50)` | 50 | **11035** | 3.0 | 12.0 | 95.0 | ✓ |
| 7 | `POST /api/v1/users (c=10, bcrypt=200ms)` | 10 | **48** | 202.0 | 205.0 | 206.0 | ✓ |

### Throughput — Req/s (avg)

```
GET /auth/setup-status (c=50)               ██████████████████████████████  15389 rps
POST /auth/login (c=5,  bcrypt=200ms)       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     24 rps
POST /auth/login (c=20, bcrypt=200ms)       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     96 rps
POST /auth/login (c=50, bcrypt=200ms)       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    230 rps
POST /auth/change-password (c=5, 2×bcrypt)  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     12 rps
GET /api/v1/users (c=50)                    ██████████████████████░░░░░░░░  11035 rps
POST /api/v1/users (c=10, bcrypt=200ms)     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     48 rps
```

### Latency breakdown (ms)

| Endpoint | avg | p50 | p97.5 | p99 | p99.9 | stddev |
|----------|----:|----:|------:|----:|------:|-------:|
| `GET /auth/setup-status (c=50)` | 2.7 | 2.0 | 7.0 | 8.0 | 40.0 | 2.4 |
| `POST /auth/login (c=5,  bcrypt=200ms)` | 202.0 | 202.0 | 206.0 | 206.0 | 206.0 | 1.2 |
| `POST /auth/login (c=20, bcrypt=200ms)` | 202.9 | 203.0 | 208.0 | 208.0 | 209.0 | 1.6 |
| `POST /auth/login (c=50, bcrypt=200ms)` | 214.5 | 204.0 | 385.0 | 388.0 | 388.0 | 38.3 |
| `POST /auth/change-password (c=5, 2×bcrypt)` | 403.5 | 404.0 | 406.0 | 406.0 | 406.0 | 1.0 |
| `GET /api/v1/users (c=50)` | 4.1 | 3.0 | 10.0 | 12.0 | 95.0 | 8.7 |
| `POST /api/v1/users (c=10, bcrypt=200ms)` | 202.1 | 202.0 | 204.0 | 205.0 | 206.0 | 1.1 |

---

## Suite: `data`

_Run at: 2026-03-05T05:03:27.575Z_

| # | Endpoint | c | Req/s avg | p50 ms | p99 ms | p99.9 ms | Err |
|---|----------|:-:|----------:|-------:|-------:|---------:|:---:|
| 1 | `GET /health (c=30)` | 30 | **10761** | 1.0 | 22.0 | 122.0 | ✓ |
| 2 | `GET /auth/setup-status (c=30)` | 30 | **11890** | 1.0 | 18.0 | 38.0 | ✓ |
| 3 | `GET /schema/tables (c=30)` | 30 | **12140** | 1.0 | 15.0 | 66.0 | ✓ |
| 4 | `GET /schema/indexes (c=30)` | 30 | **13183** | 1.0 | 18.0 | 36.0 | ✓ |
| 5 | `GET /state/state_users (c=30)` | 30 | **7012** | 1.0 | 83.0 | 232.0 | ✓ |
| 6 | `GET /state/state_users/:id (c=30)` | 30 | **6447** | 1.0 | 26.0 | 5321.0 | ✓ |
| 7 | `POST /sql/execute SELECT (c=30)` | 30 | **9220** | 2.0 | 25.0 | 42.0 | ✓ |
| 8 | `GET /audit (c=30)` | 30 | **5527** | 1.0 | 103.0 | 13108.0 | ⚠ (2) |
| 9 | `GET /monitoring/stream-stats (c=30)` | 30 | **273** | 91.0 | 899.0 | 16127.0 | ✓ |
| 10 | `GET /changes (c=30)` | 30 | **9292** | 1.0 | 27.0 | 241.0 | ✓ |
| 11 | `GET /approvals/pending (c=30)` | 30 | **4644** | 2.0 | 63.0 | 16839.0 | ⚠ (4) |

### Throughput — Req/s (avg)

```
GET /health (c=30)                          ████████████████████████░░░░░░  10761 rps
GET /auth/setup-status (c=30)               ███████████████████████████░░░  11890 rps
GET /schema/tables (c=30)                   ████████████████████████████░░  12140 rps
GET /schema/indexes (c=30)                  ██████████████████████████████  13183 rps
GET /state/state_users (c=30)               ████████████████░░░░░░░░░░░░░░   7012 rps
GET /state/state_users/:id (c=30)           ███████████████░░░░░░░░░░░░░░░   6447 rps
POST /sql/execute SELECT (c=30)             █████████████████████░░░░░░░░░   9220 rps
GET /audit (c=30)                           █████████████░░░░░░░░░░░░░░░░░   5527 rps
GET /monitoring/stream-stats (c=30)         █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    273 rps
GET /changes (c=30)                         █████████████████████░░░░░░░░░   9292 rps
GET /approvals/pending (c=30)               ███████████░░░░░░░░░░░░░░░░░░░   4644 rps
```

### Latency breakdown (ms)

| Endpoint | avg | p50 | p97.5 | p99 | p99.9 | stddev |
|----------|----:|----:|------:|----:|------:|-------:|
| `GET /health (c=30)` | 2.3 | 1.0 | 11.0 | 22.0 | 122.0 | 6.6 |
| `GET /auth/setup-status (c=30)` | 2.3 | 1.0 | 10.0 | 18.0 | 38.0 | 8.8 |
| `GET /schema/tables (c=30)` | 2.3 | 1.0 | 8.0 | 15.0 | 66.0 | 25.9 |
| `GET /schema/indexes (c=30)` | 1.9 | 1.0 | 6.0 | 18.0 | 36.0 | 15.8 |
| `GET /state/state_users (c=30)` | 6.8 | 1.0 | 18.0 | 83.0 | 232.0 | 104.7 |
| `GET /state/state_users/:id (c=30)` | 11.2 | 1.0 | 13.0 | 26.0 | 5321.0 | 211.3 |
| `POST /sql/execute SELECT (c=30)` | 2.8 | 2.0 | 16.0 | 25.0 | 42.0 | 4.2 |
| `GET /audit (c=30)` | 38.4 | 1.0 | 23.0 | 103.0 | 13108.0 | 658.8 |
| `GET /monitoring/stream-stats (c=30)` | 250.0 | 91.0 | 239.0 | 899.0 | 16127.0 | 1557.9 |
| `GET /changes (c=30)` | 2.7 | 1.0 | 13.0 | 27.0 | 241.0 | 11.0 |
| `GET /approvals/pending (c=30)` | 57.3 | 2.0 | 31.0 | 63.0 | 16839.0 | 919.9 |

---

## Notes

- All DB calls are **mocked** (instant) — numbers reflect pure Fastify routing + middleware overhead.
- `auth` suite simulates bcrypt via `setTimeout(200ms)` per pgPool.query, showing realistic IO-bound behaviour.
- Rate limiter is **disabled** in bench mode (`disableRateLimit: true`).
- Request logging is **disabled** to prevent pino buffer OOM at high concurrency.
- Concurrency kept at ≤50 to stay within Node.js single-process event loop capacity.
