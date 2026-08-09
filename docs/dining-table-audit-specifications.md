# Plate Table audit specification

The Plate Table model is a parametric construction mock of the solid-oak apronless table, not an image-derived mesh. Full-size furniture values remain in millimeters in the model contract; `mockScale` controls only the generated preview and STL size. The stable model and export ID remains `dining-table` so saved URLs and registered STL pairs continue to work.

## Default design

- 76 × 38 × 1 1/2 in solid-oak tabletop
- 30 in finished height
- Four 4 × 4 in corner posts with an independently adjustable outside vertical radius and one shared radius for the other three corners; both default to 1 in
- 1 in tabletop plan radii
- 1/2 in top and bottom edge roundovers, leaving a 1/2 in flat edge band
- An optional post-top groove/rabbet, enabled by default at 1/4 in high × 1/8 in deep
- With the groove enabled, the 1/4 in top roundover sits below the recessed band and forms its rounded lower shoulder; with it disabled, that roundover returns to the post's top edge
- A 1/4 in horizontal edge roundover at the bottom of each post
- Four 1 1/2 in diameter threaded leveling pads, each independently installed at 3/4 in by default; each wood post is shortened by its own installed extension so all pads share the floor plane while finished tabletop height remains 30 in
- Four 6 × 6 × 1/4 in flush corner plates, set 1/2 in back from both tabletop edges so they disappear in side elevation
- Three flush C-channels centered 16, 38, and 60 in from one end
- Default printable mock scale: 1:10

The default 1:10 mock is approximately 193 × 97 × 76 mm overall.

## Source-of-truth boundary

The procedural geometry controls dimensions, counts, and placement. The independent post corner is mirrored to face outward at all four table corners. The post-top groove is part of the solid geometry and can be switched off without changing the overall table height. Each enabled leveling foot has an independent installed extension; its corresponding wood post shortens by that amount, keeping the tabletop level and all four pad bottoms on the common floor reference. Oak grain and blackened steel are render materials only and must never change the model geometry. The two-color export produces a wood STL for color 1 and a registered hardware STL containing all four plates, three C-channels, and four leveling feet for color 2. Both files are flipped into the same support-free print orientation, with the tabletop top face on the build plate and the legs extending upward.

## Print caveat

Import both STL files simultaneously as parts of one multipart object so the slicer preserves their shared origin; assign the hardware part to the second filament. The exported orientation places the broad tabletop face on the build plate and prints the legs vertically, so supports are not required for the default geometry. Importing the hardware independently may cause a slicer to drop it to the build plate and lose registration.

## Structural screening

The Structure panel is a transparent geometry-only comparison. It is not structural engineering, a load rating, or certification of the plate/post joint. It does not know the actual fastener pattern, screw embedment, slotted-hole direction, wood defects, moisture movement, glue quality, plate grade, floor flatness, impact loads, or fatigue. The score is useful for comparing parameter changes inside this model; it must not be used as permission to build an untested joint.

The transformed-section channel estimate assumes white oak at 12.27 GPa, steel at 200 GPa, and a fixed 1/8 in channel wall because wall thickness is not an editable Plate Table parameter. The C-channel calculation credits only tabletop-plane behavior. It does not brace the posts or guarantee composite action across moving/slotted tabletop fasteners.

### Apronless post racking

`24 + 28 × postBendingFactor × heightFactor^1.7 + 24 × plateEngagementFactor × heightFactor^1.2`

The post factor is the square root of the square-post second-moment ratio, so it varies with post size squared while the underlying section varies with size to the fourth power. Height increases the lateral lever arm. Plate engagement combines plate area, thickness, projection beyond the post, and edge setback. The 24-point base prevents this geometry proxy from implying that four freestanding posts have zero capacity, but it does not model connection slip.

### Plate-joint leverage

`28 + 48 × sqrt(plateAreaFactor × plateThicknessFactor) × plateProjectionFactor × setbackFactor × heightFactor^1.4`

This screen isolates the geometry available to the recessed corner plate. Larger or thicker plates and more projection beyond the post improve the comparison. The value deliberately remains a proxy: hole pattern, screw diameter, embedment, plate bending, post mortise fit, and repeated-load loosening are outside the model.

### Tabletop torsional rigidity

`24 + 34 × plateEngagementFactor × heightFactor + 18 × clamp((channelTorsionFactor − 1) ÷ 0.15, 0, 1.5)`

The plate connections supply one part of the top-plane load path. The other part comes from a transformed oak/steel section for the three widthwise channels, averaged across the tabletop by channel strip fraction and cross-width coverage. Spreading the first and third channels farther apart increases the distribution factor. This is not credit for post bracing.

### Tipping margin

`20 + 80 × min(1, min(contactWidth ÷ 2 ÷ height, contactLength ÷ 2 ÷ height) ÷ 0.65)`

The smaller half-footprint-to-height ratio controls. Leg edge inset shrinks both contact dimensions. The metric compares static geometry only; it is not a safe-load prediction for someone sitting, leaning hard, or climbing on the tabletop.

### Floor rocking tolerance

With leveling enabled: `96 + 2 × clamp(minimumEmbeddedRod ÷ (4 × rodDiameter), 0, 1)`

With leveling disabled: `52 + 20 × clamp((legSize − 2 × bottomRoundover) ÷ legSize, 0, 1)`

### Independent leveling feet

Four threaded feet adjust independently. Each installed extension includes the pad thickness plus exposed rod, and the corresponding wood post shortens by exactly that extension. The tabletop stays at the selected finished height and each pad bottom stays on the common floor plane. The live limits require the pad to fit under the post, the rod to enter the flat face inside the bottom roundover, and at least the greater of two rod diameters or 1 in of rod embedment. The score is a geometry check, not certification of the threaded insert, threads, pullout strength, or floor bearing.

When leveling is disabled, the four fixed wood contacts are statically over-constrained on a non-planar floor. A larger flat area at each post earns limited contact credit, but fixed posts cannot independently level themselves; field shimming is then necessary when the floor is not flat.

### Member stiffness

`100 − max(0, legSlenderness − 7.5) × 4 − max(0, widthSlenderness − 24) × 1.2 − max(0, lengthSlenderness − 48) × 0.45`

Post slenderness is clear post height divided by square post size. Tabletop slenderness uses the equivalent thickness from the transformed oak/steel channel calculation. Widthwise channels improve the tabletop term only; they do not change the post term or certify long-term fastener behavior.

### Overall weighting and grades

The weighted score is 24% apronless post racking, 24% plate-joint leverage, 18% tabletop torsion, 12% tipping, 10% floor rocking, and 12% member stiffness. Scores are clamped to 0–100. Grade bands are A at 85 or above, B at 75, C at 65, D at 50, and F below 50. The panel also recomputes the complete score at one inch lower and one inch higher while leaving every other parameter fixed.

Before irreversible joinery, build a full-size corner mock with the actual plate and fasteners. Perform a shim-free diagonal corner-rock test, a repeatable measured lateral push at tabletop height, loaded deflection checks, witness-mark inspection for plate/post slip, and repeated-load retesting. The physical result overrides this screen.
