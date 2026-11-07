# Carbon Filter Holder

The supplied filter is **3 × 3 × 1/4 in**, exactly **76.2 × 76.2 × 6.35 mm**.
The holder bonds to the underside of a trash-can lid with a solid, flat glue
back. Three retaining lips frame the left, right and rear of the trash-facing
opening. Two rounded side bumps near the front catch the seated pad's front
corners without a crossbar across the middle of the insertion edge.

The detents assume a **flexible, compressible carbon pad**. They are integral
bumps, not flexible latch arms. Compress the pad edges slightly past them when
inserting or removing the filter. The nominal black preview does not simulate
that compression, and a rigid frame has not been accommodated or tested.

Default dimensions:

| Feature | Dimension |
| --- | --- |
| Overall holder | 82 × 84.4 × 15.35 mm (about 3.23 × 3.32 × 0.60 in) |
| Nominal channel | 77.2 mm wide × 7.15 mm high |
| Width and rear clearance | 0.5 mm per side and at rear |
| Thickness allowance | 0.8 mm total |
| Glue back | 2 mm thick, uninterrupted 82 × 84.4 mm flat face |
| Side and rear walls | 2.4 mm thick |
| Side and rear retaining lips | 5 mm projection, 4.5 mm overlap on the pad |
| Lip tips | 1.2 mm thick above a 5 mm rise at 45 degrees |
| Rounded front detents | 4 mm long, maximum 0.9 mm projection per side |
| Detent engagement | 0.4 mm into each nominal pad edge; 0.8 mm total width interference |
| Minimum detent throat | 75.4 mm |
| Front pocket | 5.3 mm from mouth to seated pad front |
| Seated detent gap | 0.5 mm between bump ends and pad front edge |
| Exposed pad face | 82.98% of nominal face area projected through the opening |

The front pocket positions the fully inserted pad behind the bumps so the pad
is not held in continuous lateral compression. Its rear edge stops 0.5 mm short
of the rear wall. The detent depth follows the lateral clearance plus the
editable engagement value, preserving the selected nominal edge interference.
Detent length adjusts pocket length and total holder length; full preview
withdrawal includes this extra travel.

Print with the glue face on the bed and lips up. Lip undersides grow inward at
45 degrees above the nominal channel; detents grow vertically from the backing.
The model is designed to print without supports. The same parametric geometry
drives the viewer, thumbnails, Save/Fork snapshots, default STL and exports.
The filter stand-in never enters the printable STL. Export coordinates use mm.

Measure the actual filter and test detent passage, repeated replacement and
retention during lid motion before gluing. Keep adhesive out of the channel,
confirm a sufficiently flat lid area and leave room at the front for withdrawal.
Detent force, pad damage, frame compatibility, adhesive compatibility and
loaded lid retention remain unverified; geometric engagement is not a measured
holding force or a positive locking mechanism.

`npm run audit -- carbon-filter-holder` independently checks supplied units,
derived envelope, integrated volume, finite nondegenerate triangles, exactly
two opposing triangles per edge, one connected outward-oriented shell,
Euler characteristic, Z=0, the clear center path, intentional detent contact,
specified throat, seated-pad clearance, three lip captures, parameter limits,
preview exclusion and exact default STL/procedural parity across fit variations.

`tests/e2e/carbon-filter-holder.spec.ts` covers catalog access, editable lip and
detent controls, preview, coupled withdrawal travel, URL restoration, active
detent settings in export and desktop/mobile containment. Physical pad fit and
adhesion remain a visible runtime warning.

Regenerate the default STL with:

```sh
node models/carbon-filter-holder/generate-source.mjs
```
