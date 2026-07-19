/**
 * Minimal test runner: each examples/*.ts script exits 0 on success,
 * non-zero on failure, and prints its own PASS/FAIL lines. This just
 * runs them all in a child process each and aggregates the result —
 * intentionally low-tech; swap for vitest/fast-check once you're ready
 * to add the property-based TIPNI fuzzing discussed in the README.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(here, "..", "examples");
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".ts"));

let failed = 0;
for (const file of files) {
  const full = path.join(examplesDir, file);
  console.log(`\n--- ${file} ---`);
  const res = spawnSync(process.execPath, ["--import", "tsx", full], {
    stdio: "inherit",
    cwd: path.join(here, ".."),
  });
  if (res.status !== 0) failed++;
}

console.log(`\n${files.length - failed}/${files.length} example scripts passed.`);
if (failed > 0) process.exit(1);
