# X-Hover Dining Table audit specification

The X-Hover Dining Table is a parametric family based on the supplied Hover Dining Table. The source photographs and dimension drawing establish the tabletop, oak finish, proportions, two sculpted transverse end boxes, and original upper lengthwise stretchers. The user-approved variation adds independent top and floor support choices with independently editable member sections for each support plane.

This document is the authoritative design and executable audit contract for `hover-dining-table-v1`.

## Coordinate system

- X is the 75 in table-length axis.
- Y is the 35.5 in table-width axis.
- Z is vertical, with the finished floor plane at `Z = 0`.
- The table origin is centered in plan at `X = 0`, `Y = 0`.
- The tabletop top face is at `Z = overallHeight`.
- The tabletop underside is at `Z = overallHeight - topThickness`.

## Default design

- Full-size envelope: 75 × 35.5 × 29.5 in.
- 1 1/4 in tabletop with a flat rectangular plan and flat, square end faces.
- Continuous 5/8 in deep rolled profiles on only the two long edges, controlled by a normalized cubic Bézier tension.
- Two closed transverse end boxes, inset 7 1/2 in from the tabletop ends and 1 3/4 in from the tabletop sides.
- Separate top and bottom controls for both the 3/4 in outer and 2 1/2 in inner end-box corner radii. Equal defaults preserve the observed silhouette while independent values allow the upper and lower returns to be tuned without pretending they are concentric offsets.
- Separate normalized Bézier controls for the inner and outer end-box corners.
- A 3/8 in rounded face-edge treatment around each end-box perimeter and opening.
- Zero end-box bottom spread by default, matching the supplied orthographic drawing; positive or negative spread remains editable to evaluate the photographic splay hypothesis.
- The default remains exactly two horizontal X-brace assemblies: one upper X and one lower X.
- Each X contains exactly two diagonal rectangular oak braces and one centered 50/50 half-lap.
- Each diagonal terminates in a flat angled cut coplanar with the inside face of its end box. The complete cut face stays inward of the editable inner-corner tangent rather than colliding with the rounded corner.
- Every brace has a true round-over on both top and bottom long edges; its end cuts and half-lap shoulders remain square.
- The upper X is tight to the tabletop: its complete assembled top envelope is coplanar with and bears directly against the tabletop underside, with zero air gap or spacer.
- The lower X is tight to the floor: its complete assembled bottom envelope is coplanar with and bears directly on `Z = 0`, with zero air gap, feet, or spacer.
- The top can instead use the two original parallel lengthwise stretchers. The floor can instead use one centered lengthwise board or no connector. Side aprons, hover reveals, exposed support pads, and spacer blocks are prohibited.
- Default manipulation-model scale: 1:10.
- Two reusable full-size routing-template families reproduce the end-box top-rail and mirrored vertical-stile profiles. Their nominal printed thickness is 1/8 in.

## Tabletop contract

The tabletop remains a square-ended extrusion. Its two short end faces stay planar and vertical. Only the two long edges receive the rolled profile. The long-edge cross-section is a normalized cubic Bézier function whose control lengths equal the roll radius or depth multiplied by the editable tension.

The selected upper supports contact the tabletop underside but must not change the tabletop envelope, long-edge curve, or flat end faces. Direct contact does not prescribe a full-surface glue joint. A furniture-scale attachment design must still allow seasonal tabletop movement across the grain.

## End-box contract

The end-box outer width is derived from tabletop width minus two side overhangs. Each interior opening is derived from the outer box, the two side-member widths, and the top- and bottom-rail heights. Inner and outer curves remain separate cubic Bézier families with independently editable top and bottom radii and normalized tensions.

Bottom spread is the only splay hypothesis. Zero spread produces orthogonal side members. A nonzero value changes the bottom outer and inner widths symmetrically. X endpoints derive independently from the selected top or bottom opening; upper-stretcher centers derive from the outside bearing edge of each top rail; and the centered floor board remains at `Y = 0`.

## Support-layout and Double-X brace contract

`topSupportStyle` selects either the current upper X or two original lengthwise stretchers. `bottomSupportStyle` selects the current floor X, one centered lengthwise board, or no floor connector. These numeric URL parameters are presented as semantic selectors rather than dimensional sliders. Missing parameters resolve to X/X so existing URLs retain the current design.

The two upper stretchers run parallel to X, terminate on the end-box inside-face planes, and remain symmetric about `Y = 0`. Each outer long edge plus the shared bearing-zone inset is constrained to the outside edge of the top end-box rail, restoring the visible near-side/far-side architecture in the source photographs. Their square end faces remain parallel to and flush with the boxes. Their top envelope equals the tabletop underside.

