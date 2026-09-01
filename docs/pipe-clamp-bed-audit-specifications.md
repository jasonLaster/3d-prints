# Pipe Clamp Bed audit specifications

## Intent and evidence boundary

The Pipe Clamp Bed is a new work-support geometry inspired by the supplied `pipe-supporter.stl`; it is not a uniform rescale or a 1:1 reconstruction. The source shows an upward-opening C cradle above a broad floor foot. The requested design inverts that relationship: a 177.8 × 38.1 mm (7 × 1.5 in) level bed runs parallel to one pipe and uses two downward-opening, 25.4 mm-wide snap clips at its ends.

The retained STL is unitless. Its raw envelope is `0.0775516 × 0.046 × 0.04`; interpreting the originating coordinates at ×1000 gives 77.5516 × 46 × 40 mm and makes the cradle proportionally consistent with standard pipe. This scale is an inference, not a source-proven unit declaration. The source is retained byte-for-byte and has SHA-256 `d02809790789484b7b3568a6bad2bcfc86d5a445a2de6f6126f23823520af05f`.

The pipe datum is stronger evidence than the unitless source scale. Pony's official fixture manual gives 26.67 mm (1.050 in) as the maximum outside diameter for standard 3/4-inch black pipe. Pony lists the classic #50 clamp face as 1 3/4 inches, but does not publish the face center's vertical offset from the pipe axis. The model therefore reports the workpiece center height without claiming universal jaw-center alignment. Sources: [Pony pipe-clamp fixture manual](https://www.ponyjorgensen.com/wp-content/uploads/2018/09/Pony-Pipe-Clamp-Fixture_user-manual.pdf) and [Pony Classic #50 product specification](https://www.ponyjorgensen.com/product/classic-pony-pipe-clamp-fixture-for-three-fourth-inch-black-pipe/).

## Mechanism brief

| Part | Location | Fixed or moving | Mating surface | Variable controlled | Evidence | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| Level bed | Above and parallel to pipe | Fixed after clipping | Workpiece bottom face | Bed length, width, edge thickness | User specified | High |
| Crown relief | Continuous underside of bed | Fixed | Upper pipe arc | Pipe OD, diametral clearance, crown cap | Required to avoid intersecting the pipe | High |
| Left snap clip | First 25.4 mm end band | Flexes outward during fit | Pipe side and shallow underside | Clip width, wall, retention | User specified; source supplies C-cradle concept | High |
| Right snap clip | Opposite 25.4 mm end band | Flexes outward during fit | Pipe side and shallow underside | Clip width, wall, retention | User specified; source supplies C-cradle concept | High |
| Preview pipe | Along bed center axis | Preview only | Fit datum | OD | User confirmed standard pipe | High |
| Reference workpiece | On support face | Preview/calculation only | Flat top datum | Thickness | User specified 1-inch optimization | High |

The pipe axis is the primary datum: X runs along the pipe and bed, Y crosses the 38.1 mm bed width, and Z is vertical with the pipe center at `Z = 0`. The bed has no operational degree of freedom after installation. Each clip flexes outward transiently during snap-on and removal; that deformation is not treated as an adjustable assembly joint.

## Default equations

For pipe diameter `D`, total diametral clearance `C`, crown-cap thickness `Tcap`, workpiece thickness `Tw`, and fitted-radius undercut `U`:

```text
fitted pipe radius         Rfit = (D + C) / 2
support surface height     Ztop = Rfit + Tcap
surface lift above crown   L    = Ztop - D / 2 = C / 2 + Tcap
workpiece center height    Zw   = Ztop + Tw / 2
clip opening width         Wop  = 2 × (Rfit - U)
required expansion / side  E    = max(0, (D - Wop) / 2)
engagement angle           A    = acos((Rfit - U) / Rfit)
center bridge length       B    = bed length - 2 × clip width
```

At the defaults:

- `D = 26.67 mm`, `C = 0.8 mm`, so `Rfit = 13.735 mm`.
- `Tcap = 1.2 mm`, so the support is 1.6 mm above the nominal pipe crown and `Ztop = 14.935 mm`.
- With `Tw = 25.4 mm`, the board center is 27.635 mm above the pipe axis (1.088 inches).
- `U = 1.2 mm` gives a 25.07 mm opening, about a 24.1° undercut angle, and only 0.8 mm per side of required outward movement over the nominal pipe.
- Two 25.4 mm clips leave a 127 mm open center under the 177.8 mm bed.

This height is intentionally close to resting the board directly on the pipe crown. It adds only a thin, pipe-supported cap rather than a tall spacer. Changing reference workpiece thickness updates the reported workpiece-center datum; changing pipe fit or crown-cap thickness changes the physical support height.

## Observed, inferred, assumed, and unknown

| Class | Item |
| --- | --- |
| Observed | The supplied mesh has one upward C cradle, a flared support body, and a wide floor foot. |
| Observed | The supplied mesh contains 37 degenerate triangles and 58 mesh edges whose multiplicity is not two at the documented scale/precision. |
| Observed | The user requires a 7-inch continuous bed, 1.5-inch width, pipe-parallel layout, two 1-inch end clips, standard 3/4-inch pipe, Tough PLA, and easy removal. |
| Corroborated inference | The source coordinates use a ×1000-to-mm interpretation; the known standard pipe is the calibration reference. |
| Assumed default | 0.8 mm total diametral clearance accommodates ordinary black-pipe surface variation without creating an intentionally tight clamp. |
| Assumed default | A 3.0 mm clip wall and 1.2 mm undercut are a printable easy-release starting point for Tough PLA, not a fatigue-qualified spring design. |
| Unknown | Exact printed fit after extrusion-width, shrinkage, seam, layer-height, and pipe-coating effects. |
| Unknown | Exact vertical center of the user's clamp faces relative to the pipe axis. Measure it if the 1.6 mm crown lift does not center the board as desired. |

## Geometry and parameter checks

- Keep pipe diameter, total clearance, crown-cap thickness, bed thickness, clip wall, clip width, and retention undercut independent.
- Maintain at least 1.2 mm of crown cap over the fitted pipe relief and at least 2.4 mm clip-wall thickness.
- Keep the fitted outer clip diameter inside the bed width with shoulder material on both sides.
- Keep at least 25.4 mm of open center bridge between the two end clips.
- Evaluate nominal, loose-clearance, larger-pipe, and stronger-retention states as one connected, outward-oriented shell.
- The blue pipe is preview-only and must never enter either STL.
- Export the full bed and fit coupon with the support face on the build plate at `Z = 0` and the clips opening upward.

## STL acceptance

For both `pipe-clamp-bed.stl` and `pipe-clamp-bed-fit-coupon.stl`:

- all coordinates are finite;
- there are zero degenerate triangles;
- every undirected mesh edge belongs to exactly two triangles per mesh edge;
- directed edge winding is consistent and signed volume is positive;
- the mesh is one connected shell;
- minimum Z is within 0.05 mm of zero;
- the full default bed is 177.8 × 38.1 mm in the build plane and fits a 250 mm usable span;
- the fit coupon is 25.4 × 38.1 mm in the build plane and preserves the exact default clip cross-section.

## Proof views

The final visual check must include:

1. top oblique view showing a continuous flat bed and two separated end bands;
2. underside oblique view showing the open middle and both pipe-following clips;
3. end view showing the downward-opening C section around the translucent pipe;
4. long side view showing that each clip is 25.4 mm wide and confined to an end;
5. print-orientation view with the support face on the build plate and clips upward;
6. desktop and mobile configurator views with no overflow or console errors.

The verified implementation captures are preserved as [desktop](../artifacts/pipe-clamp-bed/visual-audit/desktop.png), [mobile](../artifacts/pipe-clamp-bed/visual-audit/mobile.png), and [underside](../artifacts/pipe-clamp-bed/visual-audit/underside.png) views. The desktop and mobile captures have no horizontal overflow or browser console errors; the underside capture exposes the open center bridge and both clip bands.

## Physical prototype gate

Print the fit coupon before the full 7-inch body. Use the intended Tough PLA, layer height, wall count, seam policy, and temperature. Snap it straight over the actual pipe several times, then inspect both clip roots and lips for whitening, cracks, permanent spread, or excessive looseness. Increase clearance or reduce retention if removal is harsh; reduce clearance or increase retention only in small steps if the bed rocks. Print the full bed with the support face on the build plate, at least four perimeters, and no seam at either clip root. This geometric review is not a material fatigue certification or a clamp-force rating.
