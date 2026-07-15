# Simple Box Audit Specifications

The Simple Box is a smooth-wall organizer model that is independent from the Japandi Tray. It defaults to `13 x 3 x 3.5 in`, includes dividers at `5.75 in` and `9 in`, and supports an underside stacking or lid-registration lip.

## Source Geometry Gates

- The source STL must contain only finite coordinates and non-degenerate triangles.
- Every source edge must belong to exactly two triangles.
- The source must be one connected shell with non-zero enclosed volume.
- Bounds must match `330.2 x 76.2 x 88.9 mm` and rest on `Z=0`.
- The model must not expose a rib-relief parameter.

## Generated Export Gates

- Runtime morphing must preserve the requested length, width, and height axes.
- The default export must contain finite coordinates, no degenerate triangles, and no non-manifold edges.
- The stacking lip must overlap the floor and use the wall thickness plus configured clearance for its mating dimensions.
- The receiving opening minus the registration lip must equal exactly twice the configured clearance in both axes.
- The default stacking lip must engage at least `1 mm` inside the receiving box without touching its walls.
- The box registration feature must be a solid stacking foot with a transition shoulder so the floor is continuously supported during printing.
- Divider plates must overlap the floor and side walls, remain ordered, and stay inside the box length.
- The exported Z span must include the box height and the underside lip.
- The separately exported lid must be finite and manifold, match the box footprint, and use the same proven clearance allowance.
- The combined print-layout STL must keep the box and print-oriented lid disconnected with a `10 mm` XY gap.
- The combined layout must independently bed both shapes at `Z=0`; the box is lifted by its stacking-foot depth so the lid cannot float relative to a negative-Z box.

## UI Gates

- Default dimensions display as `13`, `3`, and `3 1/2 in`.
- Default divider positions display as `5 3/4` and `9 in`.
- Dividers can be removed and added without exposing internal count slots.
- Sub-`1/32 in` fit clearances display as decimal inches rather than `0`.
- The Simple Box inspector contains no rib control.
- Assembly preview controls must show the box alone, a seated stacked pair, and the fitted lid.
- Print layout preview must show the lid beside the box in its flat-side-down orientation.
