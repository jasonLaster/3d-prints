# Oak Dining Table audit specification

The Oak Dining Table model is a parametric construction mock, not an image-derived mesh. Full-size furniture values remain in millimeters in the model contract; `mockScale` controls only the generated preview and STL size.

## Default design

- 76 × 38 × 1 1/2 in solid-oak tabletop
- 30 in finished height
- Four 4 × 4 in corner posts with an independently adjustable outside vertical radius and one shared radius for the other three corners; both default to 1 in
- 1 in tabletop plan radii
- 1/2 in top and bottom edge roundovers, leaving a 1/2 in flat edge band
- An optional post-top groove/rabbet, enabled by default at 1/4 in high × 1/8 in deep
- With the groove enabled, the 1/4 in top roundover sits below the recessed band and forms its rounded lower shoulder; with it disabled, that roundover returns to the post's top edge
- A 1/4 in horizontal edge roundover at the bottom of each post
- Four 6 × 6 × 1/4 in flush corner plates, set 1/2 in back from both tabletop edges so they disappear in side elevation
- Three flush C-channels centered 16, 38, and 60 in from one end
- Default printable mock scale: 1:10

The default 1:10 mock is approximately 193 × 97 × 76 mm.

## Source-of-truth boundary

The procedural geometry controls dimensions, counts, and placement. The independent post corner is mirrored to face outward at all four table corners. The post-top groove is part of the solid geometry and can be switched off without changing the overall table height. Oak grain and blackened steel are render materials only and must never change the model geometry. The plate and channel meshes visualize their flush underside footprints; the primary STL represents the printable wood mock.

## Print caveat

The assembled mock requires supports beneath the tabletop. A future split-part export can place the tabletop and four legs separately if a support-free fit mock is preferred.
