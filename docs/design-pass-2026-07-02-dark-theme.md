# Design Passes: July 2, 2026 Dark Theme

## Scope

Audit and polish the dark theme for the library and model viewer. Run two full design loops: screenshot, audit, image generation reference, implementation, screenshot, and verification.

## Commit

- `24f50c6` - `Polish dark theme surfaces`

## Source Artifacts

Baseline dark screenshots:

- `artifacts/screenshots/dark-audit/pass-0/library-desktop.png`
- `artifacts/screenshots/dark-audit/pass-0/library-mobile.png`
- `artifacts/screenshots/dark-audit/pass-0/viewer-desktop.png`
- `artifacts/screenshots/dark-audit/pass-0/viewer-mobile.png`

Pass 1 dark screenshots:

- `artifacts/screenshots/dark-audit/pass-1/library-desktop.png`
- `artifacts/screenshots/dark-audit/pass-1/library-mobile.png`
- `artifacts/screenshots/dark-audit/pass-1/viewer-desktop.png`
- `artifacts/screenshots/dark-audit/pass-1/viewer-mobile.png`

Pass 2 dark screenshots:

- `artifacts/screenshots/dark-audit/pass-2/library-desktop.png`
- `artifacts/screenshots/dark-audit/pass-2/library-mobile.png`
- `artifacts/screenshots/dark-audit/pass-2/viewer-desktop.png`
- `artifacts/screenshots/dark-audit/pass-2/viewer-mobile.png`

Live post-deploy screenshots:

- `artifacts/screenshots/dark-audit/live/library-desktop.png`
- `artifacts/screenshots/dark-audit/live/library-mobile.png`
- `artifacts/screenshots/dark-audit/live/viewer-desktop.png`
- `artifacts/screenshots/dark-audit/live/viewer-mobile.png`

Image generation references:

- Pass 1 desktop: `/Users/jasonlaster/.codex/generated_images/019f1f86-ae11-70c3-ac33-3ae3f032a5e1/ig_094a4a767380a048016a469e7807b4819aac5fbc57a5eebb8e.png`
- Pass 1 mobile: `/Users/jasonlaster/.codex/generated_images/019f1f86-ae11-70c3-ac33-3ae3f032a5e1/ig_094a4a767380a048016a469eba85c8819aa7a9328b73b00f3d.png`
- Pass 2 desktop: `/Users/jasonlaster/.codex/generated_images/019f1f86-ae11-70c3-ac33-3ae3f032a5e1/ig_076913cd018f3b99016a469f66bebc819bbf0359d46cefd7cd.png`
- Pass 2 mobile: `/Users/jasonlaster/.codex/generated_images/019f1f86-ae11-70c3-ac33-3ae3f032a5e1/ig_076913cd018f3b99016a469fb3964c819bb04a3fca6c308078.png`

## Baseline Audit

Areas to improve:

- Desktop library surfaces were readable but flat: sidebar, page body, cards, and rows were too similar in tone.
- Search had a heavy bright border in dark mode and pulled attention away from content.
- The dark holder model was too close to the black canvas and could disappear visually.
- The viewer grid was too bright relative to the model and scene.
- Inspector/header surfaces felt like solid blocks rather than layered tool panels.
- Mobile viewer stacked correctly but the canvas-to-inspector transition felt abrupt.

## Pass 1

Implemented:

- Tuned dark theme tokens toward graphite surfaces, brighter foreground text, and restrained blue accents.
- Reduced visual weight of the dark search bar, model cards, and saved-version rows.
- Added darker dark-mode canvas background and darker grid colors.
- Made the dark holder material lighter in dark mode so it separates from the canvas.
- Added dark-specific treatment for viewer status chips, floating navigation controls, segmented controls, and alternating inspector sections.

Pass 1 audit:

- The viewer canvas started reading as a proper dark workspace instead of a pure black void.
- The holder model became visible against the canvas.
- Search and cards were calmer and less bordered.
- Mobile dark theme felt more cohesive.

Still needing improvement:

