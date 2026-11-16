import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  changedFactors, defaults, evaluateComparison, exportExperiment, importExperiment, normalizeAnswer,
  runPolicy, seedFor, shuffled, summarize, validateDataset, validateSettings,
} from "../engine.mjs";

const bundle = JSON.parse(readFileSync(new URL("../practice-data.json", import.meta.url)));
const samplePolicy = { name: "Test", budget: 4, selection: "vote", stopping: "budget", agreement: 2 };
const repairPolicy = { name: "Test", action: "repair", condition: "always", selection: "last" };

function makeTask(answers, labels, checks = null) {
  return {
    id: "test", split: "development", prompt: "Test fixture", family: "test",
    records: answers.map((answer, index) => ({
      id: `test/initial-${index}`, taskId: "test", runId: `test/draw-${index}`,
      kind: "initial", parentId: null, response: `Answer: ${answer}`, correct: labels[index],
      publicCheck: checks ? { passed: checks[index], feedback: `Check ${index}` } : null,
      tokens: null,
    })),
  };
}

function addRepair(task, parentIndex, correct, passed = true) {
  const parent = task.records[parentIndex];
  task.records.push({
    ...parent, id: `test/repair-${parentIndex}`, kind: "repair", parentId: parent.id,
    response: "Revised code", correct, publicCheck: { passed, feedback: "Repair check" },
    context: { parentId: parent.id, taskId: task.id, feedback: parent.publicCheck.feedback },
  });
}

function seedStartingWith(task, id) {
  for (let seed = 0; seed < 1000; seed += 1) {
    if (shuffled(task.records.filter(record => record.kind === "initial"), seed)[0].id === id) return seed;
  }
  throw new Error("No suitable test seed.");
}

test("bundled records have valid identities, splits, and repair contexts", () => {
  for (const dataset of Object.values(bundle)) assert.equal(validateDataset(dataset), dataset);
  const bad = structuredClone(bundle.ablation);
  bad.tasks[0].records.find(record => record.kind === "repair").parentId = "another-task/initial-0";
  assert.throws(() => validateDataset(bad), /parent/);
  const duplicate = structuredClone(bundle.sampling);
  duplicate.tasks[0].records[1].runId = duplicate.tasks[0].records[0].runId;
  assert.throws(() => validateDataset(duplicate), /Duplicate initial draw/);
});

test("normalization accepts complete finite numeric answers only", () => {
  assert.equal(normalizeAnswer("Reasoning\nAnswer: +1.00e2"), "100");
  assert.equal(normalizeAnswer("Answer: -0"), "0");
  for (const text of ["100", "Answer: NaN", "Answer: Infinity", "Answer: 1,000", "Answer: 1 or 2", "Answer: 1e999"]) {
    assert.equal(normalizeAnswer(text), null);
  }
});

test("one-shot success matches the sampled label and never exceeds coverage", () => {
  const task = bundle.sampling.tasks[0];
  for (let seed = 0; seed < 20; seed += 1) {
    const result = runPolicy(task, { ...samplePolicy, budget: 1, selection: "first" }, seed, "sampling");
    assert.equal(result.finalCorrect, result.consumed[0].correct);
    assert.equal(result.coverage, result.finalCorrect);
    assert.equal(result.cost.calls, 1);
  }
});

test("sampling is reproducible, paired, and without replacement within a run", () => {
  const settings = defaults("sampling");
  const first = evaluateComparison(bundle.sampling, settings);
  assert.deepEqual(first, evaluateComparison(bundle.sampling, settings));
  const another = evaluateComparison(bundle.sampling, { ...settings, seed: 17 });
  assert.notDeepEqual(first.pairs.map(pair => pair.seed), another.pairs.map(pair => pair.seed));
  for (const pair of first.pairs) {
    assert.equal(pair.runs[0].initialId, pair.runs[1].initialId);
    for (const run of pair.runs) {
      assert.equal(new Set(run.consumed.map(record => record.id)).size, run.cost.calls);
      assert.ok(Number(run.coverage) >= Number(run.finalCorrect));
    }
  }
  assert.equal(first.sweep.at(-1).success, first.summaries[1].success);
});

