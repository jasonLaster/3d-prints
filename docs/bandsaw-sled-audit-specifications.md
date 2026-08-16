# Adjustable Fence Bandsaw Sled Audit Specifications

## Fabrication contract

The sled separates fabrication methods intentionally:

- Cut the base and sacrificial vertical fence from sheet wood; the default is 18 mm plywood.
- Make the underside runner from straight hardwood and fit it to the actual bandsaw table slot.
- Print two gusseted adjustable fence brackets and two captive-bolt lock knobs.
- Do not print the wood parts or treat their preview geometry as STL output.

The default cut list is a 420 × 320 × 18 mm base, a 380 × 100 × 18 mm fence, and an 18 × 280 × 8 mm runner. Confirm all saw-table and miter-slot measurements before cutting wood.

## Adjustment and squareness

Each printed bracket has a 52 × 7 mm M6 slot. The bracket feet slide fore/aft over two fixed M6 screw-in inserts in the wood base. With the default 90 mm foot, the insert station centers the 55 mm fence setback and provides 45 mm of usable continuous travel. Changing bracket length moves the modeled insert station by half the length change, so the same nominal fence setback and slot travel are preserved.

Bracket length is adjustable from 80 mm through 203.2 mm (8 in). The triangular gusset length is derived automatically at 87.5% of the bracket length, so an 8 in foot always has a 7 in gusset. The 80 mm minimum keeps that long gusset and the 10 mm back plate inside the foot. The wood-base depth grows with the bracket so the full foot retains at least 5 mm of support at the nominal fence position; the 8 in bracket therefore requires a base depth of at least 545 mm at the other defaults.

Two brackets at 280 mm centers prevent the fence from rotating around one lock. Square the fence to the blade path with a machinist square, tighten both M6 knobs, and verify that neither foot can shift before cutting.

## Fastener and threaded-insert stack

- Fence to printed brackets: four M5 × 25 mm bolts and 14 mm washers pass through the wood fence into four M5 heat-set inserts. The default stack leaves 5.5 mm of thread engagement in a 6 mm insert.
- Brackets to wood base: two M6 × 25 mm bolts and 18 mm washers pass through the printed slots into 10 × 13 mm screw-in wood inserts. The default stack leaves 13 mm of engagement.
- Printed bracket pockets are 7.2 mm in diameter and 6 mm deep, with a 5.5 mm clearance bore behind each insert.
- The 18 mm base leaves 5 mm of wood beneath each 13 mm insert hole.

Measure the purchased inserts and print a pocket coupon before printing the brackets. Drill the wood-insert holes to the insert manufacturer's pilot recommendation; the 10 mm default is a model parameter, not a universal drill size.

## Printed bracket and knob geometry

Each default bracket combines a 58 × 90 × 10 mm slotted foot, a 10 mm rear plate as tall as the fence, and two triangular 5 mm gussets with a 78.75 mm horizontal run. The gusset run is always 87.5% of the bracket length: changing the one bracket-length control regenerates the foot and gussets together. At the 8 in maximum the gusset is exactly 177.8 mm (7 in). The complete adjustable range keeps the proportional gusset and 10 mm back plate inside the foot.

The bracket prints foot-down with the back upright. The 7.2 mm horizontal insert-pocket bridge remains below the configured 8 mm support-free screen.

Each 36 × 12 mm six-lobe knob has a 6.6 mm shaft clearance and a hexagonal pocket for a 10 mm-across-flats M6 bolt head. Seat the bolt head fully and retain it with an appropriate mechanical or adhesive method before use.

## Accuracy and conservative structural screens

The runtime audit checks:

- both lock bolts remain inside their slot travel;
- bracket spacing and fence edge margins preserve anti-yaw support;
- at least 12 mm of plastic remains beyond every lock-slot end;
- bracket length remains between 80 mm and 8 in, the gusset remains at 87.5% and inside the foot, and the selected wood base supports the full nominal foot;
- M5 insert shoulders, M6 wood-insert floors, and both bolt engagements remain valid;
- a 100 N lateral comparison load stays below 0.3 mm calculated bracket deflection and above a 4× stress safety-factor screen.

These calculations are geometry checks, not certification. Print orientation, layer adhesion, polymer, heat, creep, impact, wood quality, insert installation, and bandsaw forces can dominate real behavior. Proof the sled on scrap at low feed, keep hands out of the blade path, and follow the saw manufacturer's guard and sled guidance.

## Blade path and commissioning

The preview keeps the kerf centered through the base and sacrificial fence. Do not pre-cut the full kerf from dimensions alone. Fit the runner, verify smooth travel without side play, square and lock the fence, then raise the running blade through the sled in a controlled first cut. Replace the sacrificial fence when its kerf no longer supports the work safely.

## Export contract

Four individual, current-parameter STL files are generated: left bracket, right bracket, left lock knob, and right lock knob. Export names include both the selected bracket length and its derived gusset length so an 8 in / 7 in set cannot be confused with the defaults. Every file must contain finite nondegenerate triangles, be watertight/manifold under the repository topology check, and rest on Z=0 in its recommended print orientation.
