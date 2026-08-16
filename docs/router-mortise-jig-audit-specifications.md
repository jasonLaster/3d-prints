# Photo-Matched Handheld Router Mortise Jig Audit Specifications

This printable system follows the supplied workshop photos: two pale longitudinal deck rails adjust on top to set mortise width, two tan fixed-thickness crosswise stops set length, and two independent L-shaped jaws clamp around the board from below. A removable positioning bridge and separate vertical centering fixture share the same mortise datum. The router, guide bushing, cutter, workpiece, clamps, knobs, washers, and screws are preview-only stand-ins.

## Router-opening contract

The calculated travel on each axis is `mortise + guide-bushing outside diameter − cutter diameter + total wiggle room`. The 8 × 30 mm default mortise with a 6 mm cutter, 16 mm bushing, and 0.25 mm total diametral wiggle room requires 18.25 × 40.25 mm. The top-rail gap is derived directly from the calculated 18.25 mm width; it is not a separate thickness or clearance control. Dependent limits prevent the cutter from exceeding the mortise or the guide bushing from losing radial clearance.

Four UI presets cover 6 × 25, 8 × 30, 10 × 40, and 12 × 50 mm mortises. Six physical witness ticks beside each lower-jaw slot mark 18, 24, 30, 38, 45, and 50 mm stock thicknesses.

## Photo-matched assemblies

- Main jig: two 260 mm deck rails whose spacing is the calculated router opening, two 210 × 70 × 8 mm fixed-thickness length stops, two 220 × 42 × 30 mm under-deck L-shaped thickness jaws, four stop knobs with 32 mm washers, four lower-jaw screws, a sample workpiece, and a 100 mm router-base stand-in.
- Positioning setup: the main frame plus a removable 70 × 54 × 8 mm slotted bridge.
- Centering setup: a 260 × 180 × 12 mm base, two 180 × 16 × 34 mm upright guides, vertical sample stock, and adjustable knob/washer fasteners.

Twelve M5 heat-set insert pockets are represented across the printable set. The lower L-jaw pockets sit in 10 mm horizontal flanges, preserve at least 16.4 mm of lateral wall, and retain a 4 mm floor at the 6 mm default insert depth. The 18 mm rail screws preserve 8 mm of nominal engagement through the fixed 10 mm deck rails. Actual inserts, washers, and screws must be measured before printing.

## Stability and strength screen

The router-base overlap, minimum rail/slot webs, lower-jaw screw travel, clamp ledge, insert walls, screw engagement, and assembly relationships are runtime audit checks. A conservative 150 N elastic rail screen at the defaults reports 0.001 mm calculated deflection and a 59.8× allowable-stress margin. This is a comparative design screen, not structural certification.

## Preview and export contract

Export yields ten individual files using the current parameter state:

- left and right deck rails
- front and rear adjustable stops
- left and right under-deck L-shaped thickness jaws
- positioning bridge
- centering base
- centering left and right guides

Each STL must contain finite coordinates, no degenerate triangles, exactly two triangles per mesh edge, watertight manifold surfaces, the configured envelope, and a Z = 0 support-free print orientation. The L-jaw flange, pocket layer, and upright cheek intentionally overlap by 0.2 mm for slicer fusion. The M5 heat-set insert pockets face up in the recommended print orientation.

## Shop-use boundary

This model does not certify a router setup. Verify the actual cutter, bushing, base support, insert fit, screw length, workpiece clamping, and clearance with a scrap cut. Use shallow passes and follow the router and cutter manufacturers' instructions.
