import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

test("cataloged models declare STL files, parameters, audits, and scripts", () => {
  const catalog = readJson(path.join(root, "public/models/index.json"));
  expect(catalog.models).toHaveLength(2);

  for (const entry of catalog.models) {
    const model = readJson(path.join(root, "public", entry.configUrl.replace(/^\//, "")));
    const stlPath = path.join(root, "public", model.stl.url.replace(/^\//, ""));
    const auditScript = model.scripts.find((script: { name: string }) => script.name === "audit");

    expect(model.id).toBe(entry.id);
    expect(model.name).toBe(entry.name);
    expect(fs.existsSync(stlPath)).toBe(true);
    expect(model.parameters.length).toBeGreaterThanOrEqual(3);
    expect(model.audit.dimensionTargets.length).toBeGreaterThan(0);
    expect(model.audit.invariants.length).toBeGreaterThan(0);
    expect(model.audit.checks.length).toBeGreaterThan(0);
    expect(auditScript?.path).toContain(`models/${entry.id}/audit.mjs`);
    expect(fs.existsSync(path.join(root, auditScript.path))).toBe(true);
  }
});

test("request coverage document tracks the app behaviors under Playwright", () => {
  const coverage = readText(path.join(root, "docs/testing-and-audit-coverage.md"));
  const requiredPhrases = [
    "View STL models in a Vite React app",
    "center tube holds sand and has a rounded top",
    "Tube diameter is independently parameterized",
    "Imperial fractions such as `1/8th in` are accepted",
    "Unit control appears as contextual text with a caret",
    "Pan, zoom, frame, and edge-oriented views",
    "Rendering options include a solid view",
    "Original inlay/source overlay can be toggled",
    "per-model JSON for parameters, audit, and scripts",
    "Japandi tray supports width, length, height, floor thickness, and rib relief",
    "Dark theme is available",
    "Parameter state is saved in the URL",
    "Right sidebar has a resizable rail",
    "Convex library stores saved versions, forks, and uploaded STL assets",
  ];

  for (const phrase of requiredPhrases) {
    expect(coverage).toContain(phrase);
  }
});

test("model-specific audit docs mention their JSON-owned runtime checks", () => {
  const paperDoc = readText(path.join(root, "docs/audit-specifications.md"));
  const trayDoc = readText(path.join(root, "docs/japandi-tray-audit-specifications.md"));

  for (const phrase of [
    "weighted sand chamber",
    "rounded top",
    "Center tube diameter is adjustable independently",
    "Do not apply uniform XYZ scaling",
    "Slicer review should confirm the center tube can be filled with sand",
  ]) {
    expect(paperDoc).toContain(phrase);
  }

  for (const phrase of [
    "length, width, wall height, floor thickness, and rib relief",
    "Keep the original STL available as an overlay reference",
    "Do not let floor thickness equal or exceed total wall height",
    "Runtime audit checks include tray length",
  ]) {
    expect(trayDoc).toContain(phrase);
  }
});

test("line coverage audit samples exactly ten documented request lines", () => {
  const lineAudit = readText(path.join(root, "docs/line-coverage-audit.md"));
  const sampledRows = lineAudit
    .split("\n")
    .filter((line) => /^\| \d+ \|/.test(line));

  expect(sampledRows).toHaveLength(10);
  expect(lineAudit).toContain("cross-model URL-state leak");
  expect(lineAudit).toContain("All ten sampled lines");
});

test("Convex library persistence is documented and wired to Vercel builds", () => {
  const docs = readText(path.join(root, "docs/convex-library.md"));
  const schema = readText(path.join(root, "convex/schema.ts"));
  const functions = readText(path.join(root, "convex/library.ts"));
  const packageJson = readJson(path.join(root, "package.json"));
  const vercelJson = readJson(path.join(root, "vercel.json"));

  for (const phrase of [
    "Vercel Marketplace resource",
    "Save",
    "Fork",
    "Upload STL",
    "Open",
    "VITE_CONVEX_URL",
  ]) {
    expect(docs).toContain(phrase);
  }

  expect(schema).toContain("models: defineTable");
  expect(schema).toContain("versions: defineTable");
  expect(functions).toContain("generateUploadUrl");
  expect(functions).toContain("saveVersion");
  expect(functions).toContain("forkVersion");
  expect(functions).toContain("saveUploadedModel");
  expect(functions).toContain("listLibrary");
  expect(packageJson.scripts["build:vercel"]).toContain("convex deploy");
  expect(packageJson.scripts["build:vercel"]).toContain("VITE_CONVEX_URL");
  expect(vercelJson.buildCommand).toBe("npm run build:vercel");
});
