import * as THREE from "three";
import { formatLength } from "../units";
import { getParam } from "./shared";
import type { AuditCheckDefinition, AuditItem, LengthUnit, ModelParams, RightAngleDrillGuideModelDefinition } from "./types";

type Ring = THREE.Vector2[];
const ENTRY_CHAMFER = 0.6;
const ENGRAVING_DEPTH = 0.6;

export function getRightAngleDrillGuideSpec(params: ModelParams, model: RightAngleDrillGuideModelDefinition) {
  const pitch = getParam(params, "borePitch");
  const clearance = getParam(params, "boreClearance");
  const centers = model.geometry.bitDiameters.map((_, i, bits) => (i - (bits.length - 1) / 2) * pitch);
  const diameters = model.geometry.bitDiameters.map(d => d + clearance);
  return {
    centers, diameters, pitch, clearance,
    length: (centers.length - 1) * pitch + 40,
    width: getParam(params, "bodyWidth"),
    height: getParam(params, "guideHeight"),
    straightLength: getParam(params, "guideHeight") - ENTRY_CHAMFER,
    minimumWeb: Math.min(...diameters.slice(1).map((d, i) => pitch - (d + diameters[i]) / 2 - 2 * ENTRY_CHAMFER)),
  };
}

export const getRightAngleDrillGuideDimensions = getRightAngleDrillGuideSpec;

function circle(x: number, diameter: number, segments: number): Ring {
  return Array.from({ length: segments }, (_, i) => {
    const a = i * Math.PI * 2 / segments;
    return new THREE.Vector2(x + Math.cos(a) * diameter / 2, Math.sin(a) * diameter / 2);
  });
}
function rectangle(x: number, y: number, w: number, h: number): Ring {
  return [[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]].map(([a,b]) => new THREE.Vector2(a,b));
}

// Disjoint seven-segment pockets make legible labels part of the solid itself.
function labelPockets(text: string, cx: number, cy: number): Ring[] {
  const segments: Record<string, string> = { "0":"abcdef", "2":"abged", "5":"afgcd", "7":"abc", "8":"abcdefg", "9":"abcdfg" };
  const advance = 3.0;
  const widths = [...text].map(c => c === "." ? 1.1 : advance);
  let cursor = cx - widths.reduce((a,b) => a+b,0)/2;
  const result: Ring[] = [];
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    const x = cursor + widths[i]/2;
    if (c === ".") result.push(rectangle(x, cy-2.05, 0.6, 0.6));
    else {
      const bars: Record<string, [number,number,number,number]> = {
        a:[0,2.1,1.5,.6], g:[0,0,1.5,.6], d:[0,-2.1,1.5,.6],
        b:[1.05,1.05,.6,1.3], c:[1.05,-1.05,.6,1.3],
        e:[-1.05,-1.05,.6,1.3], f:[-1.05,1.05,.6,1.3],
      };
      for (const bar of segments[c]) {
        const [dx,dy,w,h] = bars[bar];
        result.push(rectangle(x+dx,cy+dy,w,h));
      }
    }
    cursor += widths[i];
  }
  return result;
}

// Walk the perimeter counter-clockwise, inserting paired V centerline notches.
function outline(length: number, width: number, centers: number[]): Ring {
  const points: number[][] = [[-length/2,-width/2]];
  for (const x of centers) points.push([x-.8,-width/2],[x,-width/2+1.5],[x+.8,-width/2]);
  points.push([length/2,-width/2],[length/2,width/2]);
  for (const x of [...centers].reverse()) points.push([x+.8,width/2],[x,width/2-1.5],[x-.8,width/2]);
  points.push([-length/2,width/2]);
  return points.map(([x,y]) => new THREE.Vector2(x,y));
}

