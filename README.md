# Helfio

Helfio is a multilingual service marketplace. Customers publish service requests, providers maintain profiles and services, discover open requests, submit offers, and communicate with customers. Customers accept offers, providers execute the assigned work, customers confirm completion, and completed jobs can receive public provider reviews.

## Current Release

The current production-like release is certified through Phase 15E. The final release commit is `4d99f06` (`Finalize Helfio production release`) on `main` and has been pushed to `origin/main`.

Verified release capabilities include:

- Customer and provider marketplace flow through job creation, offers, acceptance, messaging, lifecycle, completion, and review.
- Admin Panel for dashboard, users, providers, jobs, reviews, categories, audit log, and settings.
- English, German, Albanian, and Turkish localization (`en`, `de`, `sq`, `tr`).
- Java Marketplace as the authoritative marketplace owner.
- Node Gateway/BFF integration, Keycloak authentication, Redis-backed rate limiting, Kafka domain events, NATS connectivity, SSE messaging, and Web Push isolation.
- Production frontend build, Node tests/typecheck, Java tests/package, backup/restore verification, and release smoke checks.

## Architecture and Ownership

### Frontend

The frontend is Vue 3 with TypeScript, Vite, and `vue-i18n`.

- Source: `src/`
- Entry point: `src/main.ts`
- Application shell and route dispatch: `src/App.vue`
- Authentication client: `src/auth/keycloak.ts`
- Locale resources: `src/i18n/locales/`
- Vite API proxy: `/api` to `http://localhost:3001`
- Development port: `5173`

The frontend provides public homepage, category search, provider profiles, public job details, customer/provider workspaces, inbox, notifications, assistant UI, and Admin Panel views. It uses runtime path dispatch rather than a separate router package.

### Node Gateway / BFF

The Node + TypeScript service is the API Gateway/BFF.

- Entry point: `server/index.ts`
- HTTP routing and authorization boundary: `server/app.ts`
- Keycloak token verification: `server/auth.ts`
- PostgreSQL access: `server/db.ts`
- Domain events and worker: `server/events.ts`, `server/event-worker.ts`
- Notifications and push: `server/notifications.ts`, `server/push.ts`
- AI integration: `server/ai.ts`
- Port: `3001`

The Gateway owns authentication, local account synchronization, role and ownership checks, customer/provider/admin non-marketplace routes, search/category APIs, messaging, notifications, AI orchestration, rate limiting, health endpoints, and proxying of marketplace routes.

### Java Marketplace

The Java 21 + Spring Boot service in `services/marketplace/` is the authoritative marketplace service. It owns marketplace job, offer, assignment, lifecycle, and marketplace-facing review operations. The Node Gateway proxies marketplace paths to it when `MARKETPLACE_ROLLBACK_MODE=false`.

- Module: `services/marketplace/`
- Build file: `services/marketplace/pom.xml`
- Application configuration: `services/marketplace/src/main/resources/application.yml`
- Container port: `8081`; host port: `8090`
- Health endpoint: `http://localhost:8090/actuator/health`

Node rollback mode is disabled in the release configuration. Do not enable it for normal development or release operation.

### Infrastructure

Docker Compose provides the stateful and identity services:

| Service | Image or role | Host port | Persistent volume |
| --- | --- | ---: | --- |
| `helfio-db` | PostgreSQL 16 | `5432` | `helfio-postgres-data` |
| `keycloak-db` | PostgreSQL 16 for Keycloak | `5433` | `keycloak-postgres-data` |
| `keycloak` | Keycloak 26.2.4 | `8080` | realm configuration is bind-mounted |
| `redis` | Redis 7 | `6379` | `helfio-redis-data` |
| `kafka` | Apache Kafka 3.9 | `9092` | `helfio-kafka-data` |
| `nats` | NATS 2.10 with JetStream | `4222` | `helfio-nats-data` |
| `marketplace` | Helfio Java Marketplace | `8090` | uses `helfio-db` |

PostgreSQL is the system of record for Helfio application data. Redis provides distributed rate limiting and related runtime support. Kafka carries domain events; the configured topic is `helfio.domain-events`. NATS is available for event connectivity. Keycloak is the identity and credential authority; Helfio does not store passwords or raw access tokens.

## Product Flow

