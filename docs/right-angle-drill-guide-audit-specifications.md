# 90° Drill Guide

A single printable block guides a drill perpendicular to a flat wood surface. Six
through-bores support **8.50, 8.75, 9.00, 9.25, 9.50 and 9.75 mm** bits. This is a
new procedural design; no commercial guide geometry or supplied image was used
as a dimensional reference.

## Dimensions and fit

The default block measures **130 × 44 × 25 mm** (approximately 5.12 × 1.73 ×
0.98 inches). Bore centers are 18 mm apart. The end lands extend 20 mm beyond
the outermost bore axes, providing clamping space. Every axis lies on the width
centerline. Paired V notches along both long edges locate each axis; align the
selected pair with a line drawn through the target hole center. The center is
22 mm from either straight long edge by default. Support the seating face on a
flat workpiece and clamp an end land securely before drilling.

| Nominal bit / engraved label (mm) | Default modeled bore (mm) |
| --- | --- |
| 8.50 | 8.65 |
| 8.75 | 8.90 |
| 9.00 | 9.15 |
| 9.25 | 9.40 |
| 9.50 | 9.65 |
| 9.75 | 9.90 |

The adjustable total diametral clearance defaults to **0.15 mm** (0.075 mm per
side); range 0–0.40 mm. Each bore has a 0.6 mm top entry chamfer, leaving **24.4 mm
of straight guidance**. The bottom exits have no chamfer, retaining the flat
seating datum. Metric labels are engraved 0.6 mm deep into the top and remain
nominal bit sizes when clearance or display units change.

Editable ranges are guide height 18–35 mm, pitch 16–24 mm and width 38–60 mm.
Length derives from five pitches plus 40 mm; the fixed nominal size set stays in
0.25 mm increments. Minimum web at chamfered entries remains above 4.7 mm across
the permitted range. Source, viewer, library thumbnail and exports use the same
geometry builder, including all labels and alignment notches.

## Printing and use

Print with the flat seating face on the build plate and bores vertical. No
supports are needed. Suggested starting settings: PETG or PLA, 0.2 mm layers,
five perimeters and 40% infill. These settings have **not been physically tested**.

Check the printed bores with the actual bits on scrap wood. Printer calibration,
shrinkage and first-layer expansion affect fit. Choose clearance so the bit
slides freely without appreciable rocking; do not force a spinning bit into a
tight printed hole. Printed bores are sacrificial and can wear or soften. Use
slow, short drilling passes, withdraw to clear chips and recheck fit. Repeated
precision use warrants a separate design for specified hardened drill bushings.

The CAD axes are exactly 90° to the base. Printed fit, clamping, flatness, drill
runout and wear determine actual hole accuracy; this is not a certified angular
accuracy claim. The guide's height reduces available bit reach by 25 mm at the
default setting; ensure adequate cutting length for the workpiece.

## Verification

- `node models/right-angle-drill-guide/generate-source.mjs` regenerates the STL.
- `npm run audit -- right-angle-drill-guide` checks the exact six sizes and all
  16 parameter-limit combinations plus defaults. It verifies closed, oriented,
  connected manifold topology, finite nondegenerate triangles, positive signed
  volume and Z=0 seating; ray probes check every open through-axis and constant
  radius at three heights in four directions. The shipped STL must match the
  generated default vertices exactly.
- `tests/e2e/right-angle-drill-guide.spec.ts` checks the envelope, desktop and
  phone rendering, fine-clearance editing, URL reload and edited STL parity.
- Build and static catalog contract checks cover integration.

Physical fit, drill wear and angular accuracy remain untested.
