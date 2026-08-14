# Handheld Router Tenon Jig Audit Specifications

The jig is a printable bench-edge bridge for shaping a centered tenon with a handheld trim router and a bearing-guided cutter. It adapts the supplied photo into five printable parts: one stepped base bridge, two sliding cheek guides, and two sliding edge guides. The auxiliary router sub-base, router, bearing bit, hose-band depth stop, M5 hardware, and workpiece shown in the viewer are preview-only stand-ins.

## External bearing-guide and accuracy contract

For each tenon axis, the guide opening is:

`target tenon + total fit allowance − guide-bearing outside diameter + cutter diameter`

The default 10 mm thick × 40 mm wide tenon, equal 12.7 mm cutter and bearing, and 0.2 mm of total extra material produce 10.2 × 40.2 mm guide openings. A positive fit allowance leaves that much total extra tenon material for a final hand fit. Cutter and bearing dimensions remain independent so the generated positions follow the measured bit rather than assuming they are equal.

The four UI presets are starting points, expressed as thickness × width × length:

- 6 × 30 × 25 mm
- 8 × 40 × 30 mm
- 10 × 40 × 30 mm
- 12 × 50 × 35 mm

Small through-witness marks identify 6, 8, 10, and 12 mm tenon thicknesses and 30, 40, 50, and 60 mm widths. The two-bolt slots retain at least 1.25 mm of bolt-center travel margin at the complete configured opening range. The marks are setup references, not substitutes for measuring the bearing, cutter, guide gap, and resulting scrap cut.

## Sequential assembly and hardware contract

The default base bridge is 210 × 170 mm. Its 12 mm recessed floor, 22 mm raised router-support surface, and rounded 96 × 64 mm through-throat form a cross-shaped guide recess. Install one opposing guide pair at a time:

- The two 70 × 110 × 10 mm cheek guides set the tenon-width pass.
- The two 100 × 52 × 10 mm edge guides set the tenon-thickness pass.

Each installed guide seats on the recessed floor with its top flush to the raised platform. Each plate uses two fasteners—86 mm apart on a cheek guide and 80 mm apart on an edge guide—so it cannot pivot around one screw. Both guide pairs remain inside their support recess throughout their configured travel. The base retains 22 mm front and rear clamp ledges.

Eight blind, top-opening M5 heat-set insert pockets receive the sliding guides. The default pockets are 7.2 mm diameter × 7 mm deep with a 0.4 mm entry lead-in, at least 3 mm of surrounding web, and a 5 mm closed floor. The default stack uses eight M5 inserts, eight M5 × 16 mm screws, and eight 16 mm outside-diameter × 1.5 mm washers. It provides 4.5 mm of modeled thread engagement and 2.5 mm of tip clearance. Measure the actual insert, screw, washer, and printed plate before assembly; purchased heat-set inserts and nominal screw lengths vary.

## Router support and stability contract

The router stand-in uses a 150 mm auxiliary router sub-base resting directly on the coplanar active guides and raised platform. At the default 10 × 40 mm setup, the modeled base retains at least 8.69 mm of radial reach onto a raised corner support. The 150 mm default also retains at least 3 mm of reach at the conservative configured opening and bearing limits. A smaller commercial sub-base may be used only when the live support audit passes and a physical no-rocking check confirms that it remains supported throughout the complete cutter path.

The base and stock need independent clamps. The modeled 22 mm front and rear ledges are the minimum clamping surfaces; clamp bodies must not enter the router path or distort the raised platform. Tighten both screws on each active guide and verify that both guides stay flush and parallel before routing.

## Geometry-only strength screens

The strength checks are comparative screens, not a load rating or certification. They use a conservative printed-plastic elastic modulus of 1,200 MPa, 12 MPa allowable stress, a 75 N comparison load applied to one load path, a 0.3 mm deflection ceiling, and a minimum 4× stress margin.

- The base is screened as one 45.8 mm effective-width strip spanning the 96 mm throat and carrying the full 75 N comparison load. The default result is 0.175 mm deflection, 1.64 MPa stress, and a 7.3× stress margin.
- Each active guide is screened as a cantilever from the throat edge to the bearing face, again carrying the full comparison load. The worst default result is 0.056 mm deflection, 1.40 MPa stress, and an 8.6× stress margin. At the widest cantilever in the configured opening range, the 10 mm guide remains below 0.244 mm deflection with at least a 5.7× stress margin.

These beam models do not capture print-layer adhesion, creep, heat, impact, clamp distortion, insert pull-out, local bearing indentation, defective filament, or router vibration. Print the base so its broad bottom face is on the build plate, use a tough material with validated layer bonding, and reject any part with warping, cracks, delamination, loose inserts, or a rocking support surface.

## Preview and export contract

The assembled viewer shows the selected guide pair only, a translucent 64 × 38 mm workpiece below the guide plane, the finished 10 × 40 × 30 mm tenon volume, a 150 mm auxiliary router sub-base resting on the 22 mm support plane, a 65 mm motor, the bearing in the guide layer, the cutter below that layer, a depth-stop band, eight inserts, and the four active screws and washers. These explanatory parts remain excluded from printable exports.

Export yields five individual files using the current parameter state:

- base bridge, flat with recess and insert pockets facing up
- left and right cheek guides, flat with slots facing up
- front and rear edge guides, flat with slots facing up

All five files must contain finite coordinates, no degenerate triangles, watertight two-manifold edges, and the configured bounds. No support geometry is required in the recommended orientation.

## Physical acceptance checks before routing

The digital model cannot verify the printer, filament, purchased hardware, router, bit, or clamping setup. Before powered use:

1. Validate the insert pocket and screw stack on a small sacrificial print. Install each insert below flush without breaking through the 5 mm floor, then confirm at least 4.5 mm thread engagement and at least 0.5 mm tip clearance.
2. Assemble the width setup and thickness setup separately. Verify the active guides are flush to the raised platform within 0.1 mm, parallel within 0.1 mm over 50 mm, and match the calculated opening within 0.1 mm.
3. Sweep the unplugged router through the full path. The auxiliary sub-base must not rock or lose contact, the bearing must remain on the intended guide edge, and the cutter, collet, clamps, washers, and screws must remain clear.
4. Clamp the empty jig and apply a measured 75 N static load at the throat while checking with a dial indicator. Reject it if deflection exceeds 0.3 mm, an insert moves, a guide slips, or any crack or permanent set appears.
5. Make both passes on scrap using the exact stock, bit, bearing, depth stop, feed direction, and clamp arrangement intended for the joint. Measure the tenon at both ends and the middle, then tune the total fit allowance for the printer and wood species.

This model does not certify a router setup. Check cutter rotation, bearing condition, router-base support, fastener clearance, protrusion, and depth stop before power is applied. Take shallow conventional passes and follow the router and cutter manufacturers' instructions. The source video mentions a back-cutting technique; this model does not prescribe a climb cut. Use sacrificial backing or another manufacturer-approved method unless the router and cutter instructions explicitly support a different procedure.
