# 3D Prints Specifications

This document defines the product and engineering contract for the 3D Prints app. Tests should fail when an implementation drifts from these expectations.

## Information Architecture

- The root route `/` is the model dashboard.
- The dashboard lists catalog models plus saved versions and forks.
- Opening a catalog model moves the app into the workspace route by setting `model=<model-id>` in the URL.
- The workspace contains a global header, the 3D viewer, a resizable right parameter sidebar, and a global footer.
- Model selection does not live in the sidebar. Returning to the dashboard is the model switching path.
- The sidebar is reserved for parameters, rendering options, model-specific controls, and audit output.

## URL State

- `model` selects the active catalog model.
- `unit` is one of `mm`, `cm`, or `in`.
- `theme` is one of `light` or `dark`.
- Parameter query values are always stored in millimeters, regardless of displayed unit.
- Dashboard state must not preserve stale model parameter keys when no model is selected.
- Opening a model from the dashboard starts from that model's defaults unless opening a saved version or an explicit model URL with matching parameter keys.
- Unknown model ids must render an actionable load error instead of a blank viewer.

## Model Catalog Contract

Each catalog model has a `public/models/<model-id>/model.json` file with:

- Stable `id`, `name`, `subtitle`, `description`, and supported `viewer`.
- An STL block with `fileName`, `sourceName`, `units: "mm"`, and public `url`.
- An export `filePrefix`.
- Viewer-specific `geometry` values used by morphing and runtime audit calculations.
- Parameter definitions with unique keys, labels, defaults, numeric limits, and positive steps.
- Audit definitions with tolerance, dimension targets, invariants, and runtime checks.
- Script definitions, including an audit script command.

## Parameter Contract

- Numeric inputs and sliders operate on the same millimeter source value.
- Unit controls are contextual text dropdowns inside each parameter row, not a separate toggle group.
- Changing one parameter row's unit changes the global unit display for the workspace.
- Inch inputs accept fractional values such as `1/8th in`, `1/4"`, and `2 1/2`.
- Values clamp to the active parameter limits.
- Dependent limits update immediately:
  - Paper towel holder diameter must stay at least `tubeDiameter + tubeToHolderDiameterClearance`.
  - Paper towel center tube diameter must stay no larger than `holderDiameter - tubeToHolderDiameterClearance`.
  - Tray floor thickness must stay below the selected wall height.

## Geometry Contract

The app must never solve parameter changes by uniformly scaling all axes.

Paper towel holder:

- Holder height changes remap the middle body span between fixed bottom and top bands.
- Holder diameter changes move the outer holder annulus radially.
- Center tube diameter changes remap the center tube radius independently.
- The center tube is designed as a sand-filled weight chamber.
- The top is rounded and remains tied to holder height and tube diameter.
- The original inlay overlay can be toggled for visual comparison.

Japandi tray:

- Length and width change independently.
- Wall height changes on the Z axis without changing selected length or width.
- Floor thickness remaps the lower floor band independently from wall height.
- Rib relief scales the side texture within configured printable limits.
- The original STL overlay can be toggled for visual comparison.

## Viewer Contract

- The primary viewer is a Three.js canvas with OrbitControls.
- Pan and zoom controls remain available in the viewer.
- Footer controls own orientation presets, reset, frame, and export.
- Orientation presets include isometric, top, X-edge, and Y-edge views.
- Rendering modes include Solid, X-Ray, and Wire.
- The viewer should remain nonblank after parameter edits, render-mode changes, unit changes, pan/zoom, orientation presets, reset, and frame.

## Persistence Contract

- Convex stores catalog model records and saved version/fork records.
- Save and Fork controls live in the workspace header.
- Saves and forks include model id, model name, params, unit, theme, generated STL storage id, and file name when the viewer is loaded.
- Forking an active saved version records the parent version id.
- The dashboard opens saved versions and restores model, params, unit, theme, URL state, and active version id.
- Arbitrary STL upload is intentionally unsupported until the app has generic model metadata capture, safe validation, parameter schema authoring, and audit setup.

## Export Contract

- Export downloads the current generated STL, not the untouched source STL.
- Export file names include the model export prefix and active parameter values.
- The paper towel export includes the rounded weighted center tube top.
- The generated STL snapshot used by Save/Fork follows the same geometry as Export.

## Accessibility And Responsiveness

- Interactive controls must have accessible names.
- Icon buttons must expose text labels or `aria-label`.
- The sidebar resizer is keyboard reachable and supports min/max keyboard commands.
- The dashboard and workspace must work on desktop and mobile viewports.
- Mobile hides the sidebar resize rail and stacks the workspace layout.

## Non-Goals

- Arbitrary STL upload.
- Per-vertex mesh editing in the browser.
- Persisting unsaved draft params outside the URL.
- Replacing slicer validation. The app provides parameterized geometry and audit cues, but final print readiness still requires slicer inspection.
