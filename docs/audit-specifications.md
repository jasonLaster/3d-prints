# Paper Towel Holder Parametric Audit Specifications

The source STL is treated as the adjustable holder body with an integrated center tube. The former separate cap is no longer part of the design intent; the center tube is now a bottom-closed weighted sand chamber with a flush base floor and rounded top. Runtime audit metadata lives in `public/models/paper-towel-holder/model.json`, and the model-specific script lives at `models/paper-towel-holder/audit.mjs`.

## Dimension Targets

- Default holder height: `215.738 mm`, measured from the main holder component.
- Default holder outer diameter: `123.800 mm`, measured across the main holder component.
- Default center tube outer diameter: `36.000 mm`, measured from the original center post.
- Default center tube sand chamber diameter: `25.000 mm`.
- Default center tube sand floor: bottom face flush with the base plane, with an `8.000 mm` floor height below the sand fill.
- Center tube diameter is adjustable independently from holder height and holder outer diameter.
- Sand chamber diameter follows the selected tube diameter while preserving the original `5.500 mm` wall thickness.
- Rounded top reaches `5.738 mm` below the selected holder height, matching the original center-post clearance.
- Model units remain millimeters.

## Required Invariants

- Do not apply uniform XYZ scaling to the whole STL.
- Do not scale the center tube diameter when paper-towel holder diameter changes.
- Do not scale the holder diameter when center tube diameter changes.
- Keep the holder's central/core zone unchanged radially except for the selected center-tube diameter.
- Keep the holder's bottom locking band unchanged vertically.
- Keep the holder's top lip/socket band unchanged in local shape; it may translate vertically when holder height changes.
- Change holder diameter by moving the outer holder annulus radially, not by changing Z height or center-tube dimensions.
- Change holder height by remapping the middle holder span between fixed bottom and top bands.
- Change center tube diameter by remapping the center post radius only, while keeping holder height and outer diameter stable.
- Keep the center-tube bottom closed with a flush sand floor at the same base plane as the holder body.
- The rounded center-tube top must follow height changes so the weighted post remains proportionate to the holder.
- The rounded center-tube top radius must follow the selected tube diameter.

## Audit Checks

- Main holder bounding height should equal the selected height within STL/export precision.
- Main holder outer diameter should equal the selected diameter within STL/export precision.
- Center tube outer diameter should equal the selected tube diameter.
- Sand chamber diameter should equal the selected tube diameter minus the preserved tube wall thickness on both sides.
- Sand chamber floor should close the center tube at the base plane so filled sand cannot drain through the bottom.
- Estimated sand volume and mass should be recalculated when holder height or tube diameter changes.
- Tube-to-holder radial clearance should stay above the minimum app constraint after tube or holder diameter changes.
- Bottom `8 mm` and top `18 mm` holder bands should preserve their local geometry.
- Exported STL should contain the adjusted holder body, flush center-tube floor, and rounded center-tube closure, with no separate cap part.
- Slicer review should confirm the center tube can be filled with sand before the rounded top closes, such as by adding a print pause below the dome.
- Slicer review should be performed after large diameter changes to check clearances, self-intersections, and minimum wall/rib thickness.