export function createRightAngleDrillGuideGeometry(params: ModelParams, model: RightAngleDrillGuideModelDefinition) {
  const spec = getRightAngleDrillGuideSpec(params, model);
  const outer = outline(spec.length,spec.width,spec.centers);
  const bores = spec.diameters.map((d,i) => circle(spec.centers[i],d,model.geometry.radialSegments));
  const entries = spec.diameters.map((d,i) => circle(spec.centers[i],d+2*ENTRY_CHAMFER,model.geometry.radialSegments));
  const labels = spec.centers.flatMap((x,i) => labelPockets(model.geometry.bitDiameters[i].toFixed(2),x,-spec.width/2+8));
  const positions: number[] = [];
  function triangle(a: THREE.Vector2, az: number, b: THREE.Vector2, bz: number, c: THREE.Vector2, cz: number) {
    positions.push(a.x,a.y,az,b.x,b.y,bz,c.x,c.y,cz);
  }
  function face(contour: Ring, holes: Ring[], z: number, up: boolean) {
    const rings = [contour.map(p=>p.clone()),...holes.map(h=>h.map(p=>p.clone()))];
    const tris = THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1));
    const points = rings.flat();
    for (const [ia,ib,ic] of tris) {
      const vertices = [points[ia],points[ib],points[ic]];
      const [a,b,c] = vertices;
      const cross = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
      if ((cross>0) !== up) vertices.reverse();
      // Earcut can omit collinear hole vertices on bridge edges. Restore them
      // on both adjacent triangles so engraved pockets have no T junctions.
      const perimeter = vertices.flatMap((a,i) => {
        const b = vertices[(i+1)%3], delta = b.clone().sub(a), len2 = delta.lengthSq();
        const between = points.map(p => ({p,t:p.clone().sub(a).dot(delta)/len2}))
          .filter(({p,t}) => t>1e-7 && t<1-1e-7 && Math.abs(delta.x*(p.y-a.y)-delta.y*(p.x-a.x))<1e-7)
          .sort((u,v)=>u.t-v.t);
        return [a,...between.map(({p})=>p)];
      });
      if (perimeter.length===3) triangle(vertices[0],z,vertices[1],z,vertices[2],z);
      else {
        const center = a.clone().add(b).add(c).multiplyScalar(1/3);
        perimeter.forEach((p,i) => triangle(center,z,p,z,perimeter[(i+1)%perimeter.length],z));
      }
    }
  }

  function wall(bottom: Ring, top: Ring, z0: number, z1: number, inward = false) {
    for (let i=0;i<bottom.length;i++) {
      const j=(i+1)%bottom.length;
      if (inward) {
        triangle(bottom[i],z0,top[j],z1,bottom[j],z0);
        triangle(bottom[i],z0,top[i],z1,top[j],z1);
      } else {
        triangle(bottom[i],z0,bottom[j],z0,top[j],z1);
        triangle(bottom[i],z0,top[j],z1,top[i],z1);
      }
    }
  }
  face(outer,bores,0,false);
  wall(outer,outer,0,spec.height);
  face(outer,[...entries,...labels],spec.height,true);
  bores.forEach((b,i) => {
    wall(b,b,0,spec.straightLength,true);
    wall(b,entries[i],spec.straightLength,spec.height,true);
  });
  labels.forEach(p => {
    wall(p,p,spec.height-ENGRAVING_DEPTH,spec.height,true);
    face(p,[],spec.height-ENGRAVING_DEPTH,true);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function updateRightAngleDrillGuide(mesh: THREE.Mesh, params: ModelParams, model: RightAngleDrillGuideModelDefinition) {
  const spec = getRightAngleDrillGuideSpec(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(spec.length,spec.width,spec.height);
  mesh.position.z = spec.height/2;
}

export function getRightAngleDrillGuideAuditValue(check: AuditCheckDefinition, params: ModelParams, unit: LengthUnit, model: RightAngleDrillGuideModelDefinition): AuditItem {
  const s = getRightAngleDrillGuideSpec(params,model);
  const f = (v: number) => formatLength(v,unit,2);
  const values: Record<string,string> = {
    bitSet: model.geometry.bitDiameters.map(d=>d.toFixed(2)).join(" · ") + " mm",
    bores: s.diameters.map(f).join(" · "),
    envelope: `${f(s.length)} × ${f(s.width)} × ${f(s.height)}`,
    guidance: `${f(s.straightLength)} straight · 90° to flat base`,
    alignment: "Paired V notches at each bore axis · clamp either end land",
    walls: `${f(s.minimumWeb)} between chamfered entries`,
    print: "Flat base down · bores vertical · no supports",
    fit: "Test on scrap; printed bores wear. Slow, short passes; clear chips.",
  };
  return {label:check.label,value:values[check.key] ?? "Unknown check",status:check.key === "fit" ? "warn" : "pass"};
}
