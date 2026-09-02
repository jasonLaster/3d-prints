# Adjustable Miter Runner Wedge audit specifications

## Intent and evidence boundary

This model is a parametric replacement for the supplied `Wedge.step` used with the supplied `Main Part.step`. Both AP242 STEP files declare metre units. Their B-rep vertices therefore scale by 1000 for millimetres, and both files are retained byte-for-byte under `models/miter-runner-wedge/reference/`.

- `Wedge.step` SHA-256: `75cde25941fcdc3883ea2909feea02ad5b00ef46277b1f20b5ab054a1bc3c7b4`
- `Main Part.step` SHA-256: `05d187adaab6dd5ef9b90a0f2ce359fecefbe259dc3d83fce44652d8d453a202`
- Wedge solid envelope: 7.397315 × 240.084127 × 5.5 mm
- Main Part solid envelope: 18.8 × 250 × 9.2 mm

The user request is authoritative: change the selectable fit width while keeping the source angle. The STEP files contain geometry and product metadata, not instructions. No file content is treated as a request or fabrication direction.

## Mechanism brief

Coordinates below follow the STEP frame: X is runner width, Y is runner length, and Z is height.

| Part | Location | Fixed or moving | Motion axis | Fastener | Mating surface | Variable controlled | Evidence | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Main Part | Full 250 mm runner body | Fixed reference | None in this model | Four source bores, not modified | Angled upper-right face | Establishes the 18.8 mm minimum outside width | Direct B-rep measurement | High |
| Replacement wedge | Upper-right edge of Main Part | Removable fit part | None after installation | No wedge fastener is present in the supplied solid | Source-locked 1° inner face | Adds width at the straight outside face | Direct B-rep measurement plus user request | High |
| Jig or sled | Above runner | Not modeled | Follows saw slot | User-supplied | Main Part top | Outside this part model | Filename and user request | Medium |
| Miter slot | Saw-table datum | Fixed machine feature | Longitudinal travel | None | Both runner sides | Measured slot width | User request | High |

The fixed datum is the Main Part's 18.8 mm outside width. The one design degree of freedom is the wedge outside face moving in +X. The mating face, thickness, and end angles are fixed. There are no router-base, cutter, bushing, workpiece-registration, knob, or heat-set-insert interfaces in this part.

## Observed, inferred, assumed, and unknown

| Class | Item |
| --- | --- |
| Observed, high confidence | The Wedge is a five-vertex planar profile extruded from Z = 3.7 to 9.2 mm, so its thickness is 5.5 mm. |
| Observed, high confidence | The long mating edge runs from `(15.593369, 9.915873)` to `(11.402685, 250)` mm, which is a 1.000° taper relative to the runner centerline. |
| Observed, high confidence | Both end faces are 40.0° to the runner centerline. |
| Observed, high confidence | The Main Part reaches X = 18.8 mm below the wedge shelf, so changing only the wedge cannot create an assembled runner narrower than 18.8 mm. |
| Inferred, high confidence | Moving the straight wedge face outward while extending both end bevels along their source directions preserves the original mating relationship and angles. |
| Assumed default | A 19.05 mm (3/4 inch) slot with 0.25 mm total running clearance reproduces the source 18.8 mm runner width. |
| Assumed starting range | 0.10–0.35 mm total running clearance is a useful FDM tuning range, not a guaranteed fit. |
| Unknown | Actual slot width variation, printer dimensional error, material shrinkage, edge seam, wear, and the clearance preferred by the user's jig load. |
| Unknown | The source assembly's intended screw operation; the replacement does not change bores or claim a new adjustment mechanism. |

No source conflict was found. The STEP dimensions and face directions agree at both ends. The only material limitation is that a wedge-only replacement cannot solve a slot narrower than the fixed Main Part.

## Parametric contract

For measured slot width `S`, desired total running clearance `C`, source Main Part width `B = 18.8 mm`, and selected finished runner width `R`:

```text
finished runner width   R = S - C
allowed fit             R >= B
wedge outside offset    D = R - B
```

The wedge inner face is source-locked. Its outside X coordinate becomes `R`. Each end's outside Y coordinate is derived from the unchanged 40° direction:

```text
end longitudinal run = lateral run / tan(40°)
```

The UI does not expose `R`, `D`, the taper, bevels, length, or thickness as independent controls because doing so could create contradictory geometry. It exposes only `S` and `C`, persists both in the URL, reports `R` and `D`, and names each exported STL with all three fit values.

## Geometry and STL acceptance

Evaluate the source-width default, 0.10 mm clearance, a 19.5 mm finished runner, and the maximum 20.5 mm finished runner. For every state:

- the mating taper is 1.000° within 0.001°;
- both end bevels are 40.0° within 0.001°;
- finished width never falls below 18.8 mm;
- narrow-end material is at least 3.2 mm;
- all coordinates are finite and no triangle is degenerate;
- every undirected mesh edge belongs to exactly two triangles;
- winding is consistent and signed volume is positive;
- the part rests on a broad face at Z = 0;
- the 240.084127 mm length fits the 250 mm safe span with about 4.958 mm per end when centered;
- the viewer and exported STL use the same current-parameter geometry.

## Proof views

The final visual check must include:

1. top oblique view showing the long straight outside edge and angled mating edge;
2. end or near-top view making the 5.5 mm thickness and wedge section visible;
3. source-width state with 18.8 mm finished runner width;
4. widened state showing a positive addition without moving the mating face;
5. desktop, mobile, and wide-desktop configurator views with readable controls, audit rows, no overlap, and no horizontal document overflow.

## Physical prototype gate

Measure the cleaned miter slot at the front, middle, and rear and use the smallest width. Print one wedge with 0.15–0.25 mm total clearance as a starting point. Assemble it with the unmodified Main Part and slide the complete runner through the full slot by hand before attaching a jig or sled. It must move freely without side play, binding, rocking, or a proud edge. If the Main Part alone does not enter the slot, this wedge model cannot correct the fit; the fixed part must be resized or carefully fitted instead.

This audit establishes dimensional logic, source fidelity, mesh topology, and printer-envelope fit. It does not certify the source mechanism, saw safety, material strength, wear life, or the finished sled attachment.
