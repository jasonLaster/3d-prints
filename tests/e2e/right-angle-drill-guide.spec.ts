import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { createRightAngleDrillGuideGeometry, getRightAngleDrillGuideSpec } from "../../src/models/rightAngleDrillGuide";
import { getDefaultParams } from "../../src/models";
import type { RightAngleDrillGuideModelDefinition } from "../../src/models/types";
const root = path.resolve(import.meta.dirname,"../..");
const model = JSON.parse(fs.readFileSync(path.join(root,"public/models/right-angle-drill-guide/model.json"),"utf8")) as RightAngleDrillGuideModelDefinition;

test("six drill sizes retain exact increments and 90 degree guidance", () => {
  const params=getDefaultParams(model),s=getRightAngleDrillGuideSpec(params,model);
  expect(model.geometry.bitDiameters).toEqual([8.5,8.75,9,9.25,9.5,9.75]);
  expect(s.diameters).toEqual([8.65,8.9,9.15,9.4,9.65,9.9]);
  expect([s.length,s.width,s.height,s.straightLength]).toEqual([130,44,25,24.4]);
  const g=createRightAngleDrillGuideGeometry(params,model);
  expect(g.boundingBox!.min.z).toBe(0);
  expect(g.boundingBox!.max.z).toBe(25);
  g.dispose();
});

test("guide renders, preserves fine clearance, reloads and exports edited geometry", async ({page}) => {
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/?model=right-angle-drill-guide&unit=mm");
  await expect(page.getByRole("heading",{name:"90° Drill Guide",exact:true})).toBeVisible();
  await expect(page.getByLabel("90° Drill Guide model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByText("8.50 · 8.75 · 9.00 · 9.25 · 9.50 · 9.75 mm",{exact:true})).toBeVisible();
  if (process.env.CAPTURE_GUIDE === "true") {
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    fs.mkdirSync(path.join(root,".playwright/drill-guide"),{recursive:true});
    await page.screenshot({path:path.join(root,".playwright/drill-guide/desktop.png")});
    await page.locator(".scene-panel canvas").screenshot({path:path.join(root,".playwright/drill-guide/model.png")});
  }
  await expect(page.getByTestId("viewer-status")).toContainText("0.15 mm");
  const clearance=page.getByLabel("Bore clearance (total diameter) in millimeters");
  await clearance.fill("0.25");
  await page.getByLabel("Guide height in millimeters").fill("30");
  await expect.poll(()=>new URL(page.url()).searchParams.get("boreClearance")).toBe("0.25");
  await page.reload();
  await expect(clearance).toHaveValue("0.25");
  await expect(page.getByLabel("Guide height in millimeters")).toHaveValue("30.00");
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button",{name:"Workspace actions"}).click().then(()=>page.getByRole("button",{name:"Export",exact:true}).click()),
  ]);
  expect(download.suggestedFilename()).toContain("boreClearance-0.25");
  const file=fs.readFileSync((await download.path())!);
  const g=new STLLoader().parse(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
  const expected=createRightAngleDrillGuideGeometry({...getDefaultParams(model),boreClearance:.25,guideHeight:30},model);
  expect(Array.from(g.getAttribute("position").array)).toEqual(Array.from(expected.getAttribute("position").array));
  g.dispose();expected.dispose();
  expect(errors).toEqual([]);
});

test("guide remains visible on a phone", async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await page.goto("/?model=right-angle-drill-guide&unit=mm");
  await expect(page.getByRole("heading",{name:"90° Drill Guide",exact:true})).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if (process.env.CAPTURE_GUIDE === "true") {
    await page.screenshot({path:path.join(root,".playwright/drill-guide/mobile.png")});
  }
});
