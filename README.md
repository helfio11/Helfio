# Helfio

Helfio's category data is PostgreSQL-backed. The Vue app uses the versioned category API through the Vite development proxy.

## Categories API

Set `DATABASE_URL` to a PostgreSQL connection string, then apply the migration and seed data:

```sh
npm install
npm run db:migrate
npm run db:seed
```

Run the API and frontend in separate terminals:

```sh
npm run dev:api
npm run dev
```

Category routes are available at `/api/v1/categories`, `/api/v1/categories/tree`, `/api/v1/categories/homepage`, `/api/v1/categories/navigation`, and `/api/v1/categories/:slug`.

The database supports hierarchical categories and translations for `en`, `de`, `sq`, and `tr`. Homepage category names are always read from the API and selected using the active locale, with English and then the first available translation as safe fallbacks.

## Localization

The frontend uses `vue-i18n` with typed locale resources in `src/i18n/locales/`. The supported locales are:

- `en` - English
- `de` - Deutsch
- `sq` - Shqip
- `tr` - Türkçe

English is the default and fallback locale. The language selector updates the page immediately and persists the selected locale in `localStorage` under `helfio-locale`, so it is restored after refresh. Static homepage copy lives in the locale resources; dynamic category names and descriptions remain PostgreSQL/API data.

## Phase 4 Authentication

Keycloak is Helfio's identity and credential authority. Helfio never stores passwords, refresh tokens, or raw access tokens. The Node API validates Keycloak access tokens against the configured issuer and JWKS, then synchronizes the validated `sub`, email, and display name into the PostgreSQL `users` table.

Roles are centralized as `CUSTOMER`, `PROVIDER`, and `ADMIN`; the realm also reserves `MODERATOR`, `SUPPORT`, and `SUPER_ADMIN` for future phases. The backend enforces roles and local account status. Frontend checks are only for user experience.

Apply migrations and start local infrastructure with Docker Compose:

```sh
cp .env.example .env
# Set the development-only values in .env
docker compose up -d
npm run db:migrate
npm run keycloak:configure-dev
npm run dev:api
npm run dev
```

The realm import configures `helfio-web` and `helfio-admin` as public OIDC clients using Authorization Code Flow with PKCE, localhost redirects, email verification, and Keycloak reset-password flows. Codespaces deployments should set the `VITE_KEYCLOAK_*` and `KEYCLOAK_*` variables to the forwarded Keycloak/frontend URLs and add those URLs to the development client settings; production origins must be explicit and never wildcarded.

For GitHub Codespaces, set the browser-facing public URLs before starting the services. For the current Codespaces port-forwarding domain, the public URLs follow `https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` for Helfio and `https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` for Keycloak. The frontend derives the Keycloak `8080` forwarded URL from its own runtime origin when `VITE_KEYCLOAK_PUBLIC_URL` is empty, and the backend derives the public issuer when `KEYCLOAK_ISSUER` is empty. Before Compose startup, set `KEYCLOAK_PUBLIC_URL` to the forwarded Keycloak URL so Keycloak advertises that issuer. Browser redirects always use `window.location.origin`; the backend `KEYCLOAK_ISSUER` must match the public issuer advertised by Keycloak, while Docker-internal database URLs remain separate.

`npm run keycloak:configure-dev` derives the Codespaces frontend URL from `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` when `KEYCLOAK_FRONTEND_PUBLIC_URL` is unset, and adds that exact URL to the development client's redirect, web-origin, and post-logout settings. Keycloak does not accept arbitrary host wildcards for redirect URIs, so this explicit environment-driven step avoids hardcoding one Codespace hostname and does not broaden production origins.

Required environment variables are listed in `.env.example`. `GET /api/v1/me` returns the local account and validated application roles. `PATCH /api/v1/me` accepts only `displayName` and `preferredLocale` (`en`, `de`, `sq`, or `tr`). Account credentials remain in Keycloak; Helfio PostgreSQL owns only application profile and account state (`ACTIVE`, `SUSPENDED`, or `DISABLED`). Future Java/Spring Boot services should use the same issuer, JWKS, audience, and realm roles rather than duplicating this user/auth domain.

