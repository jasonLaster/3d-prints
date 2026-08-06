# X-Hover Dining Table audit specification

The X-Hover Dining Table is a deliberate variation of the supplied Hover Dining Table. The source photographs and dimension drawing establish the tabletop, walnut finish, proportions, and two sculpted transverse end boxes. The connecting structure is replaced by a user-defined pair of horizontal X-brace assemblies: one bears directly against the tabletop underside and one bears directly on the floor.

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
- Separate 3/4 in outer and 2 1/2 in inner end-box corner radii because the observed curves are not concentric offsets.
- Separate normalized Bézier controls for the inner and outer end-box corners.
- A 3/8 in rounded face-edge treatment around each end-box perimeter and opening.
- Zero end-box bottom spread by default, matching the supplied orthographic drawing; positive or negative spread remains editable to evaluate the photographic splay hypothesis.
- Exactly two horizontal X-brace assemblies connect the end boxes: one upper X and one lower X.
- Each X contains exactly two diagonal rectangular walnut braces and one centered 50/50 half-lap.
- The upper X is tight to the tabletop: its complete assembled top envelope is coplanar with and bears directly against the tabletop underside, with zero air gap or spacer.
- The lower X is tight to the floor: its complete assembled bottom envelope is coplanar with and bears directly on `Z = 0`, with zero air gap, feet, or spacer.
- No straight parallel lengthwise stretchers, side aprons, central rail, hover reveal, or exposed support pads remain in this variation.
- Default manipulation-model scale: 1:10.

## Tabletop contract

The tabletop remains a square-ended extrusion. Its two short end faces stay planar and vertical. Only the two long edges receive the rolled profile. The long-edge cross-section is a normalized cubic Bézier function whose control lengths equal the roll radius or depth multiplied by the editable tension.

The upper X may contact the tabletop underside, but it must not change the tabletop envelope, long-edge curve, or flat end faces. Direct contact does not prescribe a full-surface glue joint. A furniture-scale attachment design must still allow seasonal tabletop movement across the grain.

## End-box contract

The end-box outer width is derived from tabletop width minus two side overhangs. Each interior opening is derived from the outer box, the two side-member widths, and the top- and bottom-rail heights. Inner and outer curves remain separate cubic Bézier families with independently editable radii and normalized tensions.

Bottom spread is the only splay hypothesis. Zero spread produces orthogonal side members. A nonzero value changes the bottom outer and inner widths symmetrically without moving the upper X endpoints outside the upper end-box corner zones or moving any floor contact below `Z = 0`.

## Double-X brace contract

The braces are horizontal in plan. They are not X shapes inside either vertical end-box opening.

For each X plane:

1. One diagonal connects the negative-Y corner zone of the negative-X end box to the positive-Y corner zone of the positive-X end box.
2. The other diagonal connects the positive-Y corner zone of the negative-X end box to the negative-Y corner zone of the positive-X end box.
3. Both diagonal centerlines pass through `X = 0`, `Y = 0` and therefore cross at the exact table center.
4. Both diagonals have equal plan length for a symmetric table.
5. Their plan angle is derived from the longitudinal span and lateral endpoint span; it is never an independently edited rotation.
6. The ends terminate in the inside corner zones of the two end boxes. The photographs do not establish the production end joinery, so the CAD model must keep the endpoint relationship explicit without claiming a particular concealed fastener.

The longitudinal centerline span is derived from table length, end overhang, and end-box depth. The lateral centerline span is derived from end-box width, side-member width, and an optional brace endpoint inset. With `spanX` and `spanY` so derived:

- diagonal centerline length is `sqrt(spanX² + spanY²)`;
- diagonal plan angle magnitude is `atan2(spanY, spanX)`;
- the two rotations are equal and opposite; and
- changing table length, width, overhang, box depth, side-member width, or endpoint inset must regenerate both Xs without detached or projecting ends.

Upper and lower brace width and vertical thickness remain independently editable so the floor X can be more architectural than the largely concealed upper X. Brace edge radii remain independently editable but must never consume a brace cross-section or round away a half-lap shoulder.

## Half-lap contract

Each X has exactly one traditional centered half-lap. The overlap is derived from the two brace widths and their included angle; it is not positioned by an arbitrary offset.

