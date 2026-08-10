# Drill Bit Holder Audit Specifications

## Geometry contract

- The holder has seven independently adjustable blind vertical holes in one left-to-right row. Defaults are 1/8, 5/32, 3/16, 1/4, 5/16, 3/8, and 1/2 inch.
- Each default hole diameter is the nominal bit diameter plus 0.5 mm of total diametral wiggle room, leaving 0.25 mm per side. This shared fit parameter can be tuned for printer and material behavior.
- The derived outer box is only as large as the seven openings, adjustable horizontal gap, and adjustable bit-to-edge margin require. The defaults remain a 3 mm gap and 3.2 mm margin, producing an envelope of approximately 76.3 × 19.6 × 24 mm.
- The largest bit is derived from the comma-delimited list and controls the minimum box width; it is not a separate conflicting input.
- The default holes are 20 mm deep, leaving a 4 mm solid floor.
- The four plan corners use a 3.2 mm radius. A 0.8 mm bevel softens the top and bottom outer edges and forms a lead-in at every hole.

## Parametric limits

- Wiggle room changes all holes together without changing the individually selected nominal bit diameters; the configured value is total added diameter, with half on each side.
- One comma-delimited text field owns the complete left-to-right bit list. Adding an entry adds a hole; deleting an entry removes it.
- The field accepts typed metric values or imperial fractions in the selected workspace unit, with 1 to 24 entries from 1/32 through 1 inch.
- Applying the list recomputes the compact box envelope without reordering the remaining positions.
- Horizontal bit gap changes the derived holder length; the beveled top web must retain at least 1.2 mm of printable material.
- Bit-to-edge margin changes both the derived holder length and width while preserving a printable perimeter wall.
- Hole depth is capped so at least 2.4 mm of floor remains.
- Holder height cannot be reduced below the selected hole depth plus the minimum floor.
- Bevel size is capped by the horizontal bit gap, bit-to-edge margin, and corner radius.

## Print orientation

- Print the holder upright with its flat base on the build plate and the holes facing up.
- This orientation keeps each perimeter and hole wall continuous within a layer, preserves round openings, and avoids supports inside the blind holes. Actual strength still depends on material, layer adhesion, walls, and slicer settings.

## Printable STL checks

- The STL contains finite, nondegenerate triangles and exactly two triangles per mesh edge.
- The complete holder is one connected, positive-volume shell resting flat on Z=0.
- The generated bounds match the derived compact envelope within 0.1 mm.
- Seven distinct blind-hole floors appear at the configured depth, and no hole passes through the build-plate face.
