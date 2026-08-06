# 3D Prints Specifications

This document defines the product and engineering contract for the 3D Prints app. Tests should fail when an implementation drifts from these expectations.

## Oak Dining Table

- Fully parametric 76 × 38 × 30 in apronless table with a separate print-scale denominator.
- Rounded tabletop and leg geometry, separately adjustable outer and other-three post corner radii, an optional post-top groove/rabbet with its top roundover moved below the recessed band, a separate bottom post roundover, four inset corner plates, and exactly three recessed C-channels are generated from numeric parameters.
- The default 1:10 mock is approximately 193 × 97 × 76 mm.
- See `docs/dining-table-audit-specifications.md` for the construction and audit contract.

## X-Hover Dining Table

- User-approved Double-X variation of the supplied 75 × 35.5 × 29.5 in oak Hover table.
- The top remains square-ended while normalized cubic Bézier controls shape only the two rolled long edges.
- Two sculpted closed end boxes use independent inner and outer radii and curve tensions, an explicit zero-default bottom-spread parameter, and rounded face edges.
- Exactly four diagonal braces form two horizontal X assemblies between the end boxes: one directly against the tabletop underside and one directly on the floor.
- Every brace has a full-section planar angled end parallel and flush with the end-box inside face. Its complete cut face derives from and stays inward of the editable inner-corner tangent, so increasing the radius automatically pushes the X inward.
- Brace top and bottom long edges are rounded over, while the flush end cuts and half-lap shoulders remain square.
- Each X crosses at the table center with a derived 50/50 half-lap. Both boards retain full plan width, complementary half-depth pockets preserve one continuous assembled thickness, and there are no parallel lengthwise stretchers, hover pads, or spacer gaps.
- See `docs/hover-dining-table-audit-specifications.md` for the evidence and invariant contract.

## Information Architecture

- The root route `/` opens the default model workspace and writes `model=<model-id>` into the URL.
- The workspace left sidebar lists catalog models and saved versions scoped to the selected model.
- Opening a catalog model from the sidebar moves the app into that model by setting `model=<model-id>` in the URL.
- The workspace contains a global header, a collapsible and resizable model sidebar, the 3D viewer, and a collapsible and resizable right parameter inspector.
- Model selection lives in the left sidebar; the dashboard route is not part of the default product surface.
- The inspector is reserved for parameters, rendering options, model-specific controls, and audit output.

## URL State

- `model` selects the active catalog model.
- `unit` is one of `mm`, `cm`, or `in`; new URLs default to `in` when it is omitted.
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
- Workspaces display inches by default while retaining millimeters as the geometry source of truth.
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

Simple box:

- The simple box is a separate catalog model with its own smooth rectangular source STL and `simple-box-v1` viewer contract.
- It has no rib texture or rib-relief parameter.
- It defaults to `13 x 3 x 3.5 in`, dividers at `5.75 in` and `9 in`, and the same adjustable stacking/lid-registration lip behavior.
- Divider positions can be edited, added, and removed independently of the Japandi tray model.
- Assembly proof views show a seated stacked pair and a fitted lid.
- The lid is a separate printable STL with an adjustable plate thickness, engagement depth, and per-side fit clearance.
- A combined box-and-lid STL places the two disconnected print shapes beside each other with a `10 mm` gap.
- The original STL overlay can be toggled for visual comparison.

Door lock adapter:

- The adapter is a separate procedural catalog model with a 9.3 mm diameter by 23 mm tube.
- A centered 10.3 mm square collar runs 10.9 mm along the tube axis. The single supplied box width controls both collar cross-sectional axes.
- A centered triangular key ridge defaults to 4 mm wide, extends 1.5 mm from one collar face, and runs 10.9 mm along the tube axis.
- A centered 3 mm by 7.3 mm rectangular slot passes through the tube. Its angle is adjustable from 0 to 180 degrees and defaults to 90 degrees, perpendicular to the keyed collar face.
- Tube, collar, ridge, and cutout dimensions are independently editable in the inspector while dynamic limits preserve the collar fit and minimum tube wall.
- Generated and exported geometry must remain one closed manifold shell.

Concentric tube jig:

- The jig is one coaxial, stepped tube stack rather than loose gauges: nine default steps run from `3/4 in` to `1 1/4 in` inclusive.
- Each adjacent outside diameter increases by `1/16 in`, and each step is `1/4 in` tall, for a `2 1/4 in` overall default height.
- The default `1/2 in` shared through-bore keeps all tubes concentric and leaves a `1/8 in` radial wall at the smallest step.
- The tube-step exteriors are clean and uninterrupted, with no markings or recesses.
- The stack ships with the `1 1/4 in` step on the build plate; each successive step narrows upward, so it prints without support.

X-Hover Dining Table:

- Full-size dimensions remain independent from the manipulation-model scale.
- Tabletop length and width drive a planar square-ended extrusion; the long-edge profile uses a normalized cubic Bézier handle function.
- End-box width derives from tabletop width and side overhang, while the opening derives from box width, member widths, and rail heights.
- Inner and outer corner radii and Bézier tensions remain independently adjustable.
- Bottom spread is the only splay control and defaults to zero, matching the supplied orthographic drawing.
- Upper and lower X endpoints, diagonal lengths, and equal-and-opposite plan angles derive from the straight-rail tangencies beyond the end-box inner corner curves; both crossings remain fixed at the table origin.
- Angled brace ends are coplanar with the inside faces of the end boxes and migrate inward when inner radius, opening width, brace width, endpoint inset, or bottom spread changes.
- Upper and lower brace edge-radius controls round over both long-edge pairs without rounding the plan ends or the centered half-lap shoulders.
- Upper-X top faces remain coplanar with the tabletop underside, and lower-X bottom faces remain coplanar with the floor. Neither direct-contact condition has a gap control.
- Each X uses one centered half-lap with a nominal depth of half the brace thickness and no overlapping solid volume.
- An Assembled/Exploded viewer mode separates the glue-up into exactly 13 oak pieces: one tabletop, four rail-and-stile bars per end box, and two bars per X. The offsets are presentation-only and do not alter export geometry.
- Cut List mode pairs an eight-line grouped parts schedule with dimensioned true-shape SVGs. It uses full-size finished dimensions, quantities, grain direction, end-cut angles, and centered half-lap width/depth/location; mock scale never changes fabrication values.
- The renderer uses procedural oak grain, but exports remain material-neutral geometry.

## Viewer Contract

- The primary viewer is a Three.js canvas with OrbitControls.
- Zoom, center, and parameter-reset controls remain available in the viewer rail.
- The orientation cube owns isometric, top, X-edge, and Y-edge presets, reflects the current camera orientation, and clears its active preset after free camera movement.
- The top-right workspace actions menu owns Save, Fork, theme, and export, with Save/Fork name entry handled in a modal.
- Rendering modes include Solid, X-Ray, and Wire.
- X-Hover assembly mode switches between the assembled table and its 13-piece pre-glue-up layout without resetting the camera.
- X-Hover Cut List is a third assembly mode and remains live under parameter and unit changes while preserving the assembled STL export.
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
- Dining Table export downloads same-origin `support-free-wood-color-1` and `support-free-hardware-color-2` STL files, flipped with the tabletop on the build plate and legs upward; the hardware file contains all four plates and three C-channels for multipart slicer import.
- The paper towel export includes the flush weighted center tube floor and rounded weighted center tube top.
- The generated STL snapshot used by Save/Fork follows the same geometry as Export.
- Simple Box provides a separate lid export whose registration skirt uses the same wall-derived clearance contract as stacking.

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
