# Testing and Audit Coverage

This project has three verification layers:

- Model audit scripts validate static model JSON, STL presence, source STL measurements, parameter limits, and model-specific invariant lists.
- Playwright tests validate the running React app, including the default workspace, sidebar model/version navigation, 3D canvas, controls, URL state, unit conversion, themes, and sidebar resizing.
- Product specifications and test-plan docs define the acceptance contract and release gates.
- Cross-audit notes compare selected lines in docs, tests, and code so each sampled behavior has written intent, implementation, and executable coverage.

## Request Coverage Matrix

| Request | Documentation Source | Executable Coverage |
| --- | --- | --- |
| View STL models in a Vite React app | README model list; model JSON `stl.url` fields | Playwright loads each catalog model and verifies a nonblank 3D canvas |
| Paper towel holder height and diameter controls must not uniformly scale unrelated dimensions | `docs/audit-specifications.md`; paper towel holder `audit.invariants` | Model audit script checks parameter definitions, source STL dimensions, and holder-specific runtime audit keys |
| Paper towel holder center tube holds sand with a flush base floor and rounded top instead of a cap | `docs/audit-specifications.md`; paper towel holder `geometry` and `audit.checks` | Playwright verifies weighted center controls and audit rows for sand chamber, flush sand floor, estimated sand mass, rounded top, and center tube diameter |
| Tube diameter is independently parameterized | Paper towel holder model JSON `tubeDiameter` parameter | Playwright changes center tube diameter and verifies the URL and audit panel update without switching the holder diameter control |
| Units default to inches and switch between millimeters, centimeters, and inches | README validation section; this coverage document | Playwright verifies a unit-less root URL becomes `unit=in`, then changes units through the inline unit select and verifies status, inputs, and URL `unit` state |
| Imperial fractions such as `1/8th in` are accepted | This coverage document | Playwright enters `1/8th in`, `1 1/8"`, and arrow-key stepped inch values for Japandi tray controls, then verifies URL state plus fractional display |
| Unit control appears as contextual text with a caret, not a boxed standalone toggle group | This coverage document; `src/styles.css` `.unit-select-trigger` | Playwright verifies unit comboboxes exist inside parameter rows and no native `select` elements are used |
| Upper parameter limits are generous enough for larger paper towel rolls and trays | Model JSON parameter limits | Model audit scripts assert defaults are inside the expanded limits; Playwright verifies controls expose max values through range inputs |
| Sidebar shows models and selected-model saved versions | README model list; `docs/convex-library.md` | Playwright verifies sidebar model buttons, saved-version section behavior, and opening a model from the sidebar |
| Save, Fork, theme, and export are organized in the top-right actions menu | `docs/convex-library.md`; this coverage document | Playwright verifies the one-column actions menu owns persistence, theme, export, and click-away dismissal |
| Plate Table exports as a registered support-free two-color STL set | Plate Table model JSON and `docs/dining-table-audit-specifications.md` | Playwright downloads and parses the wood color-1 and plate/C-channel/four-foot hardware color-2 STLs, verifies finite nondegenerate triangles, confirms the broad tabletop face is on the build plate, and checks shared coordinate registration |
| Plate Table exposes a live apronless-structure screen | Plate Table model JSON and `docs/dining-table-audit-specifications.md` | Geometry tests bound all grades and prove monotonic height, post, plate, channel-distribution, and independent-leveling behavior. Browser coverage verifies six visible scores, four leg-specific foot controls with URL persistence, model-specific formula links and inputs, ±1 in sensitivity, and a lower score after increasing only overall height. |
| Hover table preserves the supplied tabletop, end boxes, and original-stretcher option while adding independent support layouts | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Geometry tests exercise all six top/bottom combinations: upper X or two radius-derived original stretchers, plus floor X, one centered board, or nothing. Assertions retain box-parallel support end faces, independent rounded member sections, conditional half-laps, direct tabletop/floor contact, and finite nondegenerate envelopes. |
| X-Hover tabletop has three recessed widthwise C-channels | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Geometry tests require one centered and two symmetric nondegenerate steel U-sections, matching oak mortises, flush underside webs, rolled-edge clearance, and associative width/depth/wall/inset/box-clearance controls. |
| X-Hover table has a pre-assembly exploded mode | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Geometry tests require 14–16 finite nondegenerate named pieces according to the selected supports, with one mortised profiled top, three steel channels, four Bézier rails, four tangent-seam stiles, and true X/stretcher/center-board profiles. Browser coverage verifies variant counts and camera preservation. |
| X-Hover table has a dimensioned fabrication sheet | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Cut-list tests require six to nine grouped lines totaling the selected 14–16 pieces, full-size finished dimensions invariant under mock scale, exact constrained SVG profiles, curved or U-channel section views, material, grain direction where applicable, rail radii/tensions, and joinery only where applicable. |
| X-Hover end-box profiles can be fabricated from segmented printed routing templates | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Geometry tests derive independent top-rail and bottom-rail templates plus a mirrored vertical-stile template from the frame Béziers, require 1/8 in thickness, finite nondegenerate triangles, per-file print-origin normalization, complementary male/female joints, unique STL names, and both planar dimensions within the editable plate span. Browser coverage opens Templates mode and downloads the complete multi-STL set. |
| X-Hover exposes a live wobble and stability screen | Hover table model JSON and `docs/hover-dining-table-audit-specifications.md` | Geometry tests bound all grades and prove monotonic height, end-box, triangulation, and floor-contact behavior. Browser coverage verifies six visible scores, the overall grade, and a lower score after increasing only overall height. |
| Orientation cube is a non-interactive camera indicator | This coverage document | Playwright verifies the cube has no buttons, preserves orientation across parameter edits, follows free camera movement, and leaves the canvas nonblank with no page errors |
| Zoom, reset, and center controls remain easy to use in 3D | This coverage document | Playwright clicks viewer-rail zoom, reset, and center controls and verifies the canvas remains nonblank with no page errors |
| Rendering options include a solid view plus alternate inspection modes | This coverage document | Playwright selects Solid, X-Ray, and Wire and verifies the active state and viewer status |
| Original inlay/source overlay can be toggled | Model JSON audit invariant for source reference; this coverage document | Playwright toggles Original inlay/STL and verifies the control state survives the interaction |
| App supports multiple STLs with per-model JSON for parameters, audit, and scripts | README model structure; each model `model.json` | Model audit runner discovers catalog entries and executes each declared model audit script; Playwright opens catalog models from the sidebar |
| Japandi tray supports width, length, height, floor thickness, rib relief, and rotation | `docs/japandi-tray-audit-specifications.md`; Japandi tray model JSON | Model audit script checks all six parameters; Playwright verifies visible parameter controls, rotation URL state, and the default-off orientation-control flag |
| Simple Box remains smooth, watertight, stackable, and independently divided | `docs/simple-box-audit-specifications.md`; Simple Box model JSON | Source audit checks finite coordinates, topology, connected components, volume, and bounds; Playwright checks UI defaults plus generated STL topology and dimensions |
| Door lock adapter matches the supplied tube, collar, triangular key, and angle-adjustable slot dimensions | `docs/door-lock-adapter-audit-specifications.md`; Door Lock Adapter model JSON | Source audit checks defaults, feature relationships, manifold topology, and bounds; Playwright checks all ten controls, the 4 mm notch width, the 90-degree perpendicular default, live updates, and exported STL dimensions |
| Drill Bit Holder defaults to the seven requested fractional sizes and uses one comma-delimited field to add, remove, or resize holes for the next print | `docs/drill-bit-holder-audit-specifications.md`; Drill Bit Holder model JSON | Source audit checks the requested defaults, editable list limits, derived envelope, blind-hole floor, printable webs, manifold topology, and bounds; focused Playwright adds and removes entries, then checks geometry, reloadable URL state, audit rows, canvas rendering, and STL export |
| Handheld Router Mortise Jig derives its opening from the mortise, cutter, and guide bushing | `docs/router-mortise-jig-audit-specifications.md`; router-mortise-jig model JSON | Source audit checks guide-opening math, M5 heat-set pockets, rail support, 150 N strength screen, three assembly setups, and all ten manifold STL files; focused Playwright checks presets, dependent limits, preview-only hardware, URL state, rendering, and ten individual downloads |
| Handheld Router Tenon Jig derives external guide openings from the tenon, cutter, and bearing | `docs/router-tenon-jig-audit-specifications.md`; router-tenon-jig model JSON | Source audit checks both sequential flush assemblies, full-range two-bolt travel, eight blind M5 heat-set pockets, fastener stack-up, router support, base/guide strength screens, witness marks, shoulders, and all five manifold STL files; focused Playwright checks both guide-pair previews, coplanarity, cutter/stock orientation, presets, coupled limits, responsive rendering, URL state, and five individual downloads |
| Adjustable Fence Bandsaw Sled separates wood fabrication from printed locking hardware | `docs/bandsaw-sled-audit-specifications.md`; bandsaw-sled model JSON | Source audit checks the wood cut plan, 8 in bracket range, independent gusset length, supporting base depth, two-bracket anti-yaw spacing, continuous slot travel, M5 heat-set and M6 wood-insert stack-ups, bracket strength/deflection screens, and all four manifold STL files; focused Playwright checks the 8 in / 4 in extreme, four-material legend, live fence travel, reloadable URL state, audit rows, and four individual downloads |
| Dark theme is available | This coverage document | Playwright toggles the theme, verifies `html.dark`, verifies localStorage persistence, and verifies model switching keeps the selected theme |
| Parameter state is saved in the URL | This coverage document | Playwright changes parameters and units, reloads from a URL, verifies controls rehydrate from query params, and migrates legacy split-X/shared-radius links to the canonical grouped controls |
| Sidebars have collapsible and resizable rails | This coverage document | Playwright drags the model-library and inspector separators, checks width and localStorage, tests keyboard resize, collapses both rails, and verifies the canvas remains visible |
| Convex library stores saved versions and forks | `docs/convex-library.md`; Convex schema and functions | Static Playwright checks require Convex schema/functions/docs; app tests verify Save/Fork controls and selected-model saved-version sections |
| Comprehensive specifications and test plan stay current | `docs/specifications.md`; `docs/test-plan.md` | Static Playwright checks require the specs, test layers, release gate, and non-goals to stay documented |

