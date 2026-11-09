# ProtoNex

**Where Ideas Become Prototypes.**

A CAD-upload-to-manufactured-order platform: customers upload CAD geometry, get a
geometry-aware instant estimate, submit an RFQ, an engineer reviews and finalizes
pricing, the customer accepts, and an order is created and tracked through
production and shipping.

```
frontend/   Static HTML/CSS/JS — the existing premium ProtoNex UI, unchanged in design
backend/    TypeScript/Express API, PostgreSQL via Prisma, S3-compatible storage,
            BullMQ background jobs, Resend email
```

---

## 1. Architecture summary

- **Frontend**: static HTML/CSS/vanilla JS (preserved as-is). Talks to the API via
  `frontend/api-client.js`, a thin `fetch` wrapper that sends HttpOnly session
  cookies with every request.
- **Backend**: Express + TypeScript. Auth is JWT-in-cookie + rotating opaque
  refresh tokens; every route enforces role/ownership **server-side** — the
  frontend's notion of role is never trusted.
- **Database**: PostgreSQL via Prisma (`backend/prisma/schema.prisma`).
- **File storage**: S3-compatible (AWS S3, Cloudflare R2, or MinIO for local dev).
  CAD bytes never pass through the API process — the browser uploads directly to
  a presigned URL.
- **Background jobs**: BullMQ + Redis run CAD geometry analysis, email sending,
  and PDF generation off the request path (`backend/src/jobs/worker.ts`).
- **Email**: Resend, with branded HTML templates and an idempotent `EmailLog`.
- **Geometry engine**: the original `analyze_geometry.py` (CadQuery for
  STEP/IGES, Trimesh for STL/OBJ/3MF), invoked via `child_process.spawn` and
  wrapped by `src/services/geometryService.ts`.
- **Pricing engine**: `src/services/pricingService.ts`, deliberately separate
  from geometry analysis and from the UI. Every quote persists an **immutable
  pricing snapshot** so later admin pricing changes never retroactively alter
  an already-issued quote.

## 2. Database schema summary

See `backend/prisma/schema.prisma` for the full definition. Core entities:
`User`, `Company`, `Project`, `CADFile`, `GeometryAnalysis`, `DFMAnalysis`,
`Material` / `ProcessRate` / `FinishingOption` / `DeliveryOption` (pricing
config), `Quote`, `QuoteItem`, `QuoteStatusHistory`, `Order`, `OrderItem`,
`Notification`, `EmailLog`, `AuditLog`, `RefreshToken`.

## 3. Authentication

- Password hashing: bcrypt (12 rounds).
- Sessions: short-lived JWT access token (15 min) + rotating opaque refresh
  token (30 days), both in `HttpOnly`, `SameSite=Lax` cookies (`Secure` in
  production via `COOKIE_SECURE=true`).
- Account lockout after 5 failed logins (15 minutes).
- Email verification and password reset via signed one-time tokens.
- Roles: `CUSTOMER`, `ENGINEER`, `ADMIN`, enforced by `requireAuth` /
  `requireRole` / `requireStaff` / `requireAdmin` middleware — never by
  anything the client sends.
- IDOR protection: every resource route calls `assertOwnsOrStaff` /
  `assertIsOwner` before returning or mutating data owned by a specific
  customer. See `backend/tests/isolation.test.ts`.

## 4. CAD storage implementation

`POST /api/cad-files/request-upload` → validates extension/size → creates a
`PENDING` `CADFile` row → returns a presigned `PUT` URL. The browser uploads
directly to object storage. `POST /api/cad-files/confirm-upload` then enqueues
a `CAD_ANALYSIS` background job. Downloads are always via short-lived signed
URLs (`getDownloadUrl`, 5 min).

## 5–6. Geometry & pricing implementation

`geometryService.ts` wraps the Python engine and reports raw geometry
(volume/area/bbox/faces/watertightness) only — it does not invent a
"complexity" number. `estimateComplexityScore()` derives a bounded 0–1 heuristic
from face density and fill-ratio, kept separate and transparent. DFM checks
that the current engine cannot actually verify (thin walls, tiny holes,
overhangs, sharp corners, true min-feature-size, tool accessibility) are
honestly reported as `NOT_ANALYZED` rather than guessed (`dfmService.ts`).

`pricingService.calculateQuote(geometry, config)` reads `Material` /
`ProcessRate` / `FinishingOption` / `DeliveryOption` from the database and
returns `{ breakdown, snapshot }`. The `snapshot` is a plain, persisted value —
never a live reference — so historical quotes are immune to later pricing
changes (`backend/tests/pricing.test.ts`).

## 7. Quote workflow

`DRAFT → SUBMITTED → UNDER_REVIEW → NEEDS_CUSTOMER_INFO → APPROVED/REJECTED →
ORDERED`, with every transition recorded in `QuoteStatusHistory` and audited
in `AuditLog`. Customer-only fields (`internalNotes`) are stripped from every
response a `CUSTOMER` role receives (`quotes.routes.ts`).

## 8–9. Email workflow

14 branded templates in `backend/emails/templates.ts` (ProtoNex wordmark,
tagline, dark/orange theme). `emailService.send()` is idempotent — pass a
stable `idempotencyKey` and a retried call will never double-send — with
exponential backoff and `EmailLog` persistence. In production, calls should go
through `jobs.enqueueEmail()` (BullMQ) rather than synchronously in a request
handler; the routes in this repo already do this for all workflow emails.

## 10–12. Dashboard / admin workflow

