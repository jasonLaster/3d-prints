# Keyhole leveling tabs assertions

Runtime contract: `public/models/keyhole-leveling-tabs/model.json`. Geometry: `src/models/keyholeLevelingTabs.ts`. Original user specification: `models/keyhole-leveling-tabs/reference/design-specification.txt`. PLA Tough is accepted per the user's correction.

`npm run audit -- keyhole-leveling-tabs` verifies all eight exact offsets, downward contact shift / upward lift, actual negative-Z leg and bearing datums, absence of raised bumps and full outer pad bed contact, connected manifold topology with consistent winding and positive volume, bed-plane placement, STL vertex parity, parameter extremes, fit-warning failures, and eight separate grounded 3MF objects within a conservative 250 mm envelope.

Focused E2E: `tests/e2e/keyhole-leveling-tabs.spec.ts`. It verifies selection, URL reload, assumed-fit warnings, preview switching, selected-tab export independent of view, accessible keyboard use, and desktop/mobile containment.

The slot roof is assumed semicircular, with radius equal to half its narrow-slot width. The 3 mm root has a matching circular crown, while its flat lower screw-contact datum remains at Y=−offset. Crown vertices are checked against the circle equation for all eight variants; width limits preserve the crown for shallow offsets. Keyhole, screw and wall dimensions are editable assumptions except the supplied 7.62 mm head diameter. Runtime checks distinguish calculated fit from the always-pending roof seating, actual frame strength, adhesive retention and physical loaded fit test. Never turn these pending checks green solely because a mesh audit passed.

The smooth outer pad face must rest entirely on print Z=0, with the inward leg pointing upward. Assertions sum actual bed triangles and compare their area with the full rounded rectangular pad footprint, check footprint dimensions and maximum height, and prove legacy bump URL values do not change the geometry. The original specification retains its historical bump requirement; the user's later removal request overrides it. The pad/leg shared boundary is triangulated explicitly to avoid T-junctions. The offset and rounded crown remain unchanged.
