# Convex Library Persistence

The `3d-prints` Vercel project is connected to Convex through the Vercel Marketplace resource `convex-cinereous-park`. The integration provisions `CONVEX_DEPLOY_KEY` for Vercel builds and local deployment commands.

## Runtime Model

Convex stores two kinds of library records:

- `models`: source catalog entries and uploaded STL assets.
- `versions`: saved parameter states and forks for source models.

Uploaded and generated STL files are stored in Convex File Storage. A saved version contains both the parameter snapshot and, when the viewer has finished loading, a generated STL snapshot for download.

## User Flows

- Save: uploads the current generated STL to Convex Storage and inserts a `versions` record with model id, params, unit, theme, and file name.
- Fork: creates a new version with `source: "fork"` and links to the active saved version when one is open.
- Upload STL: uploads an arbitrary `.stl` file and stores it as an uploaded model asset in the library.
- Open: rehydrates a saved version into the viewer by restoring model, unit, theme, params, URL state, and active version id.
- Library view: shows saved versions, forks, uploaded STL assets, source-model counts, and direct STL links.

## Local Development

The React app enables Convex only when `VITE_CONVEX_URL` is present. Without that variable the Library section still renders a setup note, so local builds and Playwright tests remain deterministic.

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
- `convex/library.ts` owns upload URLs, catalog seeding, saved versions, forks, uploaded models, and library listing.
- `src/LibraryPanel.tsx` owns the Save, Fork, Upload STL, Open, and library-list UI.
- `src/App.tsx` owns STL blob generation and saved-version rehydration.
