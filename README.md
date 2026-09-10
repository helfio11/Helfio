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