- Mobile library had a lonely theme button under the title.
- Desktop saved-version rows could be denser.
- Paper towel model thumbnail was too low-contrast.
- Mobile inspector needed to feel like an intentional sheet rather than a next block.
- Save/Fork/status needed stronger grouping.

## Pass 2

Implemented:

- Raised paper towel thumbnail contrast in dark mode.
- Tightened saved-version row height and padding.
- Added a status dot to Save/Fork status text.
- Kept the mobile library header/action row compact.
- Added a rounded, elevated dark mobile inspector sheet.
- Improved mobile footer and inspector separation.

Pass 2 audit:

- Mobile library header alignment improved.
- Model thumbnail contrast improved.
- Mobile inspector now reads as an intentional bottom sheet.
- The shipped desktop library is still sparse because the catalog currently has only two models; filler UI was intentionally avoided.

## Latest Image Audit: Not Yet Implemented

This section compares the latest generated references from July 2, 2026:

- Desktop latest: `ig_076913cd018f3b99016a469f66bebc819bbf0359d46cefd7cd.png`
- Mobile latest: `ig_076913cd018f3b99016a469fb3964c819bb04a3fca6c308078.png`

Elements visible in the latest images but not implemented:

- Persistent desktop library taxonomy: the reference sidebar includes `Library`, `All models`, `Trays`, and `Holders` filters with count badges. The shipped app keeps the simpler `Models` and `Versions` nav.
- Desktop add/filter controls: the reference shows a plus button and a search/filter control cluster. The shipped app has search and result count only.
- Larger rendered model thumbnails: the reference model cards use realistic 3D preview thumbnails on dark grid backdrops. The shipped app still uses deterministic CSS thumbnails.
- Model card metadata footer: the reference includes parameter counts, supported units, and updated dates. The shipped cards show compact tags only.
- Saved versions table: the reference shows columns for name, model, type, updated date, actions, status pills, and kebab menus. The shipped app uses a simpler row list with icon, title, metadata, Open, and STL actions.
- Sidebar Convex sync card: the reference includes a connected sync status card in the sidebar. The shipped app surfaces persistence through counts and graceful error/fallback messaging, not a persistent sync card.
- Integrated desktop viewer/library workspace: the reference desktop image combines library navigation and model editing in one continuous workspace. The shipped app keeps dashboard and viewer as separate route states.
- Desktop vertical tool rail and view cube: the reference viewer has a vertical selection/pan/zoom/frame rail and a cube-style orientation widget. The shipped viewer keeps zoom, pan pad, and orientation buttons.
- Mobile native-style top bar: the reference includes a more app-like top bar with back navigation, centered title/status, theme, and overflow. The shipped mobile header keeps the existing Dashboard button, title, version input, Save/Fork, status, and theme controls.
- Mobile glass action row: the reference groups version input, Save, Fork, and overflow in a single raised container. The shipped app groups them through flex layout but not a single glass container.
- Mobile unit segmented control: the reference has an `in/mm` segmented control at the Parameters section level. The shipped app keeps per-row unit selectors.
- Collapsible inspector sections: the reference shows section chevrons and audit row chevrons. The shipped app keeps expanded sections for direct access and simpler test coverage.
- Mobile inspector drag handle: the reference has a visible grab handle at the top of the inspector sheet. The shipped app has the rounded sheet treatment but no handle.
- Stronger mobile export action: the reference makes Export a large, primary bottom action. The shipped footer has Export as primary but keeps Reset and Frame in equal-height compact buttons.

Intentional non-goals for the July 2 implementation:

- Do not add OS status bars or fake device chrome.
- Do not add non-functional controls such as plus, kebab, filters, view cube, or collapsible rows unless the product behavior is implemented.
- Do not replace deterministic CSS thumbnails with rendered thumbnail generation until there is an owning data/rendering path.

## Verification

- `npm run verify`: 25 passed, 1 Convex-only test skipped.
- Live Convex Save/Fork slice: 1 passed.
- Production deployment: `dpl_2EdXXN4LqnLG7kdjgPz26bihZNqh`.
- Live alias: `https://prints.jlast.io`.
- Live dark screenshot checks: library/viewer desktop and mobile loaded with zero browser errors.