## Playwright Coverage Contract

The Playwright suite should fail if:

- Any cataloged model cannot load its config, STL, inspector, audit rows, or 3D canvas.
- A model parameter cannot be edited through its range or text input.
- A parameter edit does not update the URL using millimeter values.
- Unit selection does not update visible values and URL state.
- Fractional inches do not parse for inch-mode text inputs.
- Signed fractional dimensions do not remain editable for explicit hypotheses such as end-frame bottom spread.
- Dark theme does not update the document class, localStorage preference, or remain stable across model changes.
- The shadcn/Radix select UI regresses to native `select` elements.
- Rendering, X-Hover assembled/exploded/cut-list/templates switching, weighted-center, original-overlay, actions menu, viewer camera controls, cube orientation, or zoom controls throw page errors or leave the canvas blank.
- Sidebar rails cannot be resized or collapsed without preserving the canvas.
- Convex library schema, functions, and documentation are missing or drift from the Save/Fork/Open flows.
- Arbitrary STL upload support reappears without the required metadata, validation, and audit plumbing.
- Static model audit docs, model JSON checks, and Playwright tests drift out of alignment.

## Manual Release Gate

Before publishing or pushing a meaningful app change, run:

```bash
npm run verify
```

This command runs model audits, TypeScript plus Vite production build, and the full Playwright suite.