1. A customer authenticates with Keycloak and creates a request linked to an active PostgreSQL category.
2. The customer publishes the request, making it `OPEN`.
3. A provider authenticates, saves a profile, selects category services, discovers open jobs, and submits an offer.
4. The customer reviews and accepts an offer. The offer becomes `ACCEPTED` and the job becomes `ASSIGNED`.
5. A conversation can be created from the customer-owned job and matching offer. Messages support unread/read state, authenticated SSE delivery, and optional Web Push.
6. The provider starts and finishes the job: `IN_PROGRESS` then `AWAITING_CONFIRMATION`.
7. The customer confirms completion: `COMPLETED`.
8. The customer submits a rating and review. Public provider profile and review endpoints expose the public-safe result.

## Setup

### Prerequisites

- Node.js with npm
- Docker and Docker Compose
- Java 21 and Maven for local Java development outside Docker
- PostgreSQL client tools only if using host-side `psql`, `pg_dump`, or `pg_restore`

Install JavaScript dependencies:

```sh
npm install
```

Create local configuration from the example and replace development placeholders with local values. Never commit real passwords, API keys, private VAPID keys, or tokens:

```sh
cp .env.example .env
```

Important configuration groups in `.env` include:

- `DATABASE_URL`, `POSTGRES_*`
- `KEYCLOAK_*` and `VITE_KEYCLOAK_*`
- `KEYCLOAK_AUDIENCE=helfio-web` and `KEYCLOAK_CLIENT_ID=helfio-web`
- `REDIS_URL`, `KAFKA_BROKERS`, `KAFKA_TOPIC`, and `NATS_URL`
- `MARKETPLACE_SERVICE_URL=http://localhost:8090`
- `MARKETPLACE_ROLLBACK_MODE=false`
- `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`

For GitHub Codespaces, browser-facing URLs use the forwarded frontend and Keycloak ports. Set explicit public Keycloak/frontend values when required, and run the Keycloak development configuration script to register the exact frontend redirect and web origin:

```sh
npm run keycloak:configure-dev
```

The configured Keycloak web client uses Authorization Code Flow with PKCE. Production redirect origins must be explicit; do not use wildcard origins.

## Docker Compose Startup

Start the existing services while preserving named volumes:

```sh
docker compose --env-file .env up -d --build
```

This command does not reset databases. Do not use `docker compose down -v` for normal development because it deletes persistent volumes. The Java Marketplace image is built from `services/marketplace/`.

Create the Kafka event topic when the broker is configured with auto-creation disabled:

```sh
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic helfio.domain-events \
  --partitions 1 --replication-factor 1
```

Apply database migrations and the repository seed only when setting up an empty or intentionally prepared development database:

```sh
npm run db:migrate
npm run db:seed
```

`db:migrate` applies `db/migrations/*.sql` in filename order. The repository currently contains migrations `001` through `014`. `db/seed.sql` inserts the intended categories and translations idempotently with `ON CONFLICT DO NOTHING`; it does not reset users or jobs.

Start the Node Gateway and Vue frontend in separate terminals from the repository root:

```sh
npm run dev:api
npm run dev -- --host 0.0.0.0
```

The frontend is available at `http://localhost:5173/`; the Gateway is available at `http://localhost:3001/`.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite frontend |
| `npm run dev:api` | Start Node Gateway using `.env` |
| `npm run build` | Typecheck/build the frontend with `vue-tsc` and Vite |
| `npm run preview` | Preview the built frontend |
| `npm run typecheck:backend` | Typecheck Node backend |
| `npm run test:backend` | Run Node backend tests; test script enables rollback mode for isolated fixtures |
| `npm run keycloak:configure-dev` | Configure the development Keycloak web client URLs |
| `npm run vapid:generate` | Generate local VAPID key material in ignored local configuration |
| `npm run db:migrate` | Apply all SQL migrations in order |
| `npm run db:seed` | Apply repository category/translation seed |
| `cd services/marketplace && mvn test` | Run Java Marketplace tests |
| `cd services/marketplace && mvn -DskipTests package` | Build the Java Marketplace package |

## API and Health Checks

The Node Gateway exposes:

- `GET /health/live` - process liveness
- `GET /health/ready` - PostgreSQL and event-worker readiness
- `GET /health/metrics` - request, error, rate-limit, and uptime metrics
- `GET /api/v1/categories`, `/tree`, `/homepage`, `/navigation`, and `/categories/:slug`
- `GET /api/v1/providers/homepage` and `/api/v1/providers/:userId`
- `GET /api/v1/search`
- `GET` and `PATCH /api/v1/me`
- Customer job, offer, review, notification, and account privacy routes
- Provider profile, service, offer, lifecycle, and inbox routes
- Admin dashboard, user, provider, job, review, category, audit-log, and settings routes
- `POST /api/v1/ai/chat` and authenticated AI conversation access
- Authenticated inbox SSE at `GET /api/v1/inbox/events`

