import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { loadModel } from "./load-model.mjs";
const root = path.resolve(import.meta.dirname,"../..");
const model = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(root,"public/models/right-angle-drill-guide/model.json")));
const defaults = Object.fromEntries(model.parameters.map(p=>[p.key,p.default]));
const { createRightAngleDrillGuideGeometry, getRightAngleDrillGuideSpec } = await loadModel();
assert.deepEqual(model.geometry.bitDiameters,[8.5,8.75,9,9.25,9.5,9.75]);

export function auditGeometry(geometry) {
  const p=geometry.getAttribute("position"),edges=new Map(),parents=Array.from({length:p.count/3},(_,i)=>i);
  const find=i=>parents[i]===i ? i : (parents[i]=find(parents[i]));
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(4)).join(",");
  let volume=0;
  for(let i=0;i<p.count;i+=3) {
    const [a,b,c]=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));
    assert.ok([...a,...b,...c].every(Number.isFinite),"finite vertices");
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-10,"nondegenerate triangles");
    volume+=a.dot(b.clone().cross(c))/6;
    for(const [ia,ib] of [[i,i+1],[i+1,i+2],[i+2,i]]) {
      const ka=key(ia),kb=key(ib),k=[ka,kb].sort().join("|");
      const old=edges.get(k);
      if(old) {old.count++;old.balance+=ka<kb?1:-1;parents[find(i/3)]=find(old.triangle);}
      else edges.set(k,{count:1,balance:ka<kb?1:-1,triangle:i/3});
    }
  }
  assert.ok([...edges.values()].every(e=>e.count===2 && e.balance===0),"closed oriented manifold");
  assert.equal(new Set(parents.map((_,i)=>find(i))).size,1,"single connected shell including engraved labels");
  assert.ok(volume>0,"positive signed volume");
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.z)<1e-5,"flat on Z=0");
  return volume;
}

let variants=0;
for (let mask=0;mask<17;mask++) {
  const params=mask===16? defaults : Object.fromEntries(model.parameters.map((p,i)=>[p.key,p.limits[(mask>>i)&1?"max":"min"]]));
  const s=getRightAngleDrillGuideSpec(params,model),g=createRightAngleDrillGuideGeometry(params,model);
  auditGeometry(g);
  assert.ok(s.minimumWeb>4.7,"adequate web at the largest entries");
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.updateMatrixWorld(true);
  for(let i=0;i<6;i++) {
    const x=s.centers[i],r=s.diameters[i]/2;
    const ray=new THREE.Raycaster(new THREE.Vector3(x,0,-1),new THREE.Vector3(0,0,1));
    assert.equal(ray.intersectObject(mesh).length,0,"bore axis is open through both faces");
    for (const z of [.5,s.height/2,s.height-1]) {
      for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2].map(a=>a+Math.PI/model.geometry.radialSegments)) {
        ray.set(new THREE.Vector3(x,0,z),new THREE.Vector3(Math.cos(angle),Math.sin(angle),0));
        const hit=ray.intersectObject(mesh)[0];
        assert.ok(hit && Math.abs(hit.distance-r)<.002,`same bore radius along the full straight guide: mask ${mask}, bore ${i}, z ${z}, angle ${angle}, hit ${hit?.distance}, expected ${r}`);
      }
    }
  }
  g.dispose();mesh.material.dispose();variants++;
}
const original=createRightAngleDrillGuideGeometry(defaults,model);
const buffer=fs.readFileSync(path.join(root,"public",model.stl.url));
const exported=new STLLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
auditGeometry(exported);
assert.deepEqual(exported.getAttribute("position").array,original.getAttribute("position").array,"default STL exactly matches shared geometry");
console.log(`PASS exact six-size set; ${variants} parameter variants: connected, oriented, watertight, no degenerates; all bores open and perpendicular; STL parity.`);
original.dispose();exported.dispose();
