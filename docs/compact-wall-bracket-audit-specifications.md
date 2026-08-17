# Compact Wall Bracket Audit Specifications

## Source custody and measurements

The retained source is `obj_4_Corpo_04_(2).stl` with SHA-256 `0918436addeaa74ceaf597297ec8b0deef42806d7fd019e7ff0498d7de1234ec`. Its measured envelope is 190.9188 × 25.6 × 99.9285 mm in source XYZ order. A section through the middle of the 25.6 mm depth contains one outer triangular loop and two open-cell loops. It has a 10 mm base rail and 6.4 mm diagonal rails. The supplied body contains no bolt bores, countersinks, or cylindrical mounting pockets, so the reconstruction does not invent or resize a bolt interface.

## Selective scaling contract

The default compact envelope is 115 × 60.2 × 25.6 mm in print XYZ order. The 115 mm span and 60.2 mm rise preserve the source aspect ratio at approximately 60.2%. The structural sections are not scaled: body depth stays at least 25.6 mm, the base rail stays at least 10 mm, and both diagonal rails and the center web stay at least 6.4 mm. The two open cells, continuous outer triangle, center web, and chamfered source character remain visible and editable.

The shorter envelope is a geometric reconstruction, not a load certification. Actual capacity depends on polymer, moisture, temperature, layer bonding, perimeter count, infill, print defects, wall material, attachment method, fasteners, shelf projection, impact, creep, and installation quality. Proof-load the installed pair gradually before relying on it.

## Two-up plate contract

The default single STL is 115 × 60.2 × 25.6 mm. The default two-up STL contains two disconnected, individually manifold shells with a 5 mm gap, for a 235 × 60.2 × 25.6 mm combined envelope. Both broad chamfered faces rest at Z = 0. A 250 mm square usable plate with 5 mm requested edge margins leaves 240 mm of usable width, so the default pair has 5 mm spare inside those requested margins.

Plate size, edge margin, and pair gap are parameters. The app must clamp dependent limits and show a warning whenever either two-up planar dimension exceeds the usable plate span. This envelope check does not account for brim, skirt, purge objects, printer exclusion zones, first-layer compensation, or slicer-specific spacing; verify the final plate in the actual slicer profile.

## Executable checks

`npm run audit -- compact-wall-bracket` must verify:

- the retained source SHA-256 and measured source bounds;
- parameter presence, default ranges, and unscaled strength-section minimums;
- finite coordinates, zero degenerate triangles, and exactly two triangles per mesh edge;
- one connected shell in the single STL and two disconnected shells in the two-up STL;
- exact single and two-up bounds, requested pair gap, Z = 0 placement, and default plate fit.

Focused Playwright coverage must verify all ten controls, the source/section and bolt-interface audit language, reloadable URL state, a nonblank canvas, the single export, and the two-up export with two manifold components and the current parameter envelope.
