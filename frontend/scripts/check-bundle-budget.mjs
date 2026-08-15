import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assetsDir = resolve(root, "dist/assets");
const budgetPath = resolve(root, "bundle-budget.json");

let entries;
try {
  entries = readdirSync(assetsDir);
} catch {
  console.error(`No se encontró ${assetsDir}. Ejecuta "vite build" antes de verificar el presupuesto.`);
  process.exit(1);
}

const { groups } = JSON.parse(readFileSync(budgetPath, "utf8"));

// Vite nombra cada chunk como "<nombre>-<hash>.<ext>", pero tanto el nombre
// como el hash pueden contener guiones, así que no hay forma fiable de
// separarlos con una sola expresión regular. En su lugar, se compara cada
// archivo contra los nombres conocidos del presupuesto (más largos primero)
// y sólo se recurre a una heurística para chunks nuevos aún no presupuestados.
const governedChunks = new Set(Object.values(groups).flatMap((group) => group.chunks));
const knownNames = [...governedChunks].sort((a, b) => b.length - a.length);
const fallbackPattern = /^(.+)-[^-]+\.(js|css)$/;

function chunkNameFor(filename) {
  for (const name of knownNames) {
    if (filename.startsWith(`${name}-`)) return name;
  }
  const fallback = fallbackPattern.exec(filename);
  return fallback ? fallback[1] : filename;
}

const gzipKbByChunk = new Map();

for (const entry of entries) {
  if (!entry.endsWith(".js") && !entry.endsWith(".css")) continue;
  const name = chunkNameFor(entry);
  const bytes = gzipSync(readFileSync(resolve(assetsDir, entry))).length;
  gzipKbByChunk.set(name, (gzipKbByChunk.get(name) ?? 0) + bytes / 1024);
}
let failed = false;

console.log("Presupuesto de carga por ruta (gzip):\n");
for (const [groupName, group] of Object.entries(groups)) {
  const actualKb = group.chunks.reduce((sum, chunk) => sum + (gzipKbByChunk.get(chunk) ?? 0), 0);
  const overBudget = actualKb > group.budgetKb;
  failed ||= overBudget;
  const status = overBudget ? "✗ EXCEDE" : "✓";
  console.log(
    `  ${status}  ${groupName.padEnd(16)} ${actualKb.toFixed(2).padStart(8)} kB / ${String(group.budgetKb).padStart(3)} kB  (${group.description})`,
  );
}

const ungoverned = [...gzipKbByChunk.keys()].filter((name) => !governedChunks.has(name));
if (ungoverned.length > 0) {
  console.log("\nChunks sin presupuesto asignado (añádelos a bundle-budget.json):");
  for (const name of ungoverned) {
    console.log(`  •  ${name.padEnd(16)} ${gzipKbByChunk.get(name)?.toFixed(2) ?? "0.00"} kB`);
  }
}

if (failed) {
  console.error("\nEl build excede el presupuesto de carga aceptado.");
  process.exit(1);
}

console.log("\nTodas las rutas están dentro de su presupuesto de carga.");