## Phase 5 Provider Profiles

Provider profiles are stored in `provider_profiles` and linked to dynamic PostgreSQL categories through `provider_services`. No service names are duplicated in the frontend. Only authenticated users with the validated `PROVIDER` role can manage their own profile; customer and unauthenticated requests receive `403` and `401` respectively. Profile visibility controls public exposure, and public responses omit private contact fields while returning a rating placeholder until the Reviews phase.

Provider endpoints:

- `GET /api/v1/provider/profile`
- `PUT /api/v1/provider/profile`
- `PUT /api/v1/provider/services` with `{ "categoryIds": ["..."] }`
- `GET /api/v1/providers/homepage`
- `GET /api/v1/providers/:userId`

Provider onboarding is shown to authenticated providers on the existing homepage and supports profile details, availability, starting price, visibility, and selecting active categories/subcategories. Homepage provider cards now use the public provider API; Jobs, Messaging, Reviews, and other later marketplace workflows remain out of scope.

## Phase 6 Jobs / Service Requests

Authenticated customers can create and manage their own PostgreSQL-backed service requests through `GET /api/v1/jobs`, `POST /api/v1/jobs`, `GET /api/v1/jobs/:id`, `PATCH /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/publish`, and `POST /api/v1/jobs/:id/cancel`.

Requests reference active database categories and include database-driven category translations. The customer lifecycle currently allows `DRAFT -> OPEN`, `DRAFT -> CANCELLED`, and `OPEN -> CANCELLED`; assignment and provider applications are reserved for later phases. Only active customers can access these routes, and ownership is enforced by the API.

## Phase 7 Applications, Offers, and Helfio Assistant

Migration `005_create_offers.sql` adds provider offers and 24-hour authenticated AI conversation storage. Providers can browse open jobs, submit one active offer per job, edit pending offers, and withdraw them. Customers can review offers for their own jobs, accept one offer transactionally, or reject pending offers. Acceptance marks the offer `ACCEPTED`, rejects the remaining pending offers, and prepares the job as `ASSIGNED`; later job execution states remain out of scope.

Offer APIs are available at `/api/v1/provider/jobs`, `/api/v1/provider/jobs/:id`, `/api/v1/provider/offers`, `/api/v1/jobs/:id/offers`, `/api/v1/offers/:id`, `/api/v1/offers/:id/withdraw`, `/api/v1/offers/:id/accept`, and `/api/v1/offers/:id/reject`. Provider and customer ownership is enforced server-side.

The global Helfio Assistant uses `POST /api/v1/ai/chat` and authenticated `GET /api/v1/ai/conversation`. OpenAI is server-only through `OPENAI_API_KEY` and optional `OPENAI_MODEL`; the Vue application never receives the key. The assistant receives bounded, authorized Helfio context, refuses off-topic or secret/system-prompt requests, times out safely, and stores authenticated history for 24 hours. Guests retain temporary browser history only. Missing OpenAI configuration returns a safe `503` while the rest of Helfio remains available.

## Phase 8 Inbox / Messaging

Migration `006_create_messaging.sql` adds customer/provider conversations, messages with per-recipient read state, and Web Push subscriptions. A conversation is created from a customer-owned job and a matching pending or accepted provider offer. Every inbox, message, and read operation is authorized against the authenticated local account; the browser role checks are only presentation logic.

The API exposes `GET /api/v1/inbox`, `GET /api/v1/inbox/unread`, `POST /api/v1/inbox/conversations`, conversation read/send routes, an authenticated SSE stream at `/api/v1/inbox/events`, and push-subscription routes. Messages are delivered to connected members over SSE and optionally sent through Web Push. Generate local VAPID keys with `npm run vapid:generate`; this creates ignored `.env.local` with mode `600`. Load those variables into the backend environment before starting `npm run dev:api`. Keep `VAPID_PRIVATE_KEY` backend-only; only `VAPID_PUBLIC_KEY` is returned to authenticated inbox clients.