test("changing evaluation-only labels cannot change actions or selection", () => {
  for (const mode of ["sampling", "ablation"]) {
    const dataset = structuredClone(bundle[mode]);
    const before = evaluateComparison(dataset, defaults(mode));
    for (const task of dataset.tasks) for (const record of task.records) record.correct = !record.correct;
    const after = evaluateComparison(dataset, defaults(mode));
    assert.deepEqual(before.pairs.map(pair => pair.runs.map(run => run.trace)), after.pairs.map(pair => pair.runs.map(run => run.trace)));
    for (const pair of before.pairs) {
      for (const run of pair.runs) for (const event of run.trace) {
        assert.equal(Object.hasOwn(event.observation ?? {}, "correct"), false);
      }
    }
  }
});

test("vote ties choose the earliest answer and invalid answers can abstain", () => {
  const task = makeTask([1, 2, 1, 2], [true, false, true, false]);
  for (let seed = 0; seed < 10; seed += 1) {
    const run = runPolicy(task, samplePolicy, seed, "sampling");
    assert.equal(run.selectedId, run.initialId);
  }
  const invalid = makeTask(["unknown", "?"], [false, false]);
  const abstention = runPolicy(invalid, { ...samplePolicy, budget: 2 }, 1, "sampling");
  assert.equal(abstention.selectedId, null);
  assert.equal(abstention.abstained, true);
  assert.equal(abstention.finalCorrect, false);
  assert.equal(abstention.invalidAnswers, 2);
});

test("agreement stops on observations, including agreement on a wrong answer", () => {
  const task = makeTask([2, 2, 2, 2], [false, false, false, false]);
  const run = runPolicy(task, { ...samplePolicy, stopping: "agreement" }, 3, "sampling");
  assert.equal(run.cost.calls, 2);
  assert.equal(run.finalCorrect, false);
  assert.match(run.trace.find(event => event.action === "stop").reason, /matching/);
});

test("budget validation rejects overdraws and invalid configurations", () => {
  const settings = defaults("sampling");
  settings.policies[0].budget = 9;
  assert.throws(() => validateSettings(settings, bundle.sampling), /attempt limit/);
  settings.policies[0].budget = 1;
  settings.seed = -1;
  assert.throws(() => validateSettings(settings, bundle.sampling), /seed/);
  settings.seed = 0;
  settings.trials = 101;
  assert.throws(() => validateSettings(settings, bundle.sampling), /trials/);
  const tiny = makeTask([1], [true]);
  assert.equal(runPolicy(tiny, samplePolicy, 1, "sampling").status, "unsupported");
});

test("repairs preserve parent identity and missing branches are unavailable", () => {
  const task = makeTask([1, 2], [false, false], [false, false]);
  addRepair(task, 1, true);
  const seed = seedStartingWith(task, task.records[0].id);
  const missing = runPolicy(task, repairPolicy, seed, "ablation");
  assert.equal(missing.status, "unsupported");
  assert.equal(missing.finalCorrect, null);
  assert.equal(missing.consumed.length, 1);
  const available = runPolicy(task, repairPolicy, seedStartingWith(task, task.records[1].id), "ablation");
  assert.equal(available.consumed[1].parentId, available.initialId);
  assert.equal(available.finalCorrect, true);
});

test("fresh attempts do not consume a repair or inherit feedback", () => {
  const task = makeTask([1, 2], [false, true], [false, true]);
  addRepair(task, 0, true);
  const run = runPolicy(task, { ...repairPolicy, action: "fresh" }, 6, "ablation");
  assert.ok(run.consumed.every(record => record.kind === "initial" && record.parentId === null));
  assert.equal(run.cost.checkerCalls, 0);
  assert.equal(run.cost.calls, 2);
});

