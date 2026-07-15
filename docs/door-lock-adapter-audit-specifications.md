# Door Lock Adapter Audit Specifications

## Geometry contract

- The tube defaults to 9.3 mm in diameter and 23 mm in axial length.
- The centered collar defaults to a 10.3 mm square cross-section and 10.9 mm axial length. Both planar collar axes use the supplied box width because no separate box depth was provided.
- The triangular key ridge is centered on one collar face, defaults to 4 mm wide, extends 1.5 mm from that face, and follows 10.9 mm of the tube axis.
- The inner rectangular cutout defaults to 3 mm by 7.3 mm, stays centered on the tube, and passes through both ends.
- The cutout angle is adjustable from 0 to 180 degrees. Its 90-degree default places the long axis perpendicular to the collar face carrying the triangular ridge; 0 degrees places it parallel.

## Runtime limits

- The collar width cannot be smaller than the tube diameter.
- The collar length cannot exceed the tube length.
- The triangular ridge length cannot exceed the collar length.
- The triangular ridge width cannot exceed the collar width.
- The rectangular cutout preserves at least 0.6 mm between each corner and the tube exterior at any rotation.

## Printable STL checks

- Coordinates are finite and triangle areas are non-zero.
- Every mesh edge belongs to exactly two triangles.
- The default envelope is 10.3 mm wide, 11.8 mm deep including the ridge, and 23 mm tall.
- The model rests on Z=0 and the rectangular slot remains open through the complete tube.
