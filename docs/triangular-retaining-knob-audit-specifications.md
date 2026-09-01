# Triangular Retaining Nut Knob audit specification

## Product intent

This model keeps the captive-nut and adjustable spacer / guard architecture of the Metric Nut Knob, but replaces the separate circular grip lobes with one continuous soft triangle. Each of the three corners is rounded, each side has an adjustable outward bow for the palm, and the upper and lower handle edges receive the same adjustable round-over.

The default handle has a 38 mm tip span, 5.5 mm corner radius, 2.4 mm palm-side bow, 10.5 mm height, and 1.6 mm edge round-over. Triangle span, corner radius, palm-side bow, handle height, and edge round-over remain independent parameters.

## Fastener and retention path

The default M8 assembly has an 8.35 mm clearance bore and a 13.25 mm across-flats captive-nut pocket. The pocket opens downward on the broad print face, while the spacer / guard and bolt path continue upward.

Near the outer end of the guard, an optional internal collar narrows to 7.8 mm by default: nominal bolt diameter minus 0.2 mm of diametral retention interference. A 1.2 mm contact band is approached and released through 0.8 mm ramps. This avoids a sharp internal shoulder and makes the part easier to press over a threaded bolt.

Setting retention interference to 0 disables the detent and restores a clearance bore. The collar is a tunable friction detent, not a positive mechanical lock. Actual grip depends on thread form, extrusion width, hole shrinkage, layer orientation, temperature, filament stiffness, and wear. Print one knob or a short fit coupon against the actual bolt before batching; PETG or another modestly compliant material is generally more forgiving than brittle filament.

## Runtime checks

The app reports the current clearance-bore diameter, nut-pocket size, retention-collar diameter, soft-triangle envelope, guard taper, pocket roof, and minimum radial walls. Dependent parameter limits keep:

- pocket depth below the handle roof;
- the guard around the clearance bore;
- the rounded-triangle body around both the guard and hex pocket;
- the retention band and its two ramps inside the guard;
- retention interference below a bounded fraction of nominal bolt diameter.

## STL checks

The generated default STL must be finite, outward-oriented, one connected component, and manifold with exactly two triangles per mesh edge. It must contain no degenerate triangles, preserve the configured tip radius and total height, and rest on Z = 0 with the captive-nut opening on the build plate.

These checks establish geometric consistency and slicer-readiness. They do not certify torque capacity, nut pull-out strength, long-term retention, or suitability for safety-critical use.
