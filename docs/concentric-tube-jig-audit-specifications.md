# Concentric Tube Jig Audit Specifications

## Geometry contract

- The default jig has nine coaxial tube steps, with outside diameters from 19.05 mm (`3/4 in`) through 31.75 mm (`1 1/4 in`).
- The default adjacent diameter increment is 1.5875 mm (`1/16 in`).
- Every tube step is 6.35 mm (`1/4 in`) tall, creating a 57.15 mm (`2 1/4 in`) stack.
- A 12.7 mm (`1/2 in`) through-bore keeps the steps concentric and allows mounting on a rod or fixture.
- The `1 1/4 in` step is the default build-plate face, which makes every upper step narrower and eliminates support overhangs.

## Runtime limits

- The center bore cannot leave less than 1.2 mm of radial wall in the smallest tube.
- The first diameter cannot become smaller than the bore plus two minimum walls.
- Changing the first diameter or increment recomputes every step.

## Printable STL checks

- Coordinates are finite and triangle areas are non-zero.
- The default mesh includes high-resolution round steps with uninterrupted outer walls.
- The widest tube matches the final default outside diameter, the stack height matches nine tube steps, and the piece rests on Z=0.
- The build-plate footprint is the widest default tube, not the `3/4 in` step.
