import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const candidates = [
  resolve(repositoryRoot, ".venv/Scripts/python.exe"),
  resolve(repositoryRoot, ".venv/bin/python"),
];
const python = candidates.find(existsSync) ?? "python";
const result = spawnSync(python, process.argv.slice(2), {
  cwd: resolve(import.meta.dirname, ".."),
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
