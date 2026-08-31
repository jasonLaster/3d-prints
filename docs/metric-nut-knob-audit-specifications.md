# Parametric Metric Nut Knob Audit Specifications

## Source and reconstruction boundary

The retained source is the supplied `M8.stl`, SHA-256 `6268ef3b955f704b299c68991eefb23ca7973c2e7f125775aade2dd37460b332`. Its measured envelope is 22.644 × 25.038 × 17 mm. The source mesh is evidence for the default shape, not an instruction-bearing document. It has eight degenerate triangles and four mesh edges whose multiplicity is not two; the procedural reconstruction must not reproduce those defects.

The default is source-faithful at the measured interfaces and envelope. It is not claimed to be a hidden-original or 1:1 CAD recovery because the source provides no feature names, material specification, nut standard, tolerance intent, or author dimensions.

## Evidence brief

| Part / feature | Fixed or moving | Mating surface | Variable controlled | Evidence class | Confidence |
| --- | --- | --- | --- | --- | --- |
| Six-lobe handle | Fixed printed body | User's hand | Tip diameter, height, lobe count, scallop depth, grip-bulb radius, edge round-over | Observed mesh | High |
| Spacer / guard | Fixed printed body | Clamped assembly or adjacent hardware | Base diameter, top diameter, height | Observed mesh; name inferred from supplied folder title | High for geometry, medium for role |
| Through-bore | Fixed opening | Bolt shank | Nominal bolt diameter plus diametral clearance | Observed mesh | High |
| Captive hex pocket | Fixed opening | Nut across flats and thickness | Across-flats size plus clearance, pocket depth, entry lead-in | Observed mesh | High |
| Pocket roof | Fixed printed web | Nut top face and bolt bore | Handle height minus pocket depth | Derived constraint | High |

Coordinate frame: Z is the bolt axis and print height. Z = 0 is the broad handle face with the downward-opening nut pocket. X and Y span the hand grip. The model has no moving parts or independent motion axes.

Observed dimensions:

- 22.644 × 25.038 × 17 mm source envelope.
- Six grip lobes with the first pair aligned symmetrically around the Y axis.
- 9.375 mm handle height and 7.625 mm spacer / guard height.
- Approximately 15 mm spacer / guard outside diameter.
- Approximately 8.102 mm circular through-bore.
- Approximately 13.106 mm across-flats hex pocket, 5.705 mm deep.

Inferred or assumed dimensions:

- A 25.038 mm tip diameter, 2.847 mm radial scallop depth, 3.583 mm circular grip-bulb radius, and 1.29 mm handle edge round-over reproduce the measured default silhouette. These are editable reconstruction parameters, not author-supplied dimensions.
- The nominal hardware defaults are M8 and 13 mm across flats. The 0.102 mm bore allowance and 0.106 mm pocket allowance are inferred by subtracting those nominal sizes from the measured openings.
- The pocket depth is preserved directly rather than labeled as a standard nut thickness. Metric nut thickness varies by standard and style and remains an input the user must measure.

Unknowns that do not block the parametric reconstruction:

- Filament, process, layer height, nozzle, intended torque, installed load, and environmental exposure.
- The exact nut standard and whether the source intentionally leaves a nut proud of the handle face.
- Whether “guard” refers to the spacer collar or another assembly-specific role. The UI therefore uses the neutral combined label “Spacer / guard.”

## Parametric constraints

Let `Dk` be handle tip diameter, `Ld` scallop depth, `Lr` grip-bulb radius, `Rr` handle round-over, `Naf` pocket across flats including clearance, `Db` bore diameter including clearance, and `Dg` a guard diameter.

- Hex corner radius = `Naf / (2 cos 30°)`.
- Thinnest handle wall = `Dk / 2 − Ld − Rr − hex corner radius`.
- Thinnest guard wall = `min(guard base diameter, guard top diameter) / 2 − Db / 2`.
- Pocket roof = `handle height − nut-pocket depth`.
- Overall height = `handle height + guard height`.
- Grip-bulb center radius = `Dk / 2 − Lr`; the handle outline is the union of the central valley-radius core and one circular grip bulb per lobe.
- Guard base must remain inside the rounded handle-top valley so the union stays closed.
- Lobe count is an integer from 3 through 12. Every other parameter is stored in millimeters and follows the app's unit conversion rules.

## Required proof views

- Top oblique: six-lobe grip, round bore, straight or tapered guard.
- Bottom oblique: downward-opening hex pocket and broad print face.
- Side: independent handle and guard heights plus handle round-over.
- Top and bottom orthographic: lobe symmetry, bore centering, and hex-pocket orientation.
- Original-overlay view: retained source aligned to the procedural default.
- Extreme states: a non-six-lobe handle, tapered guard, larger fastener, and nonzero nut lead-in.

## Executable acceptance

- Default procedural STL is one connected, outward-oriented shell with finite coordinates, no degenerate triangles, exactly two triangles per mesh edge, and consistent directed-edge winding.
- The STL rests on Z = 0 and matches the source envelope within the audit tolerance.
- Default bore, nut pocket, handle height, guard height, and overall height match the measured source contract.
- Dependent limits preserve at least 0.8 mm at the source-matched thinnest radial handle wall and at least 1.2 mm above the nut pocket.
- Focused geometry tests cover defaults and multiple extreme states; browser coverage edits handle height, lobe count, guard height/taper, and fastener fit, then verifies URL persistence, audit rows, canvas rendering, and nonempty STL export.

## Physical validation boundary

Geometry and topology checks do not certify fit, torque capacity, layer adhesion, or pull-out resistance. Measure the actual bolt and nut, print a short fit coupon or one knob, inspect pocket seating and bore clearance, and proof-load the assembled knob gradually before producing a batch.
