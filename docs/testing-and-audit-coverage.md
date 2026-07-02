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
| Paper towel holder center tube holds sand and has a rounded top instead of a cap | `docs/audit-specifications.md`; paper towel holder `geometry` and `audit.checks` | Playwright verifies weighted center controls and audit rows for sand chamber, estimated sand mass, rounded top, and center tube diameter |
| Tube diameter is independently parameterized | Paper towel holder model JSON `tubeDiameter` parameter | Playwright changes center tube diameter and verifies the URL and audit panel update without switching the holder diameter control |
| Units switch between millimeters, centimeters, and inches | README validation section; this coverage document | Playwright changes units through the inline unit select and verifies status, inputs, and URL `unit` state |
| Imperial fractions such as `1/8th in` are accepted | This coverage document | Playwright enters `1/8th in` for Japandi tray floor thickness and verifies a millimeter URL parameter plus fractional display |
| Unit control appears as contextual text with a caret, not a boxed standalone toggle group | This coverage document; `src/styles.css` `.unit-select-trigger` | Playwright verifies unit comboboxes exist inside parameter rows and no native `select` elements are used |
| Upper parameter limits are generous enough for larger paper towel rolls and trays | Model JSON parameter limits | Model audit scripts assert defaults are inside the expanded limits; Playwright verifies controls expose max values through range inputs |
| Sidebar shows models and selected-model saved versions | README model list; `docs/convex-library.md` | Playwright verifies sidebar model buttons, saved-version section behavior, and opening a model from the sidebar |
| Save, Fork, theme, reset, frame, and export are in one actions menu | `docs/convex-library.md`; this coverage document | Playwright verifies the actions menu owns persistence, theme, reset, frame, and export commands |
| Orientation cube owns 3D, top, X, and Y views | This coverage document | Playwright clicks cube top, X edge, Y edge, and isometric controls and verifies the canvas remains nonblank with no page errors |
| Zoom remains easy to use in 3D | This coverage document | Playwright clicks zoom controls and verifies the canvas remains nonblank with no page errors |
| Rendering options include a solid view plus alternate inspection modes | This coverage document | Playwright selects Solid, X-Ray, and Wire and verifies the active state and viewer status |
| Original inlay/source overlay can be toggled | Model JSON audit invariant for source reference; this coverage document | Playwright toggles Original inlay/STL and verifies the control state survives the interaction |
| App supports multiple STLs with per-model JSON for parameters, audit, and scripts | README model structure; each model `model.json` | Model audit runner discovers catalog entries and executes each declared model audit script; Playwright opens catalog models from the sidebar |
| Japandi tray supports width, length, height, floor thickness, and rib relief | `docs/japandi-tray-audit-specifications.md`; Japandi tray model JSON | Model audit script checks all five parameters; Playwright verifies each parameter control and URL state |
| Dark theme is available | This coverage document | Playwright toggles the theme, verifies `html.dark`, and verifies URL `theme` state |
| Parameter state is saved in the URL | This coverage document | Playwright changes parameters and units, reloads from a URL, and verifies controls rehydrate from query params |
| Sidebars have resizable rails | This coverage document | Playwright drags the model-library and inspector separators, checks width and localStorage, then tests keyboard resize |
| Convex library stores saved versions and forks | `docs/convex-library.md`; Convex schema and functions | Static Playwright checks require Convex schema/functions/docs; app tests verify Save/Fork controls and selected-model saved-version sections |
| Comprehensive specifications and test plan stay current | `docs/specifications.md`; `docs/test-plan.md` | Static Playwright checks require the specs, test layers, release gate, and non-goals to stay documented |

## Playwright Coverage Contract

The Playwright suite should fail if:

- Any cataloged model cannot load its config, STL, inspector, audit rows, or 3D canvas.
- A model parameter cannot be edited through its range or text input.
- A parameter edit does not update the URL using millimeter values.
- Unit selection does not update visible values and URL state.
- Fractional inches do not parse for inch-mode text inputs.
- Dark theme does not update the document class and query string.
- The shadcn/Radix select UI regresses to native `select` elements.
- Rendering, weighted-center, original-overlay, actions-menu camera actions, cube orientation, or zoom controls throw page errors or leave the canvas blank.
- The sidebar rail cannot be resized by pointer and keyboard.
- Convex library schema, functions, and documentation are missing or drift from the Save/Fork/Open flows.
- Arbitrary STL upload support reappears without the required metadata, validation, and audit plumbing.
- Static model audit docs, model JSON checks, and Playwright tests drift out of alignment.

## Manual Release Gate

Before publishing or pushing a meaningful app change, run:

```bash
npm run verify
```

This command runs model audits, TypeScript plus Vite production build, and the full Playwright suite.
