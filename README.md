# Expense Tracker

A personal expense tracker with multiple accounts (personal and friends), income / expense / transfer transactions, "paid by" tracking, balances and charts.

- **API:** FastAPI + MongoDB (`Expence-Manager-Backend/`), JWT authentication
- **Web app:** Next.js 15 + React 19 + Tailwind (`Expence-Manager-Frontend/`)
- **Deploy:** Docker Compose (this repo), or Vercel / Render (`vercel.json`, `render.yaml` in the backend folder)

## Quick start (Docker)

```bash
cp .env.example .env            # set JWT_SECRET (openssl rand -hex 32) and MONGO_PASSWORD
docker compose up -d --build
```

Open **http://localhost:3000**, create an account and start adding transactions. The API listens on `127.0.0.1:8000`; MongoDB is only reachable from the backend container. To use MongoDB Atlas instead, set `MONGO_URI` in `.env`. MongoDB 5+ requires a CPU with AVX; on older hardware set `MONGO_IMAGE=mongo:4.4`.

## Configuration

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | **Required.** Signing key for login tokens, 32+ random characters. Production refuses to start without it. |
| `MONGO_PASSWORD` / `MONGO_USER` | Credentials of the bundled MongoDB |
| `MONGO_URI` | Optional: a full connection string (Atlas) |
| `CORS_ORIGINS` | Frontend origin(s) allowed to call the API (not `*`) |
| `PUBLIC_API_URL` | Where the **browser** reaches the API (baked into the frontend build) |
| `ENVIRONMENT` | `production` (default) or `dev` (relaxed checks, `/docs` on) |
| `ENABLE_DOCS` | `true` exposes `/docs` in production |

## Security

- Passwords hashed with bcrypt (min. 10 characters); login throttled to 5 failures per e-mail and 300 overall per 15 minutes; unknown users cost the same time as wrong passwords.
- The signing key comes only from the environment; the API refuses to start in production with a missing / placeholder / short key or a wildcard CORS setting.
- Every account and transaction query is scoped to the signed-in user. `GET /api/users` returns only the caller (it used to list every registered e-mail).
- Internal errors are logged, never returned to the client. CORS allows only the configured origin; tokens travel in the `Authorization` header.
- Containers: non-root, read-only filesystem, all capabilities dropped, health checks; MongoDB requires authentication and is not published.

## Tests

```bash
cd Expence-Manager-Backend
pip install -r requirements-dev.txt
pytest
```

CI (`.github/workflows/ci.yml`) runs the tests, `pip-audit`, `npm audit` for the web app's production dependencies, builds both images and scans for committed secrets.

## Known limitations

- The web app keeps the JWT in `localStorage`, so an XSS bug would expose it; an httpOnly-cookie session would be the next hardening step. Tokens cannot be revoked before they expire (default 8 hours).
- The login limiter is in process memory, so the image runs a single worker; before scaling out, move the limiter to a shared store (e.g. Redis) or add a reverse-proxy rate limit.
- `passlib` 1.7.4 uses the `crypt` module that Python 3.13 removes; the image pins Python 3.12.
- `npm audit` reports PostCSS 8.5.x bundled inside Next.js; it only processes this project's own CSS at build time. Upgrade when Next ships a patched copy.
- Account deletion is not implemented (`DELETE /api/accounts/{id}` answers 501).

## Security note for the maintainer

Earlier versions of this repository used the literal string `YOUR_SECRET_KEY` as the JWT signing key. If an instance ran with it, **any** login token could be forged. Deploy with a new `JWT_SECRET` (this invalidates every old token) and rotate the Atlas password if the connection string was ever shared.
