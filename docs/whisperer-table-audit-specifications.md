# Whisperer Table audit specification

The Whisperer is a parametric construction mock derived from the supplied MCM dining-table plan. Full-size furniture values remain in millimeters; `mockScale` affects only the preview and exported STL. The default envelope is 72 × 40 × 30 in with a 1 3/4 in beveled top, four longitudinally splayed tapered legs, a recessed four-apron frame, and four independently adjustable leveling feet.

## Adjustable leveling-foot contract

The default hardware assumptions are a 1 1/2 in diameter pad, 1/4 in pad thickness, 3/8 in threaded-rod diameter, 3 in rod length, and 3/4 in installed floor-to-leg extension. All five dimensions and the enable switch are URL-backed parameters.

There is one foot centered beneath each splayed leg. Enabling the feet raises the bottom of every wood leg by the installed extension and shortens its vertical wood run by the same amount; the tabletop, aprons, and 30 in overall height do not move. Disabling the feet restores the original chamfered wood contacts at `Z = 0` and the original direct-contact leg length. The threaded rod remains vertical and centered in the horizontal modeled leg bottom.

Installed extension must be at least the pad thickness and less than pad thickness plus rod length, leaving positive rod embedment in the leg. Rod diameter must stay inside both dimensions of the centered foot section. Each pad is a separate hardware solid, and all four pads alone touch `Z = 0` when enabled.

The assembled viewer and model-library preview render the four feet as metal hardware. With feet enabled, export produces registered support-free wood and hardware STLs; both receive the same print transform so a multipart import preserves alignment. With feet disabled, export returns to the original single wood STL.

## Structural screening

The Structure panel is a transparent geometry-only comparison. It is not structural engineering, a load rating, or certification of the table or its joinery. The source plan does not dimension mortises, tenons, dowels, screws, glue surfaces, tabletop fasteners, or wood properties. The screen therefore compares visible CAD proportions and support topology while leaving actual connection rotation, grain defects, moisture movement, floor flatness, impact, and fatigue to physical validation.

The six metrics use the plan dimensions as comparison references. They do not import the Plate Table's apronless steel-plate assumptions. Every raw metric and the final weighted score is clamped to 0–100 and rounded to one decimal place.

### Long-apron racking

`25 + 42 × longApronFactor × setbackFactor × heightFactor^1.5 + 18 × legSectionFactor × heightFactor`

The long-apron factor increases with apron depth to the 1.5 power and with the square root of apron thickness, while increasing span reduces the factor by its square root. The leg factor uses the square root of the top leg face area relative to the default. Taller tables receive a larger lateral lever-arm penalty, and larger apron setbacks receive a limited engagement penalty. Because the source does not describe the apron-to-leg joint, this score does not assign rotational stiffness to a mortise and tenon or any substitute connector.

### Side-frame racking

`25 + 44 × sideApronFactor × setbackFactor × heightFactor^1.5 + 16 × legSectionFactor × heightFactor`

The side-frame proxy uses the same transparent section, span, setback, and height relationships with the side apron dimensions. It evaluates the crosswise portal formed by each apron and its two legs. The fixed 15-degree longitudinal splay affects the footprint but does not earn undocumented joint capacity in this metric.

### Apron-frame torsion

`25 + 42 × sqrt(longApronFactor × sideApronFactor) × setbackFactor × heightFactor^0.6 + 18 × topTorsionFactor`

The geometric mean of the long- and side-apron factors represents the closed four-sided frame: neither direction can wholly substitute for the other. The solid top receives an effective-thickness factor. That helper preserves the full-thickness center field and discounts the beveled perimeter using the cube root of its plan fraction, consistent with thickness having a cubic influence on section stiffness. This remains a relative proxy and does not assume rigid tabletop fasteners, composite action, or known apron-joint rotation.

### Splayed-foot tipping margin

`20 + 80 × min(1, min(footprintLength ÷ 2 ÷ height, footprintWidth ÷ 2 ÷ height) ÷ 0.65)`

The longitudinal contact footprint includes the modeled 15-degree splay run and the active contact width. The crosswise footprint uses side-apron leg spacing plus that direction's active contact width. Enabled leveling pads replace the wood-foot extents in both directions. The smaller half-footprint-to-height ratio controls. This is a static support-polygon comparison, not a safe-load prediction for a person sitting, leaning hard, or climbing on the tabletop.

### Floor rocking tolerance

With independent leveling feet:

`96 + 2 × clamp(rodEntryClearance ÷ rodDiameter, 0, 1)`

With fixed wood contacts:

`52 + 20 × clamp((footWidth × footThickness − 2 × chamfer²) ÷ (footWidth × footThickness), 0, 1)`

Four independently adjustable pads can be brought onto one plane, so their score no longer assumes a perfectly flat floor. The final two points reward clearance around the centered threaded-rod entry, but do not prove adjuster travel, insert capacity, floor friction, or long-term settling. When feet are disabled, the chamfered rectangle removes four triangular corners totaling twice the chamfer squared. Retaining more nominal contact area earns limited credit, but four fixed legs remain statically over-constrained and may require field shimming.

### Member stiffness

`100 − max(0, legSlenderness − 11) × 3 − max(0, longApronSlenderness − 24) − max(0, sideApronSlenderness − 14) × 0.7 − max(0, tabletopSlenderness − 24) × 0.9`

Leg slenderness divides clear height by the square root of the average tapered-leg face area. Each apron slenderness divides span by the square root of its cross-sectional area. Tabletop slenderness divides width by the bevel-adjusted effective thickness. These dimensionless comparisons do not calculate deflection, buckling, allowable stress, grain direction, or connection capacity.

### Overall weighting and grades

The overall score is the weighted sum

`0.24 × longApronRacking + 0.22 × sideFrameRacking + 0.18 × torsion + 0.14 × tipping + 0.10 × floorRocking + 0.12 × memberStiffness`.

Grades are A at 85 or above, B at 75, C at 65, D at 50, and F below 50. Weighting emphasizes motion at the two orthogonal apron frames without allowing the undocumented joints to disappear inside one composite score. The panel also recomputes the complete score at one inch lower and one inch higher with every other parameter fixed.

## Sensitivity and physical tests

Automated tests require increasing overall height to reduce the overall score and the racking, tipping, and member-stiffness metrics. Deeper long aprons must improve long-apron racking and torsion; deeper side aprons must improve side-frame racking; and a thicker top must improve torsion and member stiffness. Enabling independent feet must improve floor-rocking tolerance, disabling them must restore wood contact at `Z = 0`, and a larger chamfer must reduce only the fixed-wood floor-contact score.

Before irreversible joinery, make a full-size corner mock using the intended wood, joint dimensions, glue, and fasteners. Then perform a shim-free diagonal corner-rock test, repeatable measured lateral pushes at tabletop height in both axes, loaded tabletop-deflection measurements, witness-mark inspection for apron/leg slip, and repeated-load retesting. The physical result overrides this screen.
