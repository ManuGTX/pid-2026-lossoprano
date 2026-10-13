# Deploy BulkMarket to Vercel

The deployed app uses two Vercel projects from this repository, one cloud PostgreSQL database, and a public Vercel Blob store for product photos. Once the database and photos have migrated, your computer can be switched off.

| Component | Host | Vercel Root Directory | Framework |
| --- | --- | --- | --- |
| React frontend | Vercel | `frontend` | Vite |
| NestJS API | Vercel | `backend` | NestJS |
| PostgreSQL | Neon | — | — |
| Product photos | Vercel Blob | Connect store to the backend project | Public store |

Use Node.js **22.x** for both Vercel projects. Both directories include `vercel.json`; Vercel can detect NestJS's existing `src/main.ts` entry point.

## 1. Push the prepared code

Commit and push the deployment changes to `uca-argentina/pid-2026-lossoprano` using your normal Git workflow. Vercel builds the code on GitHub, so local edits must be pushed before importing the repository.

The `.env` files, `.env.cloud`, local uploads, and database backups are excluded from Git and Vercel uploads. Keep `backend/uploads` on your computer until the image migration has finished.

## 2. Create cloud PostgreSQL

Create a project at [Neon](https://neon.com), with an empty database. Choose a region close to the region you will use for the Vercel backend.

In Neon's connection dialog, copy both connection strings:

- **Direct / unpooled:** for restoring the backup and migrating photos. Its hostname does not contain `-pooler`.
- **Pooled:** for the deployed backend's `DATABASE_URL`. The hostname normally contains `-pooler`.

Keep the provider's TLS options in the URLs, including `sslmode=require`. This app uses the regular `pg` driver with TypeORM; no replacement database driver is needed.

## 3. Create the backend project and Blob store

In [Vercel New Project](https://vercel.com/new), import the GitHub repository:

| Setting | Value |
| --- | --- |
| Project name | Choose a name, for example `bulkmarket-api` |
| Root Directory | `backend` |
| Framework Preset | NestJS |
| Build Command | `npm run build` |
| Output Directory | Leave the NestJS default; do not set it to `dist` |
| Node.js Version | 22.x |

Set these backend environment variables for **Production**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon's pooled PostgreSQL connection string |
| `JWT_SECRET` | A new long random secret |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | Your eventual frontend production origin, e.g. `https://bulkmarket-web.vercel.app`, without `/` at the end |

Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and put it only in the backend's environment variables. A new secret means existing sessions need to sign in again; accounts and passwords are preserved.

Create the project. Until the database is restored, API requests may fail because its tables are missing; the database is intentionally not synchronized automatically in production.

From the backend project's **Storage** tab, create and connect a **public Vercel Blob** store. Product photos are public URLs; account data stays in PostgreSQL. Choose the Production environment when connecting it. Vercel supplies `BLOB_READ_WRITE_TOKEN` and, where enabled, Blob's OIDC settings automatically.

Add one more backend environment variable:

| Variable | Value |
| --- | --- |
| `BLOB_PUBLIC_URL` | The store's origin, e.g. `https://your-store.public.blob.vercel-storage.com` |

Find the store origin in Blob's dashboard or upload a small test image there and copy the URL's origin, without its file path. This must be the exact store connected to the backend. The API uses it to validate uploaded photo URLs.

Copy the store's read/write token for the one-time photo migration. Put it in `.env.cloud` in the next step, never in `VITE_*` variables.

## 4. Restore your local database

A backup was saved locally to `backups/bulkmarket-before-vercel.dump`. It contains schema and data for the existing eight application tables, including accounts, carts, products, and orders. Keep your Docker PostgreSQL service running while using the restore helper; it supplies `pg_restore`, so you do not need to install PostgreSQL tools on your Mac.

Immediately before moving over, stop editing the local app and refresh the backup so newer changes are included. Run these commands from the repository root:

```sh
mkdir -p backups
docker compose -f backend/docker-compose.yml exec -T postgres \
  pg_dump -U bulkmarket -d bulkmarket --no-owner --no-acl -Fc \
  > backups/bulkmarket-latest.dump

cp backend/.env.cloud.example backend/.env.cloud
```

Edit `backend/.env.cloud` locally:

```dotenv
DATABASE_URL=your-direct-neon-postgresql-connection-string
BLOB_READ_WRITE_TOKEN=your-vercel-blob-read-write-token
BLOB_PUBLIC_URL=https://your-store.public.blob.vercel-storage.com
```

Then run:

```sh
cd backend
npm ci
npm run db:restore:cloud -- ../backups/bulkmarket-latest.dump
npm run images:migrate:cloud
```

The restore script refuses a destination with existing tables and restores in a single transaction. It prints row counts for the eight tables. The image script checks that all referenced local photos exist, uploads them to Blob, and replaces photo paths **only in the cloud database**. It can be rerun after an interruption; products already migrated are skipped. Existing product versions and carts are preserved.

This full database backup already includes the current schema, so do not run the incremental SQL migrations again on the restored database. Do not start the deployed API with automatic schema synchronization.

Keep the local database and backup until you have checked the deployed app. Do not continue editing the local database after restoring it: further local edits will not appear in the cloud.

## 5. Deploy the frontend and connect the API

Redeploy the backend after adding Blob and finishing the migrations. Copy its stable **production** URL, for example `https://bulkmarket-api.vercel.app`.

Import the same GitHub repository as a second Vercel project:

| Setting | Value |
| --- | --- |
| Project name | Choose a name, for example `bulkmarket-web` |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x |
| `VITE_API_URL` environment variable | `https://YOUR-BACKEND-PRODUCTION-DOMAIN/api` |

Set `VITE_API_URL` for Production before deploying. The build checks that it is set and does not point to localhost.

Copy the frontend's actual production origin into the backend's `FRONTEND_URL`, then redeploy the backend. If you change `VITE_API_URL`, redeploy the frontend too: Vite embeds that variable during the build.

Use production domains for both URLs, rather than per-deployment preview URLs. Preview domains have separate deployment protection and CORS requirements. For later preview testing, use a separate database branch and storage configuration so previews do not write into the production database.

If the repository is not visible in Vercel, its GitHub organization may need to grant the Vercel GitHub integration access to this repository.

## 6. Verify the deployed app

Open the frontend production URL and check:

- Existing buyer and seller accounts can sign in.
- Existing products and all their photos appear.
- A seller can create and edit a product with five photos, up to 2 MB each.
- Cart contents and order history are present.
- The buyer can place an order and the seller can update its status.

Then stop the local frontend, backend, and Docker database and repeat a sign-in/product check. Successful use with those services stopped confirms the deployment is independent of your PC.

If requests fail, check the backend's Vercel runtime logs. A CORS error usually means `FRONTEND_URL` does not exactly match the frontend origin. Database errors usually mean an incorrect URL or missing restore. An image upload error usually means Blob credentials or `BLOB_PUBLIC_URL` are missing. A Vercel login page in place of an API response means you are using a protected deployment URL; use the intended production domain and review the deployment's access settings.

## Local development

Your existing `backend/.env` and `frontend/.env` still run against Docker and localhost. Without Blob settings, development uploads are saved under `backend/uploads/productos/<business-id>`. Cloud settings are loaded only by the migration helpers from `.env.cloud`.

The frontend uploads each photo in a separate authenticated request, then saves the resulting URLs with the product. This keeps five 2 MB photos below Vercel's 4.5 MB limit per request. The API checks each URL against the configured Blob store and the authenticated seller's directory.

Useful references: [Vercel monorepos](https://vercel.com/docs/monorepos), [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Function request limits](https://vercel.com/docs/functions/limitations), [Neon's backup and restore documentation](https://github.com/neondatabase/website/blob/main/content/docs/manage/backup-pg-dump.md).
