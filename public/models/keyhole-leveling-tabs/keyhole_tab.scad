// Keyhole leveling tabs — parametric prototype, millimeters.
// XY = frame back, +Z = wall. Rounded slot roof apex is at Y=0.
// Supplied specification: PLA Tough and PETG are acceptable.
// Measurements and a physical load test remain required.
variant = 6;                  // [1:8]
all_variants = false;
print_orientation = true;
pad_width = 22.86;
pad_height = 11.43;
pad_thickness = 1.52;
leg_width = 4;
leg_depth = 1.4;
keyhole_slot_width = 4.5;       // assumed
keyhole_depth = 6;             // assumed recess depth
rim_thickness = 2;             // assumed retaining lip
screw_head_diameter = 7.62;
screw_shank_diameter = 3.5;     // assumed
wide_opening_diameter = 8.4;   // assumed
opening_center_drop = 14;      // assumed, measured from roof to entry center
clearance = 0.4;
tape_thickness = 0.2;
root_radius = 0.35;
edge_margin = 0; // Pad edge aligns with the screw-contact face.
$fn = 48;

module rounded_rect(w, h, r) {
  translate([-w/2+r, r])
    hull() for(x=[0,w-2*r], y=[0,h-2*r]) translate([x,y]) circle(r=r);
}
function crown_radius(offset) =
  let(a=leg_width/2, rise=offset-.16)
    max(keyhole_slot_width/2,a+.000001,rise>=a?a:(a*a+rise*rise)/(2*rise));
module leg_slice(w, offset) {
  a=w/2; r=min(.12,offset/5); R=crown_radius(offset); start=acos(a/R);
  polygon(concat(
    [for(i=[0:6]) let(t=-90+i/6*90) [a-r+r*cos(t),-offset+r+r*sin(t)]],
    [for(i=[0:32]) let(t=start+i/32*(180-2*start)) [R*cos(t),-R+R*sin(t)]],
    [for(i=[0:6]) let(t=180+i/6*90) [-a+r+r*cos(t),-offset+r+r*sin(t)]]
  ));
}
module tab(n) {
  leg_contact_offset = -n * 25.4/32;
  offset = -leg_contact_offset;
  pad_bottom = -offset-edge_margin;
  tip_width = leg_width-2*root_radius;
  assert(n>=1 && n<=8 && n==floor(n));
  assert(leg_width+clearance<=keyhole_slot_width+0.000001,"Leg too wide");
  if(abs(crown_radius(offset)-keyhole_slot_width/2)>=.00001) echo("FIT WARNING: crown differs from assumed slot roof; reduce width or verify fit");
  assert(leg_depth<rim_thickness,"Leg intersects screw-head plane");
  assert(pad_height>offset+2*edge_margin,"Pad lacks roof overlap");
  assert(wide_opening_diameter>=screw_head_diameter+clearance,"Entry too narrow");
  assert(pad_bottom>-opening_center_drop+screw_head_diameter/2+clearance/2,"Pad blocks head insertion");
  union() {
    translate([0,pad_bottom,tape_thickness]) linear_extrude(pad_thickness) rounded_rect(pad_width,pad_height,1);
    translate([0,0,-leg_depth]) linear_extrude(leg_depth+tape_thickness+.001) leg_slice(tip_width,offset);
    // The same concave root-width curve as the procedural viewer.
    for(i=[0:7]) hull() for(j=[i,i+1]) {
      angle=j/8*90;
      z=tape_thickness-root_radius+root_radius*sin(angle);
      w=tip_width+2*root_radius*(1-cos(angle));
      translate([0,0,z]) linear_extrude(.001) leg_slice(w,offset);
    }
  }
}
module oriented_tab(n) {
  if(print_orientation) translate([0,-n*25.4/32-edge_margin+pad_height/2,tape_thickness+pad_thickness]) rotate([180,0,0]) tab(n);
  else tab(n);
}
if(all_variants) for(n=[1:8]) translate([((n-1)%4)*(pad_width+5),floor((n-1)/4)*(pad_height+5),0]) oriented_tab(n);
else oriented_tab(variant);
