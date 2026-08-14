# Handheld Router Tenon Jig Audit Specifications

The jig is a printable bench-edge bridge for shaping a centered tenon with a handheld trim router and a bearing-guided cutter. It adapts the supplied photo into five printable parts: one base bridge, two sliding cheek guides, and two sliding edge guides. The router, bearing bit, hose-band depth stop, M5 hardware, and workpiece shown in the viewer are preview-only stand-ins.

## External bearing-guide contract

For each tenon axis, the guide opening is:

`target tenon + total fit allowance − guide-bearing outside diameter + cutter diameter`

The default 10 mm thick × 40 mm wide tenon, equal 12.7 mm cutter and bearing, and 0.2 mm of total extra material produce 10.2 × 40.2 mm guide openings. A positive fit allowance leaves that much total extra tenon material for a final hand fit. Cutter and bearing dimensions remain independent so the generated positions follow the actual bit rather than assuming they are equal.

The four UI presets are starting points, expressed as thickness × width × length:

- 6 × 30 × 25 mm
- 8 × 40 × 30 mm
- 10 × 40 × 30 mm
- 12 × 50 × 35 mm

## Bridge, guide, and hardware contract

The default base bridge is 210 × 160 × 12 mm with a rounded 96 × 64 mm through-throat for vertical stock. Six blind, top-opening M5 heat-set insert pockets receive the sliding guides. The default pockets are 7.2 mm diameter × 6 mm deep with a 0.4 mm entry lead-in, at least 3 mm of surrounding web, and a 6 mm closed floor.

Two 84 × 120 × 8 mm cheek guides each use two 6.6 mm through-slots. Two 110 × 52 × 8 mm edge guides each use one through-slot. The lower edge-guide level and upper cheek-guide level keep the physical plates from occupying the same space. Use one opposing guide pair at a time and verify that the bit bearing is registered to the intended level before routing.

Small through-witness marks identify 6, 8, 10, and 12 mm tenon thicknesses and 30, 40, 50, and 60 mm widths. They are setup references, not substitutes for measuring the resulting scrap cut.

The default hardware assumption is six M5 heat-set inserts, six M5 knob screws, and six 16 mm outside-diameter washers. Screw length must be selected against the active guide level, washer, base thickness, and measured insert depth so it engages the insert without bottoming in the blind pocket.

## Preview and export contract

The assembled viewer includes both guide levels, a translucent 64 × 38 mm workpiece, the finished 10 × 40 × 30 mm tenon volume, a 90 mm router-base stand-in, 65 mm motor, bearing-guided cutter, depth-stop band, and six heat-set inserts. These explanatory parts remain excluded from printable exports.

Export yields five individual files using the current parameter state:

- base bridge, flat with insert pockets facing up
- left and right cheek guides, flat with slots facing up
- front and rear edge guides, flat with slots facing up

All five files must contain finite coordinates, no degenerate triangles, watertight two-manifold edges, and the configured bounds. No support geometry is required in the recommended orientation.

## Shop-use boundary

This model does not certify a router setup. Clamp the bridge to a stable bench and clamp the workpiece independently. Check cutter rotation, bearing contact, router-base support, fastener clearance, protrusion, and depth stop before power is applied. Make a scrap test and take shallow conventional passes. The source video mentions a back-cutting technique; this model does not prescribe a climb cut. Use sacrificial backing or another manufacturer-approved method unless the router and cutter instructions explicitly support a different procedure.
