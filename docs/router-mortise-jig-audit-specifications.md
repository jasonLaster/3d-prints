# Handheld Router Mortise Jig Audit Specifications

The jig is a printable, bridge-style guide for routing a rounded mortise with a handheld trim router and template guide bushing. It adapts the supplied photo reference into three printable parts: one guide plate and two fence jaws. The router, guide bushing, cutter, and workpiece shown in the viewer are preview-only stand-ins with configurable dimensions, not printable parts.

## Guide-opening contract

For each axis, the template opening is:

`target mortise + guide-bushing outside diameter − cutter diameter + total template wiggle room`

The default 8 × 30 mm target, 6 mm cutter, 16 mm guide bushing, and 0.25 mm total template wiggle room produce an 18.25 × 40.25 mm rounded opening. The cutter may not exceed the mortise width. The guide bushing must preserve at least 1 mm of radial clearance around the cutter.

The four UI preset markers are starting points, not locked standards:

- 6 × 25 mm target with a 6 mm cutter
- 8 × 30 mm target with a 6 mm cutter
- 10 × 40 mm target with an 8 mm cutter
- 12 × 50 mm target with a 10 mm cutter

## Plate and fence contract

The default guide plate is 220 × 120 × 12 mm. Four 6.6 mm-wide adjustment slots align with insert pockets at X = ±75 mm. The slots cover workpieces from 20 to 80 mm wide. Small through-witness marks beside the slots identify 38, 50, 64, and 76 mm stock widths.

Each 190 × 14 × 24 mm fence jaw contains two blind, top-opening M5 heat-set insert pockets. The default pocket is 7.2 mm diameter and 6 mm deep with a 0.4 mm lead-in, leaving 3.4 mm side walls and an 18 mm closed floor. Pocket diameter and depth remain editable for the inserts actually measured at the bench.

The default hardware assumption is four M5 heat-set inserts, four M5 × 20 mm knob screws, and four 16 mm outside-diameter washers. The 20 mm screw length is paired with the 12 mm default plate; a different plate thickness requires a correspondingly checked screw length so the insert engages without the screw bottoming in the blind pocket. Hardware is sourced separately and is not represented as printable geometry.

## Preview and export contract

The assembled viewer includes both jaws at the selected workpiece width, a translucent sample workpiece, a 90 mm router-base stand-in, a 65 mm motor stand-in, the selected guide bushing, and the selected cutter. These parts explain the interface and must remain excluded from STL export.

Export yields three individual files using the current parameter state:

- guide plate, flat on Z = 0
- left fence jaw, flat with insert pockets up
- right fence jaw, flat with insert pockets up

All three files must contain finite coordinates, no degenerate triangles, watertight two-manifold edges, and the configured default bounds. No support geometry is required in the recommended orientation.

## Shop-use boundary

This model does not certify a router setup. Verify the actual guide bushing, cutter, insert, screw length, router-base support, and clamp clearance. Make a scrap test, keep both hands on the router, secure the work and jig, plunge only with a plunge-capable base, take shallow passes, and follow the router and cutter manufacturers' instructions.
