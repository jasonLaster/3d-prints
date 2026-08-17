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
- `simple-box`
  - STL: `public/models/simple-box/simple-box.stl`
  - Config: `public/models/simple-box/model.json`
  - Audit script: `models/simple-box/audit.mjs`
  - Source generator: `models/simple-box/generate-source.mjs`
- `door-lock-adapter`
  - STL: `public/models/door-lock-adapter/door-lock-adapter.stl`
  - Config: `public/models/door-lock-adapter/model.json`
  - Audit script: `models/door-lock-adapter/audit.mjs`
  - Source generator: `models/door-lock-adapter/generate-source.mjs`
- `compact-wall-bracket`
  - STLs: `public/models/compact-wall-bracket/compact-wall-bracket-*.stl`
  - Config: `public/models/compact-wall-bracket/model.json`
  - Retained source: `models/compact-wall-bracket/reference/obj_4_Corpo_04_(2).stl`
  - Audit script: `models/compact-wall-bracket/audit.mjs`
  - Source generator: `models/compact-wall-bracket/generate-source.mjs`
- `pipe-wall-mount`
  - Reference STL: `public/models/pipe-wall-mount/Strong_Universal_Wall_Hook_VCD.stl`
  - Generated default STL: `public/models/pipe-wall-mount/variable-pipe-wall-mount-default.stl`
  - Config: `public/models/pipe-wall-mount/model.json`
  - Retained source: `models/pipe-wall-mount/reference/Strong_Universal_Wall_Hook_VCD.stl`
  - Audit script: `models/pipe-wall-mount/audit.mjs`
  - Source generator: `models/pipe-wall-mount/generate-source.mjs`
- `drill-bit-holder`
  - STL: `public/models/drill-bit-holder/drill-bit-holder.stl`
  - Config: `public/models/drill-bit-holder/model.json`
  - Audit script: `models/drill-bit-holder/audit.mjs`
  - Source generator: `models/drill-bit-holder/generate-source.mjs`
- `router-mortise-jig`
  - STLs: `public/models/router-mortise-jig/router-mortise-jig-*.stl`
  - Config: `public/models/router-mortise-jig/model.json`
  - Audit script: `models/router-mortise-jig/audit.mjs`
  - Source generator: `models/router-mortise-jig/generate-source.mjs`
- `router-tenon-jig`
  - STLs: `public/models/router-tenon-jig/router-tenon-jig-*.stl`
  - Config: `public/models/router-tenon-jig/model.json`
  - Audit script: `models/router-tenon-jig/audit.mjs`
  - Source generator: `models/router-tenon-jig/generate-source.mjs`

The model JSON owns the display name, STL URL, parameter definitions, audit
checks, dimension invariants, and associated scripts for that print.

## Woodworking Models

The Plate Table, Whisperer, X-Hover, The Wave, and Concentric Tube Jig now live
in the focused [Jig](https://jig.jlast.io) project. They are no longer part of
the 3D Prints catalog.

## Workspace And Persistence

The root route opens the default model workspace. Catalog models live in the
left sidebar, and saved versions or forks are scoped to the selected model.
Saved versions and forks are backed by Convex through the Vercel Marketplace
integration. The schema and functions live in `convex/`, and the workspace
actions menu saves generated STL snapshots plus parameter state.

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
npm run audit -- simple-box
npm run audit -- door-lock-adapter
npm run audit -- compact-wall-bracket
npm run audit -- pipe-wall-mount
npm run audit -- drill-bit-holder
npm run audit -- router-mortise-jig
npm run audit -- router-tenon-jig
npm run test:e2e
npm run verify
npm run build:vercel
```

`docs/specifications.md` defines the product and engineering contract.
`docs/test-plan.md` defines the release gates. `docs/testing-and-audit-coverage.md`
maps the original product requests to the model audit scripts, app behavior, and
Playwright coverage. The sampled code/docs/tests cross-audit lives in
`docs/line-coverage-audit.md`.
