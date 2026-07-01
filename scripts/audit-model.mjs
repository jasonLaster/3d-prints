import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "public", "models", "index.json");
const requestedIds = process.argv.slice(2);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function configPathFor(entry) {
  return path.join(root, "public", entry.configUrl.replace(/^\/+/, ""));
}

function runAudit(entry) {
  const configPath = configPathFor(entry);
  const model = readJson(configPath);
  const auditScript = model.scripts?.find((script) => script.name === "audit");

  if (!auditScript) {
    throw new Error(`${entry.id} does not define an audit script`);
  }

  const scriptPath = path.resolve(root, auditScript.path);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`${entry.id} audit script does not exist: ${auditScript.path}`);
  }

  const result = spawnSync(process.execPath, [scriptPath, configPath], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const catalog = readJson(catalogPath);
const entries =
  requestedIds.length === 0
    ? catalog.models
    : catalog.models.filter((entry) => requestedIds.includes(entry.id));

const missing = requestedIds.filter(
  (id) => !catalog.models.some((entry) => entry.id === id),
);

if (missing.length > 0) {
  throw new Error(`Unknown model id: ${missing.join(", ")}`);
}

for (const entry of entries) {
  runAudit(entry);
}