The optional floor center board runs parallel to X at `Y = 0`, terminates with square box-parallel end faces, and has its bottom envelope on `Z = 0`. The `none` option creates no lower support solid, cut-list row, or exploded part. It does not remove or lift either end box.

The braces are horizontal in plan. They are not X shapes inside either vertical end-box opening.

For each X plane:

1. One diagonal connects the negative-Y corner zone of the negative-X end box to the positive-Y corner zone of the positive-X end box.
2. The other diagonal connects the positive-Y corner zone of the negative-X end box to the negative-Y corner zone of the positive-X end box.
3. Both diagonal centerlines pass through `X = 0`, `Y = 0` and therefore cross at the exact table center.
4. Both diagonals have equal plan length for a symmetric table.
5. Their plan angle is derived from the longitudinal span and lateral endpoint span; it is never an independently edited rotation.
6. Each end is cut on the end-box inside-face plane. This flat angled end is one full-section planar bearing face parallel with the box rather than a rounded or square-to-the-brace cap.
7. The outermost point of that angled cut is at the straight-rail tangent of the inner corner minus the editable endpoint inset. No part of the brace end may enter the Bézier corner.

The longitudinal centerline span is derived from table length, end overhang, and end-box depth. For each rail, the corner tangent is `openingWidth / 2 - innerCornerRadius`. Because a diagonal brace is wider on an end-box-aligned cut plane than it is perpendicular to its own centerline, its mitered half-width is `braceWidth / (2 cos(planAngle))`. The endpoint solver places the centerline at `cornerTangent - endpointInset - miteredHalfWidth` and iterates the angle until that relationship converges. With `spanX` and `spanY` so derived:

- diagonal centerline length is `sqrt(spanX² + spanY²)`;
- diagonal plan angle magnitude is `atan2(spanY, spanX)`;
- the two rotations are equal and opposite; and
- changing table length, width, overhang, box depth, side-member width, or endpoint inset must regenerate both Xs without detached or projecting ends.

Top and bottom support layouts each expose their own member width, vertical thickness, bearing-zone inset, and bottom-edge radius. X lateral endpoints remain independently derived from the corresponding inner-corner tangencies; upper-stretcher lateral placement derives from the top rail's outside bearing edge; and the floor board remains centered. Each edge-radius control rounds only the bottom long edge, leaving the top edge square; plan ends remain square. Half-lap fit clearance applies only while at least one X is selected.

## Half-lap contract

Each selected X has exactly one traditional centered half-lap. Straight supports have no half-lap. The overlap is derived from the two brace widths and their included angle; it is not positioned by an arbitrary offset.

- The crossing is centered at `X = 0`, `Y = 0`.
- Each brace retains exactly half its nominal vertical thickness through the overlap, excluding an optional fit clearance.
- Both braces retain their full nominal plan width through the crossing; the pockets remove depth, not width.
- One brace is relieved from its upper half and the other from its lower half so the assembled exterior faces remain coplanar.
- The upper X preserves one continuous assembled top envelope at the tabletop underside.
- The lower X preserves one continuous assembled bottom envelope at the floor.
- The two half-lapped solids may touch at their mating surface but must not occupy overlapping volume.
- A fit-clearance parameter may open the internal mating faces for fabrication or printing, but it must not create a visible gap at the assembled top, bottom, or outer shoulder seams.
- Half-lap shoulders remain square and dimensionally explicit even when the brace edges are eased.
- Pocket boundaries stay on exact aligned machining planes through every round-over layer; the renderer may not fan, taper, or twist those boundaries.
- The upper member remains visibly continuous across the top half of the crossing and the lower member remains visibly continuous across the bottom half, so an oblique or underside render communicates the half-lap rather than two overlapping solids.

## Direct-contact contract

The former 3/8 in hover gap and support-pad concept are removed.

- `upperBraceMaxZ` and the upper-stretcher maximum Z must equal `overallHeight - topThickness` within the audit tolerance.
- No point on any selected upper support may extend into the tabletop volume or be lowered by a reveal, pad, or spacer parameter.
- `lowerBraceMinZ` and the floor-board minimum Z must equal `0` when their layouts are selected.
- No point on any selected floor support or either end box may extend below the floor plane.
- Selected lower-support bottoms must contain a planar floor-bearing run; contact may not be simulated with isolated feet.
- Any rendered line at either interface represents an eased-edge seam or contact shadow, not open space.

## Exploded glue-up contract

