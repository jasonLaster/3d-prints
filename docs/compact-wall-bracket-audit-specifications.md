# Compact Wall Bracket Audit Specifications

## Source evidence brief

The retained source is `obj_4_Corpo_04_(2).stl` with SHA-256 `0918436addeaa74ceaf597297ec8b0deef42806d7fd019e7ff0498d7de1234ec`. Its measured envelope is 190.9188 × 25.6 × 99.9285 mm in source XYZ order, giving a 1.910554:1 span-to-rise ratio. The source is one manifold shell and contains eight 4 mm through-holes: a two-by-two pattern through each diagonal rail.

The source is not a uniform extrusion. Its four major depth planes are approximately -213.515, -205.195, -196.235, and -187.915 mm. These prove a 25.6 mm maximum outer depth and an 8.96 mm recessed center depth. A dense local ray check finds those same two dominant material depths. This directly overturns the first remake's uniform 25.6 mm interpretation.

| Part or relationship | Evidence | Design use | Confidence |
| --- | --- | --- | --- |
| Overall span and rise | Direct STL bounds: 190.9188 × 99.9285 mm | Lock rise to span at the measured ratio | High, observed |
| Maximum outer depth | Direct STL bounds and major face planes: 25.6 mm | Preserve as source evidence, not as the remake's default | High, observed |
| Recessed center depth | Major source face planes: 8.96 mm | Minimum permitted diagonal-and-center depth | High, observed |
| Base rail planar thickness | Measured source section: 10 mm | Hard minimum | High, observed |
| Diagonal rail planar thickness | Measured source section: 6.4 mm | Hard minimum | High, observed |
| Center web planar thickness | Source section plus user request | Independent planar-width control, minimum 6.4 mm | Medium, corroborated |
| Base-body depth | User correction suggested approximately 3/4 in | Editable default of 19.05 mm | Medium, user-directed |
| Diagonal and center depth | User correction permits a common 1/2-to-1/3 in depth | One shared editable default of 12.7 mm | Medium, user-directed |
| Diagonal drill holes | Eight cylindrical through-holes measured directly | Preserve all eight and keep diameter/placement editable | High, observed |
| Hole diameter | 4 mm | Independent default, never scaled with outer span | High, observed |
| Along-rail placement | First row 32 mm from apex; second row 64 mm farther | Editable apex inset and row spacing | High, observed |
| Across-depth placement | Source centers are 4.16 mm from the two depth faces | Editable symmetric inset; remake defaults to 3.1 mm to retain two rows in 12.7 mm depth | High for source, user-directed remake |

The build-plate face is the fixed Z = 0 datum. Span is the independent envelope control; rise is derived. Base-body depth and shared diagonal/center depth are independent. Base, diagonal, and center planar section widths remain independently editable. Drill-hole diameter, first-row apex inset, along-rail row spacing, and symmetric depth-edge inset are independent controls. Pair rotation and pair translations are derived outputs rather than free placement controls.

Unknowns that still matter physically are polymer, layer settings, wall construction, fastener geometry on any mating part, actual loads, creep, impact, and installation method. Those unknowns prevent a structural certification.

## Corrected stepped-depth model

The default remake is 200 mm wide and 104.6817 mm tall. This is 104.76% of the supplied span and rise while preserving the source proportion exactly. There is no independent rise control that can distort the triangle.

The default base rail is 19.05 mm deep. Both diagonal rails and the center web are 12.7 mm deep, as one shared `Diagonal + center depth` parameter. The base remains 10 mm thick in the planar profile; both diagonal rails and the center web remain 6.4 mm thick. All members share a flush lower face at Z = 0, so the stepped upper face does not suspend a recessed feature above the build plate.

This depth profile is a user-directed remake, not a claim that it reproduces every source surface. The source evidence remains visible in the audit as 25.6 mm maximum outer depth and 8.96 mm recessed center depth.

## Parameterized drill-hole contract

Each diagonal rail contains four real cylindrical through-holes, for eight total. The defaults preserve the measured 4 mm diameter, 32 mm first-row apex inset, and 64 mm along-rail spacing. Because the remake reduces diagonal depth to 12.7 mm, its symmetric depth-edge inset defaults to 3.1 mm rather than the source's 4.16 mm. This leaves 1.1 mm from each circular opening to the depth edge and 2.5 mm between the two depth rows.

Dependent limits preserve at least 1 mm of material at both depth edges, at least 2 mm between the paired depth rows, and at least 10 mm beyond the first and last along-rail holes. The hole diameter never scales with span. These are geometric minimums, not a fastener pull-out or printed-layer certification.

## Rotated two-up plate contract

The pair is not placed in a straight X-axis row. The second bracket is rotated 180 degrees and shifted beside the first so their adjacent diagonal boundaries remain separated by the requested normal gap. The complete pair is then rotated by the derived angle that minimizes its required square envelope. Plate-fit calculations use the conservative outer silhouette, including the clipped base corners, rather than only the rendered rails.

At the defaults, the pair angle is approximately 27.45 degrees and the checked-in two-up STL measures approximately 232.37 × 232.37 × 19.05 mm. On a 250 mm square plate with 5 mm requested margins, the 240 mm usable square retains approximately 7.63 mm spare in both planar directions. The individual and pair STLs contain respectively one and two disconnected manifold shells.

Plate size, edge margin, gap, member depths, and planar section widths remain parameters. The maximum span is derived from the current plate, margin, base corner, and gap. This geometric check still does not include brim, skirt, purge objects, printer exclusion zones, first-layer compensation, or slicer-specific spacing.

## Views and executable checks

The final CAD must be checked in a top view for the original proportion, an oblique view for the stepped upper depth and all eight open bores, an edge view for the 19.05/12.7 mm levels and two-row hole placement, and a two-up top view for opposed rotation and plate clearance.

`npm run audit -- compact-wall-bracket` must verify:

- the retained source SHA-256, source bounds, four major depth planes, 8.96 mm recessed depth, and eight measured 4 mm diagonal through-holes;
- derived rise and absence of independent rise or uniform-depth controls;
- body depth at least brace depth, brace depth compatible with the two hole rows, and source-derived hole diameter and row spacing;
- finite coordinates, zero degenerate triangles, exactly two triangles per mesh edge, and consistent outward triangle winding;
- one connected shell in the single STL and two disconnected shells in the two-up STL;
- all eight parameterized bores in the actual STL bytes, the 12.7 mm and 19.05 mm Z levels, common Z = 0 face, derived pair angle, exact exported bounds, and plate fit.

Focused browser coverage must verify all thirteen controls, source-depth and drill-hole audit language, reloadable URL state, a nonblank canvas, responsive layout, and downloaded single/two-up STL bytes. A physical proof-load remains required before relying on the installed pair.
