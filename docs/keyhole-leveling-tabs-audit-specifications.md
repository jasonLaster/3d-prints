# Keyhole leveling tabs assertions

Runtime contract: `public/models/keyhole-leveling-tabs/model.json`. Geometry: `src/models/keyholeLevelingTabs.ts`. Original user specification: `models/keyhole-leveling-tabs/reference/design-specification.txt`. PLA Tough is accepted per the user's correction.

`npm run audit -- keyhole-leveling-tabs` verifies all eight exact offsets, downward contact shift / upward lift, actual negative-Z leg and bearing datums, tactile bump counts from apex vertices, connected manifold topology with consistent winding and positive volume, bed-plane placement, STL vertex parity, parameter extremes, fit-warning failures, and eight separate grounded 3MF objects within a conservative 250 mm envelope.

Focused E2E: `tests/e2e/keyhole-leveling-tabs.spec.ts`. It verifies selection, URL reload, assumed-fit warnings, preview switching, selected-tab export independent of view, accessible keyboard use, and desktop/mobile containment.

The slot roof is assumed flat. Keyhole, screw and wall dimensions are editable assumptions except the supplied 7.62 mm head diameter. Runtime checks distinguish calculated fit from the always-pending roof seating, actual frame strength, adhesive retention and physical loaded fit test. Never turn these pending checks green solely because a mesh audit passed.
