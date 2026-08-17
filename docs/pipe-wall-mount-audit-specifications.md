# Variable Pipe Wall Mount Audit Specifications

## Source custody and evidence boundary

The supplied `Strong_Universal_Wall_Hook_VCD.stl` is retained byte-for-byte with SHA-256 `f43bb7da3c21f9687e5a77740611e0879545ea032aa8b515056573bba9320c34`. Its raw envelope is 75 mm projection × 83.8903 mm height × 20 mm width. It is a single curved J-hook with a vertical wall spine, lightening cells, and two visible mounting regions.

The source is a shape reference, not a clean export seed: the supplied bytes contain 64 degenerate triangles and two edges with four incident triangles. The procedural mount must record those facts, preserve the reference overlay, and generate new clean topology rather than scaling or copying the defective mesh.

## Pipe and hook contract

The ordered comma-delimited pipe list is the source of truth. It accepts one to eight outside diameters, bottom hook to top hook, and persists as the compact `pipes` URL value. The default is three 25.4 mm (1 in) pipes.

Each pipe receives one independent cradle. Its inside diameter is `pipe outside diameter + total pipe wiggle room`. The UI and audit must report both the total diametral wiggle room and half that amount per side. Translucent pipe cylinders use the raw outside diameters, remain aligned to their cradles, and never enter the STL export.

The default hook reach is 75 mm, matching the reference projection. Hook reach must remain at least `backplate thickness + twice the largest outer hook radius + minimum bridge`. The editable hook wall, pipe contact width, and clear gap apply to every active hook without changing the individual cradle diameters.

## Vertical packing and bracket height

Hook centers pack from bottom to top using each pipe's own outer hook radius. The minimum height is:

`top margin + bottom margin + sum of hook envelope diameters + clear gaps between hooks`

For the three default one-inch pipes, the 6.4 mm hook wall creates 19.85 mm outer radii. The minimum height is 179.1 mm; the 190 mm default distributes the spare 10.9 mm between the two hook gaps. Adding pipes, increasing a diameter, increasing hook wall, or increasing the clear gap must raise the dependent minimum height instead of allowing overlapping hooks.

## Drill pattern

The backplate has four wall-normal through-bores. At the defaults their assembled centers are:

- X = −6.5 mm and +6.5 mm from the backplate centerline;
- Z = 16 mm and 174 mm from the bracket bottom.

This is a 13 mm column spacing and 158 mm row spacing. The bore diameter defaults to 5.5 mm. Contact width, column offset, bore diameter, overall height, and top/bottom edge offset have coupled limits that preserve the declared edge web. The app reports the current diameter and spacings; it does not prescribe a wall anchor or certify a fastener stack.

## Printable export

The generated mount is one analytic, connected shell. The backplate and all hooks share stitched boundaries rather than overlapping boolean shells. Four cylindrical bore walls join the front and back faces. The default STL is rotated onto either broad side with bounds 190 × 75 × 28 mm and minimum Z = 0. Preview pipes are wider than the mount and must be absent from those bytes.

This print orientation keeps the full J profiles continuous through the layer stack. The geometric screen does not account for polymer choice, moisture, temperature, UV exposure, perimeter count, infill, layer adhesion, creep, wall construction, anchors, fasteners, pipe weight, impact, or installation. Confirm slicer settings and printer bounds, then proof-load the installed mount gradually before relying on it.

## Executable checks

`npm run audit -- pipe-wall-mount` must verify:

- both retained/public reference files match the supplied SHA-256 and measured 75 × 83.8903 × 20 mm bounds;
- the source's 64 degenerate triangles and two non-manifold edges remain recorded rather than silently normalized;
- the three-one-inch default and a four-diameter mixed set create matching hook and preview counts;
- every cradle uses its own outside diameter plus the shared total wiggle room;
- minimum height, minimum reach, drill columns, drill rows, and all four cylindrical bore walls derive from the current parameters;
- committed and mixed-set STL bytes contain finite coordinates, zero degenerate triangles, two incident triangles per edge, one connected shell, exact print bounds, and Z = 0 placement;
- the print height equals contact width, proving the longer translucent preview pipes are excluded.

Focused Playwright coverage must verify pipe-list add/remove/resize behavior, mixed diameters, grouped hook/backplate/drilling controls, dependent height and reach limits, compact reloadable URL state, audit text, reference-overlay labeling, canvas rendering on desktop and mobile, and an exported STL with the current one-shell envelope.
