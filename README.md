# 3D Prints

Parametric React/Three.js viewers for printable 3D models.

## Models

Models are registered in `public/models/index.json`. Each model has its own
folder under `public/models/<model-id>/` with a `model.json` file and one or
more STL files.

Current models:

- `paper-towel-holder`
  - STL: `public/models/paper-towel-holder/paper-towel-holder.stl`
  - Config: `public/models/paper-towel-holder/model.json`
  - Audit script: `models/paper-towel-holder/audit.mjs`
- `japandi-tray`
  - STL: `public/models/japandi-tray/japandi-tray.stl`
  - Config: `public/models/japandi-tray/model.json`
  - Audit script: `models/japandi-tray/audit.mjs`

The model JSON owns the display name, STL URL, parameter definitions, audit
checks, dimension invariants, and associated scripts for that print.

## Dashboard And Persistence

The root route is a dashboard for opening catalog models and saved versions or
forks. Saved versions and forks are backed by Convex through the Vercel
Marketplace integration. The schema and functions live in `convex/`, and the
workspace header saves generated STL snapshots plus parameter state.

See `docs/convex-library.md` for the storage model, user flows, local setup, and
Vercel deployment command.

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm run audit
npm run audit -- japandi-tray
npm run test:e2e
npm run verify
npm run build:vercel
```

`docs/testing-and-audit-coverage.md` maps the original product requests to the
model audit scripts, app behavior, and Playwright coverage. The sampled
code/docs/tests cross-audit lives in `docs/line-coverage-audit.md`.