test("initial passes remain in overall scores; regression is not silently repaired", () => {
  const task = makeTask([1], [true], [true]);
  addRepair(task, 0, false, false);
  const regression = runPolicy(task, repairPolicy, 4, "ablation");
  assert.equal(regression.finalCorrect, false);
  assert.equal(regression.coverage, true);
  assert.equal(summarize([regression]).transitions.regression, 1);
  const stopped = runPolicy(task, { ...repairPolicy, condition: "on-failure" }, 4, "ablation");
  assert.equal(stopped.finalCorrect, true);
  assert.equal(stopped.cost.calls, 1);
  assert.equal(summarize([stopped]).transitions.stayedCorrect, 1);
});

test("public-pass selection uses incomplete checks and charges only invoked checks", () => {
  const task = makeTask([1], [false], [true]);
  addRepair(task, 0, true, true);
  const run = runPolicy(task, { ...repairPolicy, selection: "public-pass" }, 1, "ablation");
  assert.equal(run.selectedId, run.initialId);
  assert.equal(run.finalCorrect, false);
  assert.equal(run.coverage, true);
  assert.equal(run.cost.checkerCalls, 1);
  assert.equal(run.invalidAnswers, 0);
});

test("unknown costs and labels remain unknown rather than becoming zero or failure", () => {
  const task = makeTask([1], [null]);
  const run = runPolicy(task, { ...samplePolicy, budget: 1, selection: "first" }, 1, "sampling");
  assert.equal(run.finalCorrect, null);
  assert.equal(run.coverage, null);
  assert.equal(run.cost.tokens, null);
  assert.equal(run.cost.missingTokens, 1);
  assert.equal(summarize([run]).scored, 0);
  task.records[0].tokens = 0;
  const measured = runPolicy(task, { ...samplePolicy, budget: 1 }, 1, "sampling");
  assert.equal(measured.cost.tokens, 0);
});

test("paired exclusion uses the same cohort for policies and baseline", () => {
  const report = evaluateComparison(bundle.ablation, defaults("ablation"));
  assert.ok(report.excludedPairs > 0);
  assert.equal(report.summaries[0].scored, report.summaries[1].scored);
  assert.equal(report.baseline.scored, report.matchedRuns);
  assert.equal(report.matchedRuns + report.excludedPairs, report.requestedRuns);
  for (const pair of report.pairs) assert.equal(pair.runs[0].initialId, pair.runs[1].initialId);
});

test("reserved evaluation uses only reserved tasks and reports its exact settings", () => {
  const settings = { ...defaults("sampling"), split: "evaluation" };
  const report = evaluateComparison(bundle.sampling, settings);
  assert.ok(report.taskIds.every(id => bundle.sampling.tasks.find(task => task.id === id).split === "evaluation"));
  settings.policies[0].name = "Changed later";
  assert.notEqual(report.settings.policies[0].name, settings.policies[0].name);
});

test("inactive controls are not reported as changed experimental factors", () => {
  const settings = defaults("sampling");
  settings.policies[1] = { ...settings.policies[0], agreement: 7 };
  assert.deepEqual(changedFactors(settings), []);
  settings.policies[1].stopping = "agreement";
  assert.deepEqual(changedFactors(settings), ["stopping", "agreement"]);
});

test("exports reproduce results; incompatible data and malformed imports fail", () => {
  for (const mode of ["sampling", "ablation"]) {
    const dataset = bundle[mode];
    const original = evaluateComparison(dataset, defaults(mode));
    const exported = JSON.parse(JSON.stringify(exportExperiment(original)));
    assert.deepEqual(evaluateComparison(dataset, importExperiment(exported, dataset)), original);
    exported.dataset.version = "not-this-version";
    assert.throws(() => importExperiment(exported, dataset), /different dataset/);
    assert.throws(() => importExperiment({}, dataset), /exported workbench/);
  }
  assert.equal(seedFor(2026, "task", 0), seedFor(2026, "task", 0));
});

