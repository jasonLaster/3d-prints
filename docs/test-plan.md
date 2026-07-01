# Test Plan

This test plan describes what must be covered before a change is pushed or deployed.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Model audit scripts | `npm run audit` | Validate catalog discovery, model JSON, STL presence, source dimensions, parameter limits, and model-specific invariants. |
| TypeScript and production build | `npm run build` | Validate type safety and Vite production bundling. |
| Browser E2E | `npm run test:e2e` | Validate dashboard, workspace, viewer, controls, URL state, export, responsive layout, and static contracts. |
| Full local gate | `npm run verify` | Run model audits, build, and all local Playwright tests. |
| Live Convex persistence | `VITE_CONVEX_URL=<url> npx playwright test tests/e2e/app.spec.ts -g "saves and forks"` | Validate Save/Fork writes against a real Convex deployment. |
| Production smoke | Playwright or browser against the Vercel alias | Validate the deployed dashboard, model opening, viewer render, and footer actions. |

## Functional Coverage Matrix

| Area | Required Coverage |
| --- | --- |
| Dashboard | Root route loads without a canvas, lists all catalog models, lists saved versions/forks when Convex is enabled, opens a model, and does not expose arbitrary upload. |
| Workspace Header | Dashboard navigation, Save, Fork, theme toggle, and Convex-disabled setup note. |
| Workspace Sidebar | Parameter controls, weighted-center controls only for paper towel holder, rendering modes, original overlay, and audit rows. |
| Workspace Footer | Orientation presets, Reset, Frame, and Export. |
| URL State | Model selection, unit, theme, millimeter params, unknown model errors, dashboard param cleanup, and saved-version rehydration. |
| Units | Millimeters, centimeters, inches, fractional inches, global unit switching, and stable URL millimeter values. |
| Parameter Limits | Static limits plus dependent holder tube/diameter limits and tray floor/height limits. |
| Viewer | Nonblank canvas after load, parameter edit, render mode, original overlay, pan, zoom, orientation, reset, and frame. |
| Export | Download starts, file name includes model prefix and parameter keys, and generated STL is non-empty. |
| Persistence | Convex schema/functions, Save, Fork, parent version link, dashboard list, saved-version open, and no arbitrary STL upload mutation. |
| Accessibility | Accessible labels for controls, native `select` regressions rejected, keyboard sidebar rail, mobile layout. |
| Specifications | Product specs and audit docs stay in sync with executable coverage. |

## Release Gate

Before pushing or deploying:

```bash
npm run verify
```

When persistence behavior changes, also run the live Convex slice:

```bash
VITE_CONVEX_URL=https://pleasant-chameleon-464.convex.cloud \
  npx playwright test tests/e2e/app.spec.ts -g "saves and forks"
```

After deployment, verify production:

- `/` renders `Model Library`.
- A catalog model opens from the dashboard.
- The 3D viewer renders a nonblank canvas.
- Footer actions are present.
- Save/Fork appear when production Convex env vars are active.
