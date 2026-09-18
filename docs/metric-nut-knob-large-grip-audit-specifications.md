# Metric Nut Knob — Large Grip

Separate catalog model: `metric-nut-knob-large-grip`. Reuses the original metric nut knob's parametric geometry and constraints.

The hand grip grows from 25.038 mm to 40 mm tip diameter (about 60% wider). Six rounded lobes use a 4.5 mm scallop depth, 5.7 mm bulb radius, and 2 mm edge round-over. Handle height stays 9.375 mm; total height stays 17 mm.

All fastener and spacer defaults remain identical to `metric-nut-knob`: 8.102 mm bolt bore, 13.106 mm across-flats hex pocket, 5.705 mm pocket depth, no entry lead-in, and a straight 15 mm diameter × 7.625 mm spacer. The original model and retained M8 source STL remain unchanged. Source dimensions and SHA-256 in the new configuration describe that retained reference, not the enlarged output.

Regenerate the standalone STL with:

```sh
node models/metric-nut-knob/generate-source.mjs public/models/metric-nut-knob-large-grip/model.json
npm run audit -- metric-nut-knob-large-grip
```

The shared audit verifies original fit defaults, the enlarged envelope, consistent outward winding, one connected closed shell, no degenerate triangles, and a flat Z = 0 print face. Focused browser tests compare actual bore, nut-pocket, and pocket-roof triangles with the original STL, including after changing only grip diameter and exporting from the UI.

Print with the flat handle face down. Fit tolerances match the original; physical printer and nut fit still require a test print.
