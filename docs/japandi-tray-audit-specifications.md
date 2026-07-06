# Japandi Tray Parametric Audit Specifications

The source STL is treated as the original Japandi tray body. The parametric model keeps the tray centered while allowing length, width, wall height, floor thickness, and rib relief to change independently.

## Dimension Targets

- Default tray length: `190.057 mm`, measured on the rotated STL footprint long axis.
- Default tray width: `110.057 mm`, measured on the rotated STL footprint short axis.
- Default tray wall height: `20.000 mm`, measured on the STL Z axis.
- Model units remain millimeters.
- Length and width are independent so the square source tray can become an oblong tray.

## Required Invariants

- Keep the original STL available as an overlay reference.
- Do not let floor thickness equal or exceed total wall height.
- Keep width, length, and height controls independent.
- Preserve the source tray center axis while resizing.
- Keep rib relief within the configured printable range.

## Audit Checks

- Source STL exists at `public/models/japandi-tray/japandi-tray.stl`.
- Model JSON declares the `japandi-tray-v1` viewer.
- Source STL footprint length, footprint width, and height match declared defaults within tolerance.
- Length, width, height, floor thickness, and rib relief defaults are inside their configured limits.
- Runtime audit checks include tray length, tray width, wall height, floor thickness, rib relief, aspect ratio, interior depth, and original reference.
