# Photo-Matched Handheld Router Mortise Jig Audit Specifications

This printable system follows the supplied workshop photos: two pale longitudinal deck rails, two tan crosswise adjustable end stops, a narrow center router path, a removable positioning bridge, and a separate vertical centering fixture. The router, guide bushing, cutter, workpiece, clamps, knobs, washers, and screws are preview-only stand-ins.

## Router-opening contract

The calculated travel on each axis is `mortise + guide-bushing outside diameter − cutter diameter + total wiggle room`. The 8 × 30 mm default mortise with a 6 mm cutter, 16 mm bushing, and 0.25 mm total diametral wiggle room requires 18.25 × 40.25 mm. The default 20 mm rail gap clears the required width, and dependent limits prevent the cutter from exceeding the mortise or the guide bushing from losing radial clearance.

Four preset markers cover 6 × 25, 8 × 30, 10 × 40, and 12 × 50 mm mortises. Stock-width references cover 38, 50, 64, and 76 mm.

## Photo-matched assemblies

- Main jig: two 260 × 100 × 10 mm deck rails, two 210 × 70 × 8 mm end stops, two 220 × 14 × 30 mm under-deck jaws, four stop knobs with 32 mm washers, a sample workpiece, and a 100 mm router-base stand-in.
- Positioning setup: the main frame plus a removable 70 × 54 × 8 mm slotted bridge.
- Centering setup: a 260 × 180 × 12 mm base, two 180 × 16 × 34 mm upright guides, vertical sample stock, and adjustable knob/washer fasteners.

Twelve M5 heat-set insert pockets are represented across the printable set. The default 7.2 mm pockets preserve 3.4 mm side walls in the 14 mm jaws. The 18 mm rail screws preserve 8 mm of nominal engagement through the 10 mm rails. Actual inserts, washers, and screws must be measured before printing.

## Stability and strength screen

The router-base overlap, minimum rail/slot webs, clamp ledge, insert walls, screw engagement, and assembly relationships are runtime audit checks. A conservative 150 N elastic rail screen at the defaults reports 0.010 mm calculated deflection and a 28.2× allowable-stress margin. This is a comparative design screen, not structural certification.

## Preview and export contract

Export yields ten individual files using the current parameter state:

- left and right deck rails
- front and rear adjustable stops
- left and right under-deck fence jaws
- positioning bridge
- centering base
- centering left and right guides

Each STL must contain finite coordinates, no degenerate triangles, exactly two triangles per mesh edge, a watertight two-manifold shell, the configured envelope, and a flat Z = 0 print orientation. The M5 heat-set insert pockets face up in the recommended print orientation.

## Shop-use boundary

This model does not certify a router setup. Verify the actual cutter, bushing, base support, insert fit, screw length, workpiece clamping, and clearance with a scrap cut. Use shallow passes and follow the router and cutter manufacturers' instructions.
