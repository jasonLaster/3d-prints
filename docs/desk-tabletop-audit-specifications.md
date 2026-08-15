# White Oak Desk Top audit specification

The desk-top model separates the full-size fabrication dimensions from its display/export scale. The default is 72 × 30 in, with a 1 in stable core, a 1/8 in white-oak surface, and a 1 1/2 in solid-white-oak perimeter band. The surface selector switches between a continuous plywood-veneer field and deterministic, staggered unfinished-flooring strips.

## Layer and layout contract

- The surface thickness is independent of the core so 1/8 in veneer plywood and thicker flooring stock can both be represented.
- Flooring defaults to nominal 3 in faces. Minimum and maximum strip lengths remain independently editable, and the generated courses use repeatable staggered lengths inside that interval.
- The visible seam reveal makes the strip layout legible in the manipulation model. It is not a prescribed expansion gap or substitute for the selected flooring manufacturer's installation details.
- The inset core and surface field stop at the inside of the perimeter band. The band remains the only stock routed at the finished outside edge.

## Edge-profile contract

The solid band is adjustable from 1 to 2 in. The plan-view corner radius, top roundover, bottom roundover, underside bevel inset, and underside bevel height are independent controls. Live limits keep the plan radius within the band and retain at least 1/4 in of uncut solid-oak width after the bevel and bottom roundover.

The underside profile begins at the smaller bottom footprint, softens that footprint with the bottom roundover, then opens through the selected bevel height to the full outer envelope. The top roundover is applied independently at the upper edge. A zero value removes the corresponding treatment.

## Fabrication boundary

This model is a geometry and layout aid. Before milling, confirm the actual core material, veneer/flooring thickness, tongue-and-groove removal, adhesive compatibility, moisture content, seasonal movement strategy, band-to-core joint, desk-base attachment, and finishing schedule. The audit does not certify the desk base, attachment method, concentrated loads, or long-term panel behavior.
