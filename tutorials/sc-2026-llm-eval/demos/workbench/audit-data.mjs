// Run with Node 18+ from any directory. No dependencies or network access.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { defaults, evaluateComparison, exportExperiment, validateDataset } from "./engine.mjs";

const raw = readFileSync(new URL("./practice-data.json", import.meta.url));
const bundle = JSON.parse(raw);
const audit = {
  file: "practice-data.json",
  bytes: raw.length,
  sha256: createHash("sha256").update(raw).digest("hex"),
  datasets: [],
};

for (const dataset of Object.values(bundle)) {
  validateDataset(dataset);
  const records = dataset.tasks.flatMap(task => task.records);
  const initials = records.filter(record => record.kind === "initial");
  const repairs = records.filter(record => record.kind === "repair");
  const parents = new Set(repairs.map(record => record.parentId));
  audit.datasets.push({
    id: dataset.id,
    version: dataset.version,
    kind: dataset.kind,
    tasks: dataset.tasks.length,
    developmentTasks: dataset.tasks.filter(task => task.split === "development").length,
    reservedTasks: dataset.tasks.filter(task => task.split === "evaluation").length,
    initialRecords: initials.length,
    repairRecords: repairs.length,
    parentsWithoutRepair: dataset.mode === "ablation" ? initials.filter(record => !parents.has(record.id)).length : null,
    correctRecords: records.filter(record => record.correct === true).length,
    incorrectRecords: records.filter(record => record.correct === false).length,
    unknownLabels: records.filter(record => record.correct === null).length,
    missingTokenCounts: records.filter(record => record.tokens === null).length,
    publicPassButFinalFail: records.filter(record => record.publicCheck?.passed && record.correct === false).length,
  });

  if (process.argv.includes("--write-examples")) {
    const report = evaluateComparison(dataset, defaults(dataset.mode));
    const example = exportExperiment(report);
    // Keep checked-in examples small. Browser exports include all per-run traces.
    delete example.result.pairs;
    example.note = "Computed practice result. Per-run traces omitted here; import to recompute, or export them from the workbench.";
    writeFileSync(new URL(`./example-${dataset.mode}.json`, import.meta.url), JSON.stringify(example, null, 2) + "\n");
  }
}

console.log(JSON.stringify(audit, null, 2));