Exploded mode is a presentation of 11–13 independently movable pieces—each fabrication-complete—before glue-up: one tabletop, two end boxes with two horizontal rails and two vertical stiles each, two selected upper supports, and zero, one, or two selected floor supports. The default X/X layout has 13 independently movable pieces. The tabletop remains one piece. X members retain their box-parallel ends, bottom-edge round-overs, and complementary pockets; straight supports retain their square contact ends and bottom-edge roundovers.

The four separated bars at each end retain the finished rail-and-stile geometry rather than reverting to rectangular stock. The top and bottom rails own the exact outer and inner cubic-Bézier returns, including independent radii and tensions. The stiles run between those tangent seams and retain the derived splay. Every rail and stile retains the configured 3D face-edge round-over, but its two glue seams stay square rather than being softened into a false gap. The exploded solids and assembled end-box ring are driven by the same width, opening, splay, radius, tension, depth, and round-over constraints; rectangular or trapezoidal proxy blanks are prohibited.

Exploded offsets are presentation-only. Switching between Assembled and Exploded must not change any parameter, URL value, assembled STL, oak material, render mode, camera orientation, or zoom. A parameter or layout edit made in Exploded mode must regenerate and reposition the selected 11–13 pieces while retaining that mode and the current camera.

## Dimensioned cut-list contract

Cut List is a third assembly view, alongside Assembled and Exploded. It combines five to eight grouped schedule lines with true-shape SVG views for the selected 11–13 pieces: T1 tabletop (qty 1), B1 top rails (qty 2), B2 bottom rails (qty 2), B3 mirrored stiles (qty 4), then either U1/U2 or S1 (qty 2) above and either F1/F2, C1 (qty 1), or no floor row below. Every row and drawing uses full-size finished dimensions, regardless of mock scale. Separating each X member remains required because one lap is cut from the top face and its mate from the bottom.

Every row and drawing is associative to the full-size furniture parameters, not the manipulation-model scale. Each part shows finished nominal length, width, thickness, quantity, lengthwise oak grain, its exact constrained main profile, and a separate edge-treatment section. The tabletop section shows the actual Bézier edge roll. Rail drawings show all four inner/outer cubic returns. Stile drawings show the tangent-to-tangent splayed profile. X drawings show true length, box-parallel angle, rounded section, and complete lap dimensions. Straight-support drawings show their square-ended plan profile, rounded section, and absence of false joinery.

The sheet deliberately distinguishes finished nominal dimensions from rough stock. It tells the builder to add their own rough-milling allowance rather than silently increasing dimensions because allowance depends on stock condition and shop process. B1–B3 schedule sizes describe the bounding stock envelopes of the finished routed profiles; their drawings may not collapse those pieces back into square blanks.

## Segmented routing-template contract

Templates is a fourth X-Hover assembly view. It derives two flat, full-size routing patterns from the same constraints and cubic Bézier control points as the assembled end box:

1. The top-rail template follows the complete outer top profile and inner-opening top profile, including both independent corner radii and curve tensions.
2. The vertical-stile template follows the complete outer side profile and inner-opening side profile. It is mirrored for the opposite stile; a second hand-authored outline is forbidden.

The nominal template thickness is 1/8 in (3.175 mm). A 9 in usable square print-plate span is the default rather than an assumption about the printer's advertised bed size. The plate span remains editable so the splitter can regenerate a different number of files for another printer. Every segment must lie flat at `Z = 0`, preserve the requested thickness, fit within the usable square plate envelope on both planar axes, and export as its own uniquely named STL.

Internal seams use complementary in-plane puzzle dovetails. The preceding segment ends in a male dovetail and the following segment begins with the corresponding female recess. Dovetail depth and fit clearance are explicit parameters; the female profile grows only by the requested clearance. Seam locations derive from total profile length, plate span, and joint depth, and must stay in a portion of the member where both the inner and outer template boundaries exist. No seam may clip a Bézier return or collapse the template width.

The on-screen template preview uses `mockScale` only for display. Export always regenerates the templates at full furniture size, normalizes every STL to its own nonnegative print origin, and retains the full-size 1/8 in thickness. The flat template captures the elevation outline for rough cutting and flush trimming. The 3/8 in end-box face-edge round-over is a subsequent router-bit operation and is called out rather than falsely encoded into a 2D pattern.

### Research basis