test('Monkey Business records retain real outputs, extracted answers, and paired scoring', () => {
  const data = JSON.parse(readFileSync(new URL('../monkey-business.json', import.meta.url)));
  validateDataset(data);
  assert.equal(data.tasks.length, 127);
  assert.equal(data.tasks.filter(task => task.split === 'development').length, 84);
  assert.ok(data.tasks.every(task => task.records.length === 100));
  assert.ok(data.tasks.every(task => task.records.every(record => record.provenance === 'published_record')));
  const config = defaults('sampling');
  config.trials = 2;
  const report = evaluateComparison(data, config);
  assert.equal(report.matchedRuns, 168);
  assert.ok(report.summaries[1].coverage >= report.summaries[1].success);
  const task = structuredClone(data.tasks[0]);
  const before = runPolicy(task, config.policies[1], 3, 'sampling');
  task.records.forEach(record => { record.correct = !record.correct; });
  assert.deepEqual(runPolicy(task, config.policies[1], 3, 'sampling').trace, before.trace);
  assert.equal(before.trace[0].observation.answer, before.consumed[0].extractedAnswer);
});

test('random selection is seeded, consumes its budget, and ignores labels', () => {
  const task = makeTask([1, 2, 3, 4], [true, false, false, false]);
  const policy = { ...samplePolicy, selection: 'random' };
  const ids = new Set();
  for (let seed = 0; seed < 40; seed += 1) {
    const run = runPolicy(task, policy, seed, 'sampling');
    assert.equal(run.cost.calls, 4);
    assert.deepEqual(run, runPolicy(task, policy, seed, 'sampling'));
    ids.add(run.selectedId);
  }
  assert.equal(ids.size, 4);
});

test('agreement uses N matches and respects the no-agreement fallback', () => {
  const task = makeTask([1, 2, 3, 4], [true, false, false, false]);
  const policy = { ...samplePolicy, stopping: 'agreement', agreement: 3, fallback: 'abstain' };
  assert.equal(runPolicy(task, policy, 1, 'sampling').abstained, true);
  assert.equal(runPolicy(task, { ...policy, fallback: 'vote' }, 1, 'sampling').abstained, false);
  const matching = makeTask([2, 2, 2, 2], [false, false, false, false]);
  const run = runPolicy(matching, policy, 1, 'sampling');
  assert.equal(run.cost.calls, 3);
  assert.equal(run.finalCorrect, false);
});

test('ideal verifier is isolated, labels its traces, and abstains on exhaustion', async () => {
  const { runVerifiedDiagnostic } = await import('../engine.mjs');
  const task = makeTask([1, 2, 3, 4], [false, true, false, false]);
  const policy = { ...samplePolicy, stopping: 'oracle-verified' };
  assert.throws(() => runPolicy(task, policy, 1, 'sampling'), /separate diagnostic/);
  const run = runVerifiedDiagnostic(task, policy, 1);
  assert.equal(run.finalCorrect, true);
  assert.equal(run.diagnostic, 'ideal-verifier');
  assert.equal(run.cost.checkerCalls, run.cost.calls);
  assert.ok(run.trace.some(event => event.action === 'oracle-check'));
  task.records.forEach(record => { record.correct = false; });
  const failed = runVerifiedDiagnostic(task, policy, 1);
  assert.equal(failed.abstained, true);
  assert.equal(failed.cost.calls, 4);
});

test('cost counts prompt per output and repetitions change totals, not unit cost', async () => {
  const { estimateGenerationCost } = await import('../cost.mjs');
  const dataset = { tasks: [{ id: 't', generationPrompt: '12345678' }] };
  const run = { consumed: [{ response: '1234' }, { response: '12345678' }], cost: { calls: 2, checkerCalls: 1 } };
  const pair = { eligible: true, taskId: 't', runs: [run, run] };
  const once = estimateGenerationCost(dataset, { pairs: [pair] }, 1);
  const twice = estimateGenerationCost(dataset, { pairs: [pair, pair] }, 1);
  assert.equal(once.arms[0].inputTokens, 4);
  assert.equal(once.arms[0].outputTokens, 3);
  assert.equal(once.arms[0].totalUsd, 7 / 1e6);
  assert.equal(twice.arms[0].totalUsd, once.arms[0].totalUsd * 2);
  assert.equal(twice.arms[0].usdPerThousandRuns, once.arms[0].usdPerThousandRuns);
  assert.throws(() => estimateGenerationCost(dataset, { pairs: [pair] }, -1), /rate/);
});