`frontend/dashboard.js` and `frontend/admin.js` are fully wired to the real
API (no demo/mock/localStorage data) via `frontend/api-client.js`. The
customer dashboard's CAD quote builder uploads directly to object storage,
polls geometry status, and requests live price estimates
(`POST /api/pricing/estimate`) before the customer submits an RFQ. The admin
console (`admin.html`/`admin.js`) lists all quotes for `ENGINEER`/`ADMIN`
roles, shows geometry + DFM + system pricing, and lets an engineer adjust
price/lead time/notes and approve/reject — which triggers the matching
customer email.

## 13. DFM workflow

See §5–6 above and `backend/src/services/dfmService.ts`.

## 14. PDF quotes

`backend/src/services/pdfService.ts` (pdfkit) renders a branded PDF with only
customer-facing fields, stored privately in object storage and served via a
signed download URL from both `GET /api/quotes/:id/pdf` (customer/staff) and
`GET /api/admin/quotes/:id/pdf` (staff).

## 15. API security

Helmet, CORS locked to `APP_URL` with credentials, `express-rate-limit`
(tighter on `/api/auth/*`), Zod validation on every mutating route, Prisma
(parameterized queries — no raw SQL injection surface), centralized error
handler that never leaks stack traces when `NODE_ENV=production`, request-size
limit on JSON bodies (CAD bytes never travel through JSON).

## 16. Environment variables

See `backend/.env.example`. Never commit `.env`; `.gitignore` already excludes it.

## 17. Error handling

Every API error responds as:
```json
{ "success": false, "error": { "code": "QUOTE_NOT_FOUND", "message": "..." } }
```
See `backend/src/middleware/errorHandler.ts`.

## 18. Observability

`pino` structured logging with request IDs (`x-request-id` or generated UUID),
redaction of secrets/passwords/tokens in log output, and `pino-http` request
logging on every route.

## 19. Background jobs

BullMQ + Redis. Queues: `CAD_ANALYSIS`, `QUOTE_CALCULATION` (reserved for
future multi-file aggregate pricing), `EMAIL_SEND`, `PDF_GENERATION`. Run the
worker process separately from the API (`npm run worker`).

## 20. Database migrations

Prisma. `backend/prisma/schema.prisma` + `backend/prisma/seed.ts` (pricing
config always seeded; demo accounts only seeded outside `NODE_ENV=production`).

## 21–22. Testing

`backend/tests/` — `auth.test.ts` (signup/login/lockout), `isolation.test.ts`
(the critical customer-data-isolation boundary the spec calls out — Customer A
must never reach Customer B's projects/quotes/orders), `pricing.test.ts`
(snapshot immutability). Run with `npm test` inside `backend/` against a real
Postgres instance (see CI config for a working example against
`postgres:16-alpine`).

---

## Running locally

### Prerequisites
- Node.js ≥ 18
- Docker (for Postgres/Redis/MinIO) — or your own instances
- Python 3 with `cadquery` and `trimesh` installed, for the geometry engine

### 1. Install
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# fill in AUTH_SECRET / JWT_*_SECRET (openssl rand -base64 32), S3 + Resend
# keys once you have them — safe defaults are provided for local dev otherwise
```

### 3. Start infrastructure (Postgres, Redis, MinIO)
```bash
cd ..
docker compose up -d postgres redis minio
```
Create the MinIO bucket once (via the console at `http://localhost:9001`,
login `protonex` / `protonex123`) named `protonex-cad-files`.

### 4. Run database migrations + seed
```bash
cd backend
npm run prisma:migrate
npm run prisma:seed
```
This seeds real pricing configuration plus (outside production) three demo
accounts, password `DemoPass123!`:
`admin@protonex.example`, `engineer@protonex.example`, `customer@protonex.example`.

### 5. Start the API and worker
```bash
npm run dev        # API on http://localhost:8787, also serves the frontend
npm run worker      # in a second terminal — background job processor
```

Visit `http://localhost:8787` — the ProtoNex frontend is served by the API in
this configuration (see `src/app.ts`), so no separate frontend server is
needed for local development.

### 6. Run tests
```bash
npm test
```

### 7. Build for production
```bash
npm run build
npm start
```

### 8. Full stack via Docker Compose
```bash
docker compose up --build
```

---

## Deployment

- **Railway / Render / AWS**: build `backend/Dockerfile`, run migrations via
  `npx prisma migrate deploy` as a release step, run the API (`node
  dist/index.js`) and worker (`node dist/jobs/worker.js`) as separate
  services, provision managed Postgres + Redis + S3/R2.
- **Vercel**: works for the static `frontend/` directory; the Express API is
  better suited to Railway/Render/AWS/Fly given the long-lived worker process
  and file streaming needs — front it with Vercel only if you split the
  frontend out and point `api-client.js`'s `BASE` at the API's own domain.
- CI/CD: `.github/workflows/ci.yml` runs lint, typecheck, Prisma migrate,
  tests, and build on every PR against a real Postgres/Redis service
  container; add your deploy step in the `deploy` job.

## Environment variables required

See `backend/.env.example` for the full list with comments. Never commit real
values — `.gitignore` excludes `.env` already.

## Remaining limitations

- Multi-CAD-file quotes currently price off the first file's geometry;
  true multi-part aggregate pricing is a natural next step (the
  `QUOTE_CALCULATION` queue is reserved for this).
- Quote-expiry emails (`quote_expiring_soon`) and the checksum-verification-
  against-S3-ETag step are wired as templates/fields but need a small cron
  job to actually fire on schedule — not included here since it's
  infrastructure-specific (Railway cron, AWS EventBridge, etc.).
- This code was written and reviewed for correctness but **not executed**
  against a live Postgres/Redis/S3 in the environment that produced it (no
  network access there). Run the steps above locally before deploying;
  `npm run typecheck` and `npm test` in `backend/` are the fastest way to
  catch anything that needs adjusting for your exact dependency versions.