- [ISO 129-1:2018](https://www.iso.org/standard/64007.html) establishes general dimension-presentation principles for 2D technical drawings, while [ISO 128-1:2020](https://www.iso.org/standard/65296.html) covers the broader execution of computer-based technical drawings.
- Autodesk's [Drawing overview](https://help.autodesk.com/cloudhelp/ENU/Fusion-Drawing/files/GUID-A476C8D8-1EE2-4AA1-9A97-88DB74A4E837.htm) supports model-derived orthographic views and associated parts lists; its [Auxiliary views](https://help.autodesk.com/cloudhelp/ENU/Fusion-Drawing/files/DWG-AUXILIARY-VIEW.htm) guidance motivates showing angled members at true size rather than dimensioning a foreshortened assembly view.
- Autodesk's [linear-dimension guidance](https://help.autodesk.com/cloudhelp/ENU/Fusion-Drawing/files/GUID-8F35B0D7-3775-47C9-AA4F-4AEB7172EAC8.htm) keeps dimensions associated with the geometry measured, and its [parts-list guidance](https://help.autodesk.com/cloudhelp/ENU/Fusion-Drawing/files/DWG-CREATE-PARTS-LIST.htm) pairs item identities and quantities with the drawing sheet.
- OpenCutList's [component and dimension guidance](https://docs.opencutlist.org/getting-started/components) establishes length, width, thickness, and component axes as the woodworking parts-list basis. Its [part editing](https://docs.opencutlist.org/features/parts/parts-list/edit-part), [materials](https://docs.opencutlist.org/features/applying-materials), and [options](https://docs.opencutlist.org/features/parts/options) guidance support explicit grain orientation, grouping identical parts, material-specific processing, and distinguishing rough from finished dimensions.

## Required parametric controls

The manipulation model must expose or derive these control families:

- envelope and scale: mock scale, table length, table width, overall height, and tabletop thickness;
- tabletop profile: long-edge roll depth and normalized Bézier tension;
- end-box placement: side overhang, end overhang, and box depth;
- end-box silhouette: side-member width, top- and bottom-rail heights, bottom spread, independent top/bottom inner and outer radii, independent inner and outer Bézier tensions, and face-edge round-over;
- support layout: top X or original stretchers; floor X, centered board, or nothing;
- top and bottom support members: independent width, thickness, bearing-zone inset, and edge-radius controls, with layout-specific derived placement;
- X joinery: half-lap fit clearance, with lap position, included angle, overlap length, and nominal 50% depth derived from the surrounding geometry.
- routing templates: nominal thickness, usable square print-plate span, dovetail depth, and dovetail fit clearance, with segment counts and seam locations derived.

There is no hover-gap control or support-pad control. Stretcher count and floor-board position are structural consequences of their semantic layout choices, not arbitrary numeric controls.

## Structural wobble-screening contract

The inspector includes a live, geometry-only structural screen. It is intentionally not a certification, finite-element analysis, or substitute for testing the assembled table. Joint geometry, glue quality, grain defects, moisture, tabletop fasteners, floor flatness, and cyclic degradation are not known by this CAD model.

The screen reports six independently visible 0–100 scores plus a weighted overall grade: lengthwise racking (23%), end-box racking (20%), torsional rigidity (18%), tipping margin (14%), floor-rocking tolerance (12%), and member stiffness (13%). Grades are A at 85 or above, B at 75, C at 65, D at 50, and F below 50. Each row must expose its geometry driver rather than presenting an unexplained result.

- Lengthwise racking rewards triangulated X layouts, larger support cross-sections, lower overall height, and a lower connecting plane.
- End-box racking uses side-member width, box depth, rail height, and frame height as a closed-frame stiffness proxy.
- Torsional rigidity rewards two separated triangulated support planes and penalizes parallel or missing lower connections.
- Tipping margin uses the controlling half-footprint-to-height ratio in the longitudinal and transverse directions.
- Floor-rocking tolerance treats an added floor X or center board as an additional coplanar contact network. This makes the design more sensitive to an uneven floor even when it improves racking.
- Member stiffness compares stile and active-support slenderness. White oak's modulus of elasticity is a reference for the material assumption, but the score does not calculate allowable stress or joint capacity.

The UI must also show a one-parameter overall-height sensitivity at ±1 in with every other input fixed. Increasing height must not improve the overall, end-box-racking, tipping, or member-stiffness scores. Enlarging the end-box side width or depth must not reduce the end-box-racking score. Removing triangulated support must reduce racking or torsional scores even if it improves uneven-floor tolerance.

The research boundary follows [ISO 19682:2023](https://www.iso.org/standard/73590.html), which separates table stability, strength, and durability test methods; [ANSI/BIFMA X5.5-2021](https://www.bifma.org/news/551679/BIFMA-Revises-Desk-and-Table-Products-Standard.htm), which emphasizes table stability and leg strength; and the USDA Forest Products Laboratory's published white-oak reference values of approximately 12.27 GPa modulus of elasticity and 104.8 MPa modulus of rupture in clear bending specimens. These sources motivate the categories and oak reference only; this app does not claim conformance with either furniture standard.

Before build approval, the finished table still requires a shim-free diagonal corner-rock test, a measured lateral push at tabletop height in both axes, loaded deflection measurement, and repeated-load joint inspection. The physical test result supersedes the CAD grade.

## Runtime assertions

Runtime construction checks must reject parameter combinations that would:

- eliminate either end-box opening or required support span;
- push an end-box silhouette or brace endpoint outside the tabletop plan;
- make inner or outer end-box corner radii self-intersect;
- make an end-box face round-over consume a side member or rail;
- move either diagonal centerline away from the table origin;
- make opposite diagonals in one X unequal in length;
- let the upper and floor X use different section, inset, round-over, or half-lap-depth parameters;
- detach a brace end from its intended end-box corner zone;
- let any point of an angled brace end pass beyond the straight-rail tangent into the inner corner curve;
- make a brace end noncoplanar with the end-box inside face;
- let brace edge radii consume a brace width, thickness, or half-lap shoulder;
- make a half-lap shallower or deeper than half the nominal brace thickness, after allowed fit clearance;
- leave solid overlap between the two braces at a center crossing;
- move the upper X away from the tabletop underside or into the tabletop;
- lift the lower X above the floor or extend it below the floor;
- place an upper stretcher outside its end-box bearing zone, create more or fewer than two, miscenter the floor board, or create a lower support in `none` mode;
- introduce a hover pad or spacer; or
- move any normalized Bézier tension outside the supported range.
- let a routing-template segment exceed either usable print-plate axis, lose its nominal thickness, contain a non-finite vertex, or collapse at a dovetail seam;
- place a dovetail outside the shared inner/outer profile span, reverse the male/female sequence, or return fewer than two printable pieces for either template family.

## Audit and test contract

The static model audit and browser tests must eventually prove:

- the full 75 × 35.5 × 29.5 in envelope and 1:10 default manipulation envelope;
- exactly two closed end boxes;
- all six top/bottom support combinations with exactly two upper support members and zero, one, or two floor members;
- two center crossings at `X = 0`, `Y = 0` in the default X/X layout;
- equal-and-opposite plan angles and equal diagonal lengths within each X;
- one 50/50 half-lap per X with no overlapping solid volume;
- upper-X top contact at the tabletop underside with zero gap;
- lower-X bottom contact at `Z = 0` with zero gap;
- derived brace endpoint attachment after representative length, width, overhang, box-width, and endpoint-inset edits;
- independent inward endpoint migration after increasing either editable top or bottom inner corner radius, with only the corresponding X moving and the complete angled end remaining tangent-clear;
- bottom-edge brace round-overs with flat end cuts and square half-lap shoulders;
- preserved square tabletop ends and independently editable Bézier curve families;
- finite, nondegenerate exported triangles and the exact scaled outer envelope; and
- 11–13 exploded pieces according to layout, including true straight-support geometry where selected and exactly 13 for default X/X;
- an Assembled/Exploded switch that preserves parameter state, render mode, export geometry, camera orientation, and zoom; and
- five to eight cut-list lines whose quantities sum to the selected 11–13 pieces, with exact model-derived SVG profiles and joinery only where applicable;
- invariance of every cut-list dimension under mock-scale edits plus associative schedule/SVG updates after full-size dimensional edits;
- two full-size routing-template families derived from the frame Bézier geometry, nominally 1/8 in thick, with finite nondegenerate plate-safe segments and complementary male/female dovetails;
- more exported template segments after reducing the usable plate span, while mock-scale changes alter only the preview size and never the full-size template dimensions or STL count;
- camera orientation and zoom remain stable during every parameter edit.
- the inspector presents Overall, Tabletop, End boxes, Support layout, Top support members, Bottom support members, Support joinery, and Routing templates as distinct groups; selectors persist in the URL; and legacy shared-radius/split-brace URLs migrate to the canonical controls.

## Source-of-truth boundary

The supplied product images remain authoritative for the tabletop, end boxes, and original upper stretchers. The horizontal X assemblies, optional centered floor board, no-floor-support option, direct-contact elevations, and conditional half-laps are user-approved variations and supersede the photographs wherever selected.

The images do not establish concealed brace-to-box fastening, tabletop movement hardware, floor-flatness accommodation, or fabrication clearances. Those details must remain explicit engineering decisions rather than inferred product facts. Oak grain and finish are renderer materials only and never change exported geometry.
