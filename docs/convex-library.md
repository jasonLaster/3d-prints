# Convex Library Persistence

The `3d-prints` Vercel project is connected to Convex through the Vercel Marketplace resource `convex-cinereous-park`. The integration provisions `CONVEX_DEPLOY_KEY` for Vercel builds and local deployment commands.

## Runtime Model

Convex stores two kinds of library records:

- `models`: source catalog entries.
- `versions`: saved parameter states and forks for source models.

Generated STL snapshots are stored in Convex File Storage. A saved version contains both the parameter snapshot and, when the viewer has finished loading, a generated STL snapshot for download.

## User Flows

- Save: uploads the current generated STL to Convex Storage and inserts a `versions` record with model id, params, unit, theme, and file name.
- Fork: creates a new version with `source: "fork"` and links to the active saved version when one is open.
- Open: rehydrates a saved version into the viewer by restoring model, unit, theme, params, URL state, and active version id.
- Dashboard view: shows catalog models, saved versions, forks, source-model counts, and direct generated-STL links.

Arbitrary STL upload is intentionally not supported yet. It would require model metadata capture, viewer routing, parameter schema authoring, audit setup, and safer file validation beyond the current saved-version workflow.

## Local Development

The React app enables Convex only when `VITE_CONVEX_URL` is present. Without that variable the dashboard and workspace header render a setup note, so local builds and Playwright tests remain deterministic.

For connected local development, run Convex and copy the generated URL into `.env.local`:

```bash
npx convex dev
```

## Vercel Deployment

Vercel uses `vercel.json` to run:

```bash
npm run build:vercel
```

That script runs:

```bash
npx convex deploy --cmd 'npm run build:app' --cmd-url-env-var-name VITE_CONVEX_URL
```

Convex deploys the backend first, then injects the deployment URL into the Vite build as `VITE_CONVEX_URL`.

## Audit Points

- `convex/schema.ts` defines `models` and `versions`.
- `convex/library.ts` owns generated-STL upload URLs, catalog seeding, saved versions, forks, and library listing.
- `src/LibraryPanel.tsx` owns the Save, Fork, Open, and dashboard library UI.
- `src/App.tsx` owns STL blob generation and saved-version rehydration.
