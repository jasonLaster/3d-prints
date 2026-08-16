# 3D Prints Specifications

This document defines the product and engineering contract for the 3D Prints app. Tests should fail when an implementation drifts from these expectations.

## Plate Table

- Fully parametric 76 × 38 × 30 in apronless table with a separate print-scale denominator.
- Rounded tabletop and leg geometry, separately adjustable outer and other-three post corner radii, an optional post-top groove/rabbet with its top roundover moved below the recessed band, a separate bottom post roundover, four independently adjustable leveling feet, four inset corner plates, and exactly three recessed C-channels are generated from numeric parameters.
- The default 1:10 mock is approximately 193 × 97 × 76 mm.
- See `docs/dining-table-audit-specifications.md` for the construction and audit contract.

## X-Hover Dining Table

- User-approved Double-X variation of the supplied 75 × 35.5 × 29.5 in oak Hover table.
- The top remains square-ended while normalized cubic Bézier controls shape only the two rolled long edges.
- Two sculpted closed end boxes use independent inner and outer radii plus rail-side and stile-side curve sweeps, an explicit zero-default bottom-spread parameter, and rounded face edges.
- Exactly four diagonal braces form two horizontal X assemblies between the end boxes: one directly against the tabletop underside and one directly on the floor.
- Every brace has a full-section planar angled end parallel and flush with the end-box inside face. Its complete cut face derives from and stays inward of the editable inner-corner tangent, so increasing the radius automatically pushes the X inward.
- Support bottom long edges are rounded over; lower supports also expose an independent top long-edge round-over. Flush end cuts and half-lap shoulders remain square.
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

Drill Bit Holder:

- A comma-delimited bit-size field adds, removes, and resizes blind-hole positions; it defaults to the ordered set 1/8, 5/32, 3/16, 1/4, 5/16, 3/8, and 1/2 inch.
- Shared total-diameter wiggle-room, horizontal bit-gap, and bit-to-edge margin controls derive the opening sizes and compact one-row box envelope; the largest listed bit derives the box width.
- Box height and hole depth preserve a printable blind floor; rounded corners and outer/hole-entry bevels remain associative.
- The audit recommends printing upright with the flat base on the build plate and holes facing up for continuous wall perimeters, round unsupported openings, and support-free blind holes.
- See `docs/drill-bit-holder-audit-specifications.md` for the full geometry and audit contract.

Handheld Router Mortise Jig:

- The printable set is one 220 × 120 mm guide plate plus two identical adjustable fence jaws; each jaw contains two blind M5 heat-set insert pockets.
- The guide opening derives from `mortise + guide-bushing diameter − cutter diameter + total template wiggle room` on both axes.
- Four common-mortise preset markers set 6 × 25, 8 × 30, 10 × 40, and 12 × 50 mm targets without hiding the underlying parameters.
- Adjustment slots span 20–80 mm workpieces, with physical witness marks at 38, 50, 64, and 76 mm stock widths.
- The router base, guide bushing, cutter, and sample stock are visible stand-ins in the assembled preview and are excluded from printable exports.
- The two deck rails, two cross-stops, two under-deck jaws, positioning bridge, centering base, and two centering fences download as ten individual support-free STL files.
- See `docs/router-mortise-jig-audit-specifications.md` for the full geometry, hardware, use, and audit contract.

Handheld Router Tenon Jig:

- The printable set is one 210 × 170 mm stepped base bridge, two adjustable cheek guides, and two adjustable edge guides; eight blind pockets receive M5 heat-set inserts.
- Each external bearing-guide opening derives from `target tenon + total fit allowance − guide-bearing diameter + cutter diameter`.
- Four common-tenon preset markers set 6 × 30 × 25, 8 × 40 × 30, 10 × 40 × 30, and 12 × 50 × 35 mm thickness × width × length targets without hiding the underlying parameters.
- Physical witness marks cover 6, 8, 10, and 12 mm thicknesses and 30, 40, 50, and 60 mm widths.
- One opposing guide pair seats in the recessed floor at a time, flush to the raised router-support platform; two M5 screws per guide prevent plate pivot.
- The 150 mm auxiliary sub-base stand-in reaches the active guide and raised platform throughout the configured range, while geometry-only 75 N base and guide screens check deflection and comparative stress margin.
- The router base, bearing bit, hose-band depth stop, heat-set inserts, finished tenon, and sample stock are visible stand-ins and excluded from printable exports.
- The bridge and four guides download as five individual support-free STL files.
- See `docs/router-tenon-jig-audit-specifications.md` for the full geometry, hardware, use, and audit contract.

Adjustable Fence Bandsaw Sled:

- The base, vertical sacrificial fence, and underside runner are wood fabrication parts; only two gusseted brackets and two captive-bolt knobs are printed.
- Two widely spaced slotted brackets move the wood fence fore/aft while preventing yaw around a single lock point.
- Printed bracket length adjusts through 8 in; each fence slot grows automatically while retaining 12 mm end webs, producing a 7.06 in slot at the maximum.
- The triangular gusset is independently adjustable and defaults to a shorter 62 mm run so a long bracket does not require a long, filament-heavy triangle.
- Four M5 bolts pass through the wood fence into heat-set inserts in the printed bracket backs; two M6 knob bolts lock into screw-in inserts in the wood base.
- The preview uses distinct wood, printed-plastic, steel, and brass materials and labels those materials directly in the viewer.
- Runtime checks cover continuous proportional slot growth, independent gusset limits, supporting base depth, bracket spacing, slot webs, insert floors/shoulders, bolt engagement, blade-path alignment, and conservative bracket stress/deflection screens.
- Four individual support-free STLs export the left/right brackets and left/right lock knobs; wood parts remain a cut-and-drill plan.
- See `docs/bandsaw-sled-audit-specifications.md` for the full fabrication, fastener, commissioning, and audit contract.

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
- Three blackened-steel widthwise C-channels occupy matching underside mortises: one centered and two symmetric between the end boxes. Their U-section web is exactly flush with the surrounding oak underside so upper supports remain on the original contact plane; at least half of each upper member retains direct oak bearing. Width, depth, wall, long-edge inset, and end-box clearance remain parametric.
- End-box width derives from tabletop width and side overhang, while the opening derives from box width, member widths, and rail heights.
- Inner and outer corner radii remain independently adjustable at the top and bottom of each box; each curve family has independent normalized rail-side and stile-side Bézier sweeps.
- Bottom spread is the only splay control and defaults to zero, matching the supplied orthographic drawing.
- Top support is selectable between the current X and the two original lengthwise stretchers. Bottom support is independently selectable between the current X, one centered lengthwise board, and nothing. Missing URL values preserve the X/X default.
- Top and bottom support members have independent width, thickness, bearing-zone inset, and bottom-edge-radius contracts. Lower supports also have an independent top-edge radius. Larger values grow only the matching box bearing members. X endpoints derive from their corresponding inner-corner tangencies; upper stretchers track the outside edge of the top end-box rail; the floor board remains centered.
- Angled brace ends are coplanar with the inside faces of the end boxes and migrate inward when inner radius, opening width, brace width, endpoint inset, or bottom spread changes.
- Each support bottom-edge-radius control rounds only its bottom long-edge pair. The lower support top-edge control independently rounds its top long-edge pair without rounding plan ends or centered half-lap shoulders.
- Selected top supports remain coplanar with the tabletop underside; selected floor supports remain coplanar with the floor. Neither contact condition has a gap control.
- Each selected X uses one centered half-lap with a nominal depth of half the brace thickness and no overlapping solid volume. Straight supports have no false lap.
- Assembled/Exploded mode separates the assembly into 14–16 fully profiled oak and steel pieces according to layout (16 for X/X), including three C-channels and the same curved boxes, true rounded support sections, contact ends, and conditional half-laps as the assembled geometry.
- Cut List mode pairs a six-to-nine-line grouped schedule with exact model-derived SVGs and edge-treatment or U-channel sections for the selected 14–16 pieces. Mock scale never changes fabrication values.
- Templates mode derives separate top-rail, bottom-rail, and mirrored vertical-stile routing patterns from the end-box outer/inner Bézier curves. Keeping both rail templates is required because their radii and finished profiles are independently editable. Each defaults to 1/8 in thickness, splits across an editable 9 in usable square plate span, and exports every complementary male/female dovetail segment as an individual full-size STL.
- The renderer uses procedural oak grain, but exports remain material-neutral geometry.

## Viewer Contract

- The primary viewer is a Three.js canvas with OrbitControls.
- Zoom, center, and parameter-reset controls remain available in the viewer rail.
- The orientation cube is a non-interactive indicator that reflects the current camera orientation without adding view-preset buttons.
- The top-right workspace actions menu owns Save, Fork, theme, and export, with Save/Fork name entry handled in a modal.
- Rendering modes include Solid, X-Ray, and Wire.
- X-Hover assembly mode switches between the assembled table and its selected 14–16-piece pre-assembly layout without resetting the camera.
- X-Hover Cut List is a third assembly mode and remains live under parameter and unit changes while preserving the assembled STL export.
- X-Hover Templates is a fourth assembly mode showing the plate-split routing patterns without changing camera state or the assembled table export.
- The viewer should remain nonblank after parameter edits, render-mode changes, unit changes, zoom, camera movement, reset, center view, and sidebar collapse.

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
- Plate Table export downloads same-origin `support-free-wood-color-1` and `support-free-hardware-color-2` STL files, flipped with the tabletop on the build plate and legs upward; the hardware file contains all four plates, three C-channels, and four independent leveling feet for multipart slicer import.
- The paper towel export includes the flush weighted center tube floor and rounded weighted center tube top.
- The generated STL snapshot used by Save/Fork follows the same geometry as Export.
- Simple Box provides a separate lid export whose registration skirt uses the same wall-derived clearance contract as stacking.
- X-Hover provides a routing-template STL-set export. Every file is flat, full-size, normalized to its own print origin, inside the selected square plate envelope, and uniquely names its template family and part index.
- Handheld Router Mortise Jig export downloads three current-parameter STL files: guide plate, left fence jaw, and right fence jaw. Preview-only router and stock geometry is never exported.
- Handheld Router Tenon Jig export downloads five current-parameter STL files: base bridge, left/right cheek guides, and front/rear edge guides. Preview-only router, bit, depth stop, hardware, and stock geometry is never exported.

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
