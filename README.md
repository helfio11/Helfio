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

The database supports hierarchical categories and translations for `en`, `de`, `sq`, and `tr`. The current seed provides the visible German and Albanian homepage categories.