The Java Marketplace exposes its Spring Boot actuator health endpoint at `/actuator/health` on host port `8090`. Marketplace paths are routed through the Node Gateway while Java remains authoritative.

## Security and Reliability

- Keycloak signs OIDC access tokens. Node validates issuer, JWKS, audience, and application roles before synchronizing local accounts.
- Application roles are `CUSTOMER`, `PROVIDER`, and `ADMIN`. Role enforcement and resource ownership are server-side; frontend role checks are presentation-only.
- Protected routes return `401` without valid authentication and `403` for wrong roles, inactive accounts, or ownership violations.
- Input validation rejects malformed JSON, oversized bodies, invalid identifiers, invalid enums, invalid budgets, invalid ratings, and malformed push subscriptions.
- Write operations use Redis-backed rate limiting with an in-memory fallback when Redis is unavailable.
- API responses include correlation/request IDs and security headers including CSP, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.
- Errors are redacted in API responses and logs; internal exceptions do not expose stack traces or secrets.
- Sensitive admin mutations record audit entries. Account deletion is implemented as authenticated account anonymization rather than credential deletion in Helfio storage.
- Kafka event publishing uses the configured topic and bounded retry/backoff behavior. NATS connectivity is provided independently.
- Web Push failures are isolated from core messaging operations.
- If Java Marketplace is unavailable, the Gateway returns a safe `502` rather than silently switching implementations. `MARKETPLACE_ROLLBACK_MODE` remains `false` in the release configuration.
- Graceful Node shutdown closes HTTP connections, stops the event worker, and closes the database pool.

## AI Integration and Isolation

The assistant is server-side and uses `OPENAI_API_KEY` plus optional `OPENAI_MODEL`. The browser never receives the key. AI requests are bounded, rate-limited, authorized for Helfio context, and isolated from core marketplace operations. Missing or unavailable AI configuration returns a safe failure while jobs, offers, messaging, and other core routes remain available. The isolation test uses a test-only injected failing provider and does not weaken production authentication or routing.

## Data, Migrations, and Recovery

The migrations create categories, users, provider profiles/services, jobs, offers, messaging, lifecycle/confirmation fields, reviews, admin controls, events/notifications, indexes, and account anonymization support. Important indexes cover category/status, customer/provider job status, offers, conversation/message lookup, notifications, provider visibility, reviews, and account state.

Create a custom-format backup without modifying the live database:

```sh
pg_dump --format=custom --file=helfio-$(date +%F).dump "$DATABASE_URL"
```

Restore only into an isolated temporary database. The repository helper verifies this workflow:

```sh
./scripts/verify-postgres-backup.sh
```

The helper requires PostgreSQL client tools and is intended to create, restore, verify, and remove a temporary restore database. Never restore over the live `helfio` database as part of a routine check.

## Project Structure

```text
src/                         Vue frontend, auth client, components, locales, CSS
server/                      Node Gateway/BFF, database, auth, events, AI, tests
services/marketplace/        Java Spring Boot authoritative Marketplace
db/migrations/               SQL schema migrations 001-014
db/seed.sql                  Idempotent category and translation seed
infra/keycloak/              Keycloak realm import
public/                      static assets, service worker, robots, sitemap
scripts/                     Keycloak, VAPID, and PostgreSQL operational scripts
compose.yaml                 PostgreSQL, Keycloak, Redis, Kafka, NATS, Marketplace
```

## Web and SEO

- Supported locales are EN, DE, SQ, and TR; English is the default and fallback locale.
- `public/robots.txt` allows public crawling and disallows `/admin`.
- `public/sitemap.xml` lists only stable public routes (`/` and `/search`); dynamic category, provider, and job URLs are not invented.
- The frontend creates a runtime canonical URL for the current path, including existing dynamic public routes.

## Release Status

The current release is pushed to `origin/main` and the worktree was clean after release publication. The release includes the Java Marketplace container/JWKS reachability configuration, malformed JSON redaction handling, AI isolation fixture correction, localized Admin Panel/mobile labels, and SEO assets (`robots.txt`, `sitemap.xml`, runtime canonical URLs). No known release blocker remains.
