# Keyhole leveling tabs

Parametric **prototype** for the supplied digital-frame specification. PLA Tough and PETG are both accepted. The model is visible at [prints.jlast.io](https://prints.jlast.io/?model=keyhole-leveling-tabs&unit=mm).

## Contact geometry

Frame coordinates: XY is the back of the frame; +Y is up; +Z points toward the wall. The assumed closed slot roof is semicircular, with its apex at Y=0 and radius equal to half the narrow-slot width. The leg has a matching circular crown that seats against that roof. Its underside is Y=−offset, where the screw shank bears. Relative to the same stationary wall screw, moving this contact downward by d raises the frame by d. The radius of the screw cancels: original screw center = −r, new center = −d−r, lift = d.

Proposed vertical load path: frame slot roof → insert top → insert underside → screw shank → wall. Tape retains and positions the insert and resists rotation or withdrawal. This path requires actual contact at the roof, not merely a leg somewhere in the opening. A different roof radius or shape, a flexible keyhole surround, insufficient bearing area, head interference or a loose insert can invalidate it. Frame weight and frame material are unknown; there is no load rating or measured creep result.

The viewer's Installed section uses the same tab and parameter values as its standalone view; only the frame and screw are section/assembly stand-ins. The side diagram uses those contact datums. Frame and screw never enter the STL export.

## Dimensions and custody

Known: pad 15.24 × 7.62 × 1.52 mm initial size; screw head 7.62 mm; exact increment 25.4/32 = 0.79375 mm; frame 20 × 11.75 inches; screws 5.75 inches apart. The requested approximate correction 3/16 inch selects variant 6 initially.

**Assumed and editable:** slot 4.5 mm; wide opening 8.4 mm; entry center 14 mm below roof; 2 mm rim; 6 mm recess; 3.5 mm screw shank; 2 mm head thickness; 3 mm wall gap; 0.2 mm tape. Leg root 3 mm wide, tip 2.3 mm wide, 1.4 mm inward projection, 0.35 mm root fillet; total fit clearance 0.4 mm. The circular crown uses the assumed 2.25 mm roof radius. Its apex stays at Y=0 and its flat underside at Y=−offset; rounding does not alter the eight hanging offsets. The smallest default tab retains approximately 0.221 mm at the root edge. Oversized widths are limited in the app so the crown fits without flattening.

The 14 mm entry drop keeps even variant 8's shank in the narrow portion of this assumed slot. Measure yours before fabrication.

The pad's lower edge is aligned with the leg's flat screw-contact face in frame coordinates. The pad extends at least 1.27 mm above the roof for default variant 8. Its back is flat except for the inward leg; apply tape on the surrounding wings, not across the leg. Tape thickness is included in the wall-space calculation and root depth. Identification bumps have been removed at the user’s request. The exposed outer pad face is completely flat. No adhesive area or load capacity has been validated.

The supplied text is preserved in `models/keyhole-leveling-tabs/reference/design-specification.txt`. Later user corrections accept PLA Tough alongside PETG, use a 3 mm root and rounded inward crown, remove identification bumps, and place the flat outer pad face on the bed. These assumed dimensions are design inputs, not measurements from that source.

| Variant | Inches | Exact offset mm |
|---|---|---|
| 1 | 1/32 | 0.79375 |
| 2 | 1/16 | 1.58750 |
| 3 | 3/32 | 2.38125 |
| 4 | 1/8 | 3.17500 |
| 5 | 5/32 | 3.96875 |
| 6 | 3/16 | 4.76250 |
| 7 | 7/32 | 5.55625 |
| 8 | 1/4 | 6.35000 |

Each tab is one fixed piece. Choosing a different variant changes its screw contact height; there is no sliding mechanism. These offsets refer to the altered mounting contact. The visible edge of a frame with two mounts can move by a different amount as the frame rotates.

## Printing and fit test

Bambu Lab P2S, standard 0.4 mm nozzle; start at 0.12 mm layer height, 4 walls, 100% infill. Use the filament maker's profile for PLA Tough or PETG. No heat resistance or long-term load claim is made.

The plate places the full smooth outer pad face on print Z=0, with the inward leg pointing upward. Each default tab has approximately 115.2 mm² of bed contact. Identify offsets by their STL filenames and the 4 × 2 plate order (variants 1–4, then 5–8). Inspect root layers and extrusion in the slicer. All eight fit within a conservative 250 × 250 mm envelope. The 3MF contains eight separate mesh objects in millimeters; it is geometry-only, with no printer, filament, support or slicing profile baked in.

1. Measure slot width, roof shape, rim/recess depth, entry diameter/drop, screw shank/head thickness, wall projection, available adhesive area, frame weight and surrounding material.
2. Set these dimensions in the app. Check every fit assertion; do not use a tab with a fit warning.
3. Print variants 1, 6 and 8 first. Remove any supports or brim without gouging bearing surfaces. Measure actual contact heights; 0.12 mm layers cannot reproduce every 0.79375 mm target exactly.
4. With the frame supported, verify head entry, upward seating, clearance behind the rim and positive roof contact. Confirm the screw is in the narrow neck. Try removal and reinstalling.
5. Verify the tab does not rotate, withdraw, peel away or slip. Test the loaded frame with a catch/support and monitor deformation. Confirm the actual frame lift; do not infer it solely from CAD.

Physical fit and load testing remain pending. The downloadable eight-part set allows inspection and prototype selection; it is not a completed production validation.

## Source and assertions

The authoritative procedural model is `src/models/keyholeLevelingTabs.ts`. It generates the interactive geometry, STL exports, and the default plate from one function. A downloadable copy is included here. `keyhole_tab.scad` is a parametric OpenSCAD companion with the same dimensions and root curve; OpenSCAD rendering has not been verified in this environment. The distributed STL/3MF meshes come from the shared procedural model. App parameters use camelCase and the OpenSCAD companion uses the supplied snake_case parameter names.

`node models/keyhole-leveling-tabs/generate-source.mjs` regenerates the eight STLs, geometry-only 3MF and downloadable TypeScript source. `npm run audit -- keyhole-leveling-tabs` checks exact offsets, actual mesh bearing datums, absence of bumps, full pad bed contact, leg-up orientation, legacy-URL compatibility, one connected watertight shell, winding, volume, exported vertex parity, parameter extremes, fit calculations, invalid-fit warnings and 3MF layout integrity. Browser tests cover catalog routing, parameter/URL persistence, all three previews, exports, keyboard controls and mobile layout. Assertions do not establish physical strength.

Workspace Export always exports the **selected variant with current dimensions**, even while viewing all eight or the installed section. The linked 3MF uses default assumed dimensions; regenerate it after changing source defaults. STL names identify the variant; downloaded STL coordinates are millimeters.

Bambu Studio 02.06.00.51 imported the default 3MF and reported eight manifold, single-part meshes via `--info`; a 3MF re-export also succeeded. This validates import, not slicing settings or physical fit.

The refreshed selected, variants and installed renders are generated programmatically with Bambu Studio CLI, using the current procedural meshes. The section render is regenerated from the same assembly geometry.
