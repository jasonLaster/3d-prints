# Test Plan

This test plan describes what must be covered before a change is pushed or deployed.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Model audit scripts | `npm run audit` | Validate catalog discovery, model JSON, STL presence, source dimensions, parameter limits, and model-specific invariants. |
| TypeScript and production build | `npm run build` | Validate type safety and Vite production bundling. |
| Browser E2E | `npm run test:e2e` | Validate workspace, sidebar model/version navigation, viewer controls, URL state, export, responsive layout, and static contracts. |
| Full local gate | `npm run verify` | Run model audits, build, and all local Playwright tests. |
| Live Convex persistence | `VITE_CONVEX_URL=<url> npx playwright test tests/e2e/app.spec.ts -g "saves and forks"` | Validate Save/Fork writes against a real Convex deployment. |
| Production smoke | Playwright or browser against the Vercel alias | Validate the deployed default workspace, model switching, viewer render, and actions menu. |

## Functional Coverage Matrix

| Area | Required Coverage |
| --- | --- |
| Workspace Shell | Root route opens the default model workspace, lists all catalog models in the sidebar, and does not expose arbitrary upload. |
| Workspace Header | One actions menu for Save, Fork, theme, Reset, Frame, Export, and Convex-disabled setup note. |
| Model Sidebar | Catalog model switching, collapsible/resizable behavior, and saved versions scoped to the selected model. |
| Workspace Inspector | Parameter controls, weighted-center controls only for paper towel holder, rendering modes, original overlay, and audit rows. |
| URL State | Model selection, unit, theme, millimeter params, unknown model errors, root param cleanup, and saved-version rehydration. |
| Units | Millimeters, centimeters, inches, fractional inches, global unit switching, and stable URL millimeter values. |
| Parameter Limits | Static limits plus dependent holder tube/diameter limits and tray floor/height limits. |
| Viewer | Nonblank canvas after load, parameter edit, render mode, original overlay, zoom, cube orientation, reset, and frame. |
| Export | Download starts, file name includes model prefix and parameter keys, and generated STL is non-empty. |
| Persistence | Convex schema/functions, Save, Fork, parent version link, selected-model saved-version list, saved-version open, and no arbitrary STL upload mutation. |
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

- `/` renders the default model workspace.
- A catalog model opens from the sidebar.
- The 3D viewer renders a nonblank canvas.
- Actions menu commands are present.
- Save/Fork appear when production Convex env vars are active.
