# Metric Nut Knob — Three Lobes

Separate model ID: `metric-nut-knob-three-lobe`. Uses the shared metric nut knob geometry without changing the original or large-grip models.

The grip retains a 40 mm tip circle and 9.375 mm handle height. Three 6.5 mm-radius bulbs replace the six smaller bulbs; scallop depth increases from 4.5 to 7.5 mm for more pronounced finger valleys. Edge round-over remains 2 mm. With three lobes the asymmetric planar bounding box is about 36.38 × 33.25 mm; all three tips remain 20 mm from the bolt axis.

The hex recess is 0.2 mm narrower: 12.906 mm across flats instead of 13.106 mm. This uses a 12.8 mm nut-width setting plus the retained 0.106 mm clearance as a print-fit adjustment, not a claim that the physical nut size changed. Pocket depth stays 5.705 mm with no entry lead-in. Actual hardware fit requires a new test print.

The bolt bore stays 8.102 mm. The spacer stays 15 mm diameter × 7.625 mm high, and overall height stays 17 mm. Browser/export tests compare actual bore and spacer triangles against the previous STL, measure the narrower hex walls and unchanged depth, and count three radial peaks with 7.5 mm valleys. The topology audit requires one closed outward-oriented shell, zero degenerate triangles, and a flat Z = 0 print face.

Regenerate and validate:

```sh
node models/metric-nut-knob/generate-source.mjs public/models/metric-nut-knob-three-lobe/model.json
npm run audit -- metric-nut-knob-three-lobe
npx playwright test tests/e2e/metric-nut-knob-three-lobe.spec.ts --workers=1
```

Print flat handle face down. The retained M8 reference SHA and dimensions describe the original source; this model's STL is generated separately.
