# 3D Prints Specifications

This document defines the product and engineering contract for the 3D Prints app. Tests should fail when an implementation drifts from these expectations.

## Information Architecture

- The root route `/` opens the default model workspace and writes `model=<model-id>` into the URL.
- The workspace left sidebar lists catalog models and saved versions scoped to the selected model.
- Opening a catalog model from the sidebar moves the app into that model by setting `model=<model-id>` in the URL.
- The workspace contains a global header, a collapsible and resizable model sidebar, the 3D viewer, and a collapsible and resizable right parameter inspector.
- Model selection lives in the left sidebar; the dashboard route is not part of the default product surface.
- The inspector is reserved for parameters, rendering options, model-specific controls, and audit output.

## URL State

- `model` selects the active catalog model.
- `unit` is one of `mm`, `cm`, or `in`.
- Parameter query values are always stored in millimeters, regardless of displayed unit.
- Root model selection must not preserve stale parameter keys when no model is selected.
- Opening a model from the sidebar starts from that model's defaults unless opening a saved version or an explicit model URL with matching parameter keys.
- Unknown model ids must render an actionable load error instead of a blank viewer.

## Preference State

- `theme` is one of `light` or `dark` and is stored in localStorage under `3d-prints:theme`.
- Theme is not encoded in the URL and must stay unchanged when switching catalog models or opening saved versions.

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
- Up and Down arrow keys step inch inputs on a magnitude-aware fractional grid: `1/32"` below half an inch, `1/16"` below one inch, and `1/8"` at one inch and above.
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
- The center tube is designed as a bottom-closed sand-filled weight chamber, with the chamber floor flush to the holder base.
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
- Zoom, center, and parameter-reset controls remain available in the viewer rail.
- The orientation cube owns isometric, top, X-edge, and Y-edge presets, reflects the current camera orientation, and clears its active preset after free camera movement.
- The top-right workspace actions menu owns Save, Fork, theme, and export, with Save/Fork name entry handled in a modal.
- Rendering modes include Solid, X-Ray, and Wire.
- The viewer should remain nonblank after parameter edits, render-mode changes, unit changes, zoom, orientation presets, reset, center view, and sidebar collapse.

## Persistence Contract

- Convex stores catalog model records and saved version/fork records.
- Save and Fork controls live in the top-right workspace actions menu.
- Saves and forks include model id, model name, params, unit, the current theme for compatibility metadata, generated STL storage id, and file name when the viewer is loaded.
- Forking an active saved version records the parent version id.
- The saved-versions sidebar tab opens versions for the selected model and restores model, params, unit, URL state, and active version id while preserving the current local theme preference.
- Arbitrary STL upload is intentionally unsupported until the app has generic model metadata capture, safe validation, parameter schema authoring, and audit setup.

## Export Contract

- Export downloads the current generated STL, not the untouched source STL.
- Export file names include the model export prefix and active parameter values.
- The paper towel export includes the flush weighted center tube floor and rounded weighted center tube top.
- The generated STL snapshot used by Save/Fork follows the same geometry as Export.

## Accessibility And Responsiveness

- Interactive controls must have accessible names.
- Icon buttons must expose text labels or `aria-label`.
- The sidebar resizers are keyboard reachable and support min/max keyboard commands.
- Both desktop sidebars can collapse without hiding or displacing the 3D canvas.
- The workspace must work on desktop and mobile viewports.
- Mobile hides resize rails and stacks the workspace layout.

## Non-Goals

- Arbitrary STL upload.
- Per-vertex mesh editing in the browser.
- Persisting unsaved draft params outside the URL.
- Replacing slicer validation. The app provides parameterized geometry and audit cues, but final print readiness still requires slicer inspection.