- The crossing is centered at `X = 0`, `Y = 0`.
- Each brace retains exactly half its nominal vertical thickness through the overlap, excluding an optional fit clearance.
- One brace is relieved from its upper half and the other from its lower half so the assembled exterior faces remain coplanar.
- The upper X preserves one continuous assembled top envelope at the tabletop underside.
- The lower X preserves one continuous assembled bottom envelope at the floor.
- The two half-lapped solids may touch at their mating surface but must not occupy overlapping volume.
- A fit-clearance parameter may open the internal mating faces for fabrication or printing, but it must not create a visible gap at the assembled top, bottom, or outer shoulder seams.
- Half-lap shoulders remain square and dimensionally explicit even when the brace edges are eased.

## Direct-contact contract

The former 3/8 in hover gap and support-pad concept are removed.

- `upperBraceMaxZ` must equal `overallHeight - topThickness` within the audit tolerance.
- No point on the upper X may extend into the tabletop volume.
- The upper X must not be lowered by an editable reveal, pad height, or spacer parameter.
- `lowerBraceMinZ` must equal `0` within the audit tolerance.
- No point on the lower X or either end box may extend below the floor plane.
- The lower brace bottoms must be planar across their full runs; contact may not be simulated with isolated feet.
- Any rendered line at either interface represents an eased-edge seam or contact shadow, not open space.

## Required parametric controls

The manipulation model must expose or derive these control families:

- envelope and scale: mock scale, table length, table width, overall height, and tabletop thickness;
- tabletop profile: long-edge roll depth and normalized Bézier tension;
- end-box placement: side overhang, end overhang, and box depth;
- end-box silhouette: side-member width, top- and bottom-rail heights, bottom spread, independent inner and outer radii, independent inner and outer Bézier tensions, and face-edge round-over;
- upper X: brace width, brace thickness, endpoint inset, and edge radius;
- lower X: brace width, brace thickness, endpoint inset, and edge radius;
- joinery: half-lap fit clearance, with lap position, included angle, overlap length, and nominal 50% depth derived from the surrounding geometry.

There is no hover-gap control. There is no support-pad control. There is no generic lengthwise-stretcher position or count control.

## Runtime assertions

Runtime construction checks must reject parameter combinations that would:

- eliminate either end-box opening or either X-brace span;
- push an end-box silhouette or brace endpoint outside the tabletop plan;
- make inner or outer end-box corner radii self-intersect;
- make an end-box face round-over consume a side member or rail;
- move either diagonal centerline away from the table origin;
- make opposite diagonals in one X unequal in length;
- detach a brace end from its intended end-box corner zone;
- let brace edge radii consume a brace width, thickness, or half-lap shoulder;
- make a half-lap shallower or deeper than half the nominal brace thickness, after allowed fit clearance;
- leave solid overlap between the two braces at a center crossing;
- move the upper X away from the tabletop underside or into the tabletop;
- lift the lower X above the floor or extend it below the floor;
- reintroduce a parallel lengthwise stretcher, hover pad, or spacer; or
- move any normalized Bézier tension outside the supported range.

## Audit and test contract

The static model audit and browser tests must eventually prove:

- the full 75 × 35.5 × 29.5 in envelope and 1:10 default manipulation envelope;
- exactly two closed end boxes;
- exactly four diagonal braces grouped as two upper and two lower members;
- zero parallel lengthwise stretchers and zero support pads;
- two center crossings at `X = 0`, `Y = 0`;
- equal-and-opposite plan angles and equal diagonal lengths within each X;
- one 50/50 half-lap per X with no overlapping solid volume;
- upper-X top contact at the tabletop underside with zero gap;
- lower-X bottom contact at `Z = 0` with zero gap;
- derived brace endpoint attachment after representative length, width, overhang, box-width, and endpoint-inset edits;
- preserved square tabletop ends and independently editable Bézier curve families;
- finite, nondegenerate exported triangles and the exact scaled outer envelope; and
- camera orientation and zoom remain stable during every parameter edit.

## Source-of-truth boundary

The supplied product images remain authoritative for the tabletop and end-box appearance. The two horizontal X assemblies, their direct-contact elevations, and their centered half-laps are the user-approved design variation and supersede the photographs wherever the base connection differs.

The images do not establish concealed brace-to-box fastening, tabletop movement hardware, floor-flatness accommodation, or fabrication clearances. Those details must remain explicit engineering decisions rather than inferred product facts. Walnut grain and finish are renderer materials only and never change exported geometry.
