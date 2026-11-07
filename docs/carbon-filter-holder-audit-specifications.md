# Carbon Filter Holder

The supplied filter is **3 × 3 × 1/4 in**, exactly **76.2 × 76.2 × 6.35 mm**.
The holder bonds to the underside of a trash-can lid. Its solid, flat back is
the glue surface. The opposite, trash-facing face is open between two narrow
retaining lips. A rear wall stops insertion, and the fourth edge remains open
with no front crossbar, latch or grille in the slide path.

Default dimensions:

| Feature | Dimension |
| --- | --- |
| Overall holder | 82 × 79.1 × 13.35 mm (about 3.23 × 3.11 × 0.53 in) |
| Clear slide opening | 77.2 mm wide × 7.15 mm high |
| Width clearance | 0.5 mm per side |
| Rear clearance | 0.5 mm; seated filter front is flush with the mouth |
| Thickness allowance | 0.8 mm total |
| Glue back | 2 mm thick, uninterrupted 82 × 79.1 mm flat face |
| Side and rear walls | 2.4 mm thick |
| Side retaining lips | 3 mm projection, 2.5 mm overlap over each filter edge |
| Lip tips | 1.2 mm thick above a 3 mm rise at 45 degrees |
| Exposed filter face | 93.44% of nominal face area, projected through the opening |

Print with the glue face on the bed and the lips up. The lip undersides rise at
45 degrees above the clear sliding envelope so they do not require supports.
The same `createCarbonFilterHolderGeometry` function drives the interactive
viewer, thumbnails, Save/Fork snapshots, default STL and current-parameter
exports. The optional black filter and its withdrawal position are preview
stand-ins only and never enter the exported STL. Exported coordinates use mm.

The default is a nominal prototype: measure the actual filter, test sliding
fit before gluing, and check that the lid has enough flat area. Keep adhesive
out of the channel and allow room at the open edge for replacement. Position
the rear stop so gravity pushes the filter toward it as the lid opens; this
design has no positive latch. Lid shape, adhesive compatibility, adhesion
strength, filter flexibility and retention during lid motion are unverified.

`npm run audit -- carbon-filter-holder` independently checks supplied units,
derived envelope, geometric volume, finite nondegenerate triangles, exactly
two opposite triangles per edge, one connected outward-oriented shell,
Euler characteristic, Z=0, sampled full-filter insertion paths, open window,
side capture, parameter limits and exact default STL/procedural parity. It
includes small/thin, large/thick, loose-fit, thick-wall and minimum-wall cases.

`tests/e2e/carbon-filter-holder.spec.ts` covers catalog access, editable
dimensions, preview, URL restoration, current-parameter STL export and
desktop/mobile containment. Physical fit and adhesion remain a visible runtime
warning rather than a computational pass.

Regenerate the default STL with:

```sh
node models/carbon-filter-holder/generate-source.mjs
```
