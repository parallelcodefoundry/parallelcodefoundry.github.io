// Policies see observations. Evaluation labels are read only after selection.
export const ENGINE_VERSION = "1.1.0";

export function seedFor(...parts) {
  let hash = 2166136261;
  for (const character of parts.join("/")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export function shuffled(records, seed) {
  const result = [...records];
  let state = seed >>> 0;
  function random() {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

// Only a final "Answer: <number>" line counts. Equivalent finite numbers vote together.
export function normalizeAnswer(response) {
  const match = response.match(/(?:^|\n)Answer:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*$/i);
  if (!match || !Number.isFinite(Number(match[1]))) return null;
  return String(Number(match[1]));
}

export function defaults(mode) {
  const policies = mode === "sampling"
    ? [
        { name: "One shot", budget: 1, stopping: "budget", agreement: 2, selection: "first" },
        { name: "Vote over attempts", budget: 8, stopping: "budget", agreement: 2, selection: "vote" },
      ]
    : [
        { name: "Fresh attempt", action: "fresh", condition: "on-failure", selection: "last" },
        { name: "Feedback repair", action: "repair", condition: "on-failure", selection: "last" },
      ];
  return { mode, split: "development", seed: 2026, trials: 20, policies };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateDataset(dataset) {
  requireValue(dataset.id && dataset.version && dataset.evaluator, "The dataset needs an ID, version, and evaluator.");
  requireValue(["sampling", "ablation"].includes(dataset.mode), "Unknown dataset type.");
  requireValue(Array.isArray(dataset.tasks) && dataset.tasks.length > 0, "The dataset has no tasks.");
  const taskIds = new Set();
  const recordIds = new Set();
  const initialRunIds = new Set();
  for (const task of dataset.tasks) {
    requireValue(!taskIds.has(task.id), `Duplicate task: ${task.id}.`);
    taskIds.add(task.id);
    requireValue(["development", "evaluation"].includes(task.split), `Invalid split: ${task.id}.`);
    requireValue(typeof task.prompt === "string", `Missing task text: ${task.id}.`);
    requireValue(task.records.some(record => record.kind === "initial"), `No initial samples: ${task.id}.`);
    for (const record of task.records) {
      requireValue(record.id && !recordIds.has(record.id), `Duplicate or missing sample ID: ${record.id}.`);
      recordIds.add(record.id);
      requireValue(record.taskId === task.id, `Wrong task reference: ${record.id}.`);
      requireValue(typeof record.response === "string", `Missing response: ${record.id}.`);
      requireValue([true, false, null].includes(record.correct), `Invalid evaluation label: ${record.id}.`);
      requireValue(record.tokens === null || (Number.isInteger(record.tokens) && record.tokens >= 0), `Invalid token count: ${record.id}.`);
      requireValue(record.kind === "initial" || record.kind === "repair", `Unknown action: ${record.id}.`);
      if (record.publicCheck !== null) {
        requireValue(typeof record.publicCheck?.passed === "boolean" && typeof record.publicCheck.feedback === "string", `Invalid public check: ${record.id}.`);
      }
      if (record.kind === "initial") {
        requireValue(record.parentId === null && record.runId, `Invalid independent draw: ${record.id}.`);
        requireValue(!initialRunIds.has(record.runId), `Duplicate initial draw ID: ${record.runId}.`);
        initialRunIds.add(record.runId);
      } else {
        const parent = task.records.find(candidate => candidate.id === record.parentId);
        requireValue(parent?.kind === "initial", `Missing repair parent: ${record.id}.`);
        requireValue(parent.publicCheck && record.context?.feedback === parent.publicCheck.feedback, `Repair feedback does not match its parent: ${record.id}.`);
        requireValue(record.context?.parentId === parent.id && record.context?.taskId === task.id, `Invalid repair context: ${record.id}.`);
      }
    }
  }
  return dataset;
}

export function validateSettings(settings, dataset) {
  requireValue(settings && settings.mode === dataset.mode, "This configuration belongs to a different workbench.");
  requireValue(["development", "evaluation"].includes(settings.split), "Choose a development or reserved split.");
  requireValue(Number.isInteger(settings.seed) && settings.seed >= 0 && settings.seed <= 4294967295, "Use a seed between 0 and 4,294,967,295.");
  requireValue(Number.isInteger(settings.trials) && settings.trials >= 1 && settings.trials <= 100, "Use 1–100 replay trials per task.");
  requireValue(Array.isArray(settings.policies) && settings.policies.length === 2, "A comparison needs two policies.");
  const tasks = dataset.tasks.filter(task => task.split === settings.split);
  requireValue(tasks.length > 0, "This dataset has no tasks in the selected split.");
  for (const policy of settings.policies) {
    requireValue(typeof policy.name === "string" && policy.name.trim().length > 0 && policy.name.length <= 50, "Give each policy a name of 1–50 characters.");
    if (settings.mode === "sampling") {
      requireValue(Number.isInteger(policy.budget) && policy.budget >= 1 && policy.budget <= 8, "Choose an attempt limit from 1 to 8.");
      requireValue(tasks.every(task => task.records.filter(record => record.kind === "initial").length >= policy.budget), "The attempt limit exceeds the available sample pool.");
      requireValue(["budget", "agreement", "oracle-verified"].includes(policy.stopping), "Unknown stopping rule.");
      requireValue(Number.isInteger(policy.agreement) && policy.agreement >= 2 && policy.agreement <= 8, "Agreement needs 2–8 matching answers.");
      requireValue(["first", "last", "vote", "random"].includes(policy.selection), "Unknown answer selector.");
      requireValue(policy.fallback === undefined || ["vote", "abstain"].includes(policy.fallback), "Unknown fallback rule.");
    } else {
      requireValue(["none", "fresh", "repair"].includes(policy.action), "That continuation is not available in this dataset.");
      requireValue(["always", "on-failure"].includes(policy.condition), "Unknown continuation condition.");
      requireValue(["first", "last", "public-pass"].includes(policy.selection), "Unknown answer selector.");
    }
  }
  return settings;
}

function observation(record) {
  return { id: record.id, response: record.response, answer: extractedAnswer(record) };
}

function extractedAnswer(record) {
  return Object.hasOwn(record, "extractedAnswer")
    ? record.extractedAnswer : normalizeAnswer(record.response);
}

function vote(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (candidate.answer === null) continue;
    if (!groups.has(candidate.answer)) groups.set(candidate.answer, []);
    groups.get(candidate.answer).push(candidate);
  }
  // Map order preserves the earliest sampled answer when counts tie.
  let winner = [];
  for (const group of groups.values()) {
    if (group.length > winner.length) winner = group;
  }
  return { candidate: winner[0] ?? null, count: winner.length };
}

function scoreRun(consumed, selectedId, trace, checks, status, mode) {
  const selected = consumed.find(record => record.id === selectedId);
  const knownTokens = consumed.reduce((sum, record) => sum + (record.tokens ?? 0), 0);
  const missingTokens = consumed.filter(record => record.tokens === null).length;
  let coverage = consumed.some(record => record.correct === true);
  if (!coverage && consumed.some(record => record.correct === null)) coverage = null;
  const initial = consumed[0];
  const finalCorrect = status !== "complete" ? null : selected ? selected.correct : false;
  return {
    status, selectedId, finalCorrect, coverage,
    initialId: initial?.id ?? null,
    initialCorrect: initial?.correct ?? null,
    abstained: status === "complete" && selectedId === null,
    invalidAnswers: mode === "sampling" ? consumed.filter(record => extractedAnswer(record) === null).length : 0,
    cost: { calls: consumed.length, checkerCalls: checks, tokens: missingTokens ? null : knownTokens, knownTokens, missingTokens },
    trace, consumed,
  };
}

export function runPolicy(task, policy, seed, mode) {
  if (policy.stopping === "oracle-verified") {
    throw new Error("The ideal verifier must use the separate diagnostic runner.");
  }
  const initialPool = shuffled(task.records.filter(record => record.kind === "initial"), seed);
  const consumed = [];
  const candidates = [];
  const trace = [];
  const checked = new Map();

  function take(record, action) {
    consumed.push(record);
    const visible = observation(record);
    candidates.push(visible);
    trace.push({ action, sampleId: record.id, observation: visible });
    return visible;
  }

  function check(candidate) {
    if (checked.has(candidate.id)) return checked.get(candidate.id);
    const signal = consumed.find(record => record.id === candidate.id).publicCheck;
    if (!signal) return null;
    checked.set(candidate.id, signal);
    trace.push({ action: "check", sampleId: candidate.id, observation: signal });
    return signal;
  }

  function finish(selected, reason, status = "complete") {
    trace.push({ action: "select", sampleId: selected?.id ?? null, reason });
    return scoreRun(consumed, selected?.id ?? null, trace, checked.size, status, mode);
  }

  if (!initialPool.length) return finish(null, "No initial sample is available.", "unsupported");

  if (mode === "sampling") {
    if (policy.budget > initialPool.length) return finish(null, "The attempt limit exceeds the sample pool.", "unsupported");
    let stopReason = "Attempt limit reached.";
    for (const record of initialPool.slice(0, policy.budget)) {
      take(record, "sample");
      if (policy.stopping === "agreement" && vote(candidates).count >= policy.agreement) {
        stopReason = `${policy.agreement} matching answers observed.`;
        break;
      }
    }
    trace.push({ action: "stop", reason: stopReason });
    if (policy.stopping === "agreement" && vote(candidates).count < policy.agreement && policy.fallback === "abstain") {
      return finish(null, "Agreement not reached; return no answer.");
    }
    if (policy.selection === "random") {
      return finish(shuffled(candidates, seedFor(seed, "selection"))[0], "Uniform random draw from the consumed samples.");
    }
    if (policy.selection === "vote") {
      return finish(vote(candidates).candidate, "Plurality vote; ties go to the earliest sampled answer. No valid answer means abstention.");
    }
    const selected = policy.selection === "first" ? candidates[0] : candidates[candidates.length - 1];
    return finish(selected, `Return the ${policy.selection} sample.`);
  }

  const initial = take(initialPool[0], "initial");
  let shouldContinue = policy.action !== "none";
  if (shouldContinue && policy.condition === "on-failure") {
    const signal = check(initial);
    if (!signal) return finish(null, "A public check is unavailable.", "unsupported");
    shouldContinue = !signal.passed;
  }
  if (shouldContinue) {
    let continuation;
    if (policy.action === "fresh") {
      continuation = initialPool[1];
    } else {
      if (!check(initial)) return finish(null, "Repair feedback is unavailable.", "unsupported");
      const branches = task.records.filter(record => record.kind === "repair" && record.parentId === initial.id);
      continuation = shuffled(branches, seedFor(seed, "repair"))[0];
    }
    if (!continuation) return finish(null, `No ${policy.action} continuation is recorded for this initial sample.`, "unsupported");
    take(continuation, policy.action);
  }
  let stopReason = "Initial public check passed; keep the original.";
  if (shouldContinue) stopReason = "One continuation used; two-call limit reached.";
  else if (policy.action === "none") stopReason = "One-shot policy.";
  trace.push({ action: "stop", reason: stopReason });

  if (policy.selection === "public-pass") {
    for (const candidate of candidates) {
      const signal = check(candidate);
      if (!signal) return finish(null, "Selection requires an unavailable public check.", "unsupported");
      if (signal.passed) return finish(candidate, "Return the first public-check pass.");
    }
    return finish(candidates[candidates.length - 1], "No public-check pass; return the latest output.");
  }
  return finish(policy.selection === "first" ? initial : candidates[candidates.length - 1], `Return the ${policy.selection === "first" ? "original" : "latest"} output.`);
}

// Diagnostic only: this deliberately uses evaluation labels as a perfect verifier.
// It is never routed through the ordinary policy runner or presented as deployable.
export function runVerifiedDiagnostic(task, policy, seed) {
  const pool = shuffled(task.records.filter(record => record.kind === "initial"), seed);
  const consumed = [];
  const trace = [];
  let selectedId = null;
  for (const record of pool.slice(0, policy.budget)) {
    consumed.push(record);
    trace.push({ action: "sample", sampleId: record.id, observation: observation(record) });
    trace.push({ action: "oracle-check", sampleId: record.id, passed: record.correct });
    if (record.correct === true) {
      selectedId = record.id;
      break;
    }
  }
  trace.push({ action: "stop", reason: selectedId ? "Ideal verifier accepted an answer (answer-key access)." : "Limit reached without verification; return no answer." });
  trace.push({ action: "select", sampleId: selectedId, reason: "Diagnostic using evaluation-only labels." });
  const result = scoreRun(consumed, selectedId, trace, consumed.length, "complete", "sampling");
  result.diagnostic = "ideal-verifier";
  return result;
}

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function summarize(runs) {
  const scorable = runs.filter(run => run.status === "complete" && run.finalCorrect !== null && run.coverage !== null);
  const transitions = { recovery: 0, regression: 0, stayedCorrect: 0, stayedIncorrect: 0, unknownInitial: 0 };
  for (const run of scorable) {
    if (run.initialCorrect === null) transitions.unknownInitial += 1;
    else if (run.initialCorrect && run.finalCorrect) transitions.stayedCorrect += 1;
    else if (run.initialCorrect) transitions.regression += 1;
    else if (run.finalCorrect) transitions.recovery += 1;
    else transitions.stayedIncorrect += 1;
  }
  const success = mean(scorable.map(run => Number(run.finalCorrect)));
  const coverage = mean(scorable.map(run => Number(run.coverage)));
  const tokens = scorable.map(run => run.cost.tokens);
  return {
    runs: runs.length, scored: scorable.length,
    unsupported: runs.filter(run => run.status === "unsupported").length,
    unscorable: runs.filter(run => run.status === "complete" && (run.finalCorrect === null || run.coverage === null)).length,
    success, coverage, gap: success === null ? null : coverage - success,
    abstentions: scorable.filter(run => run.abstained).length,
    meanCalls: mean(scorable.map(run => run.cost.calls)),
    meanChecks: mean(scorable.map(run => run.cost.checkerCalls)),
    meanTokens: tokens.some(value => value === null) ? null : mean(tokens),
    missingTokenRecords: scorable.reduce((sum, run) => sum + run.cost.missingTokens, 0),
    invalidAnswers: scorable.reduce((sum, run) => sum + run.invalidAnswers, 0),
    transitions,
  };
}

export function changedFactors(settings) {
  const fields = settings.mode === "sampling"
    ? ["budget", "stopping", "agreement", "selection", "fallback"]
    : ["action", "condition", "selection"];
  return fields.filter(field => {
    if (["agreement", "fallback"].includes(field) && settings.policies.every(policy => policy.stopping !== "agreement")) return false;
    if (field === "condition" && settings.policies.every(policy => policy.action === "none")) return false;
    return settings.policies[0][field] !== settings.policies[1][field];
  });
}

export function evaluateComparison(dataset, settings) {
  validateSettings(settings, dataset);
  const tasks = dataset.tasks.filter(task => task.split === settings.split);
  const baselinePolicy = settings.mode === "sampling"
    ? { budget: 1, stopping: "budget", selection: "first" }
    : { action: "none", condition: "always", selection: "first" };
  const execute = (task, policy, seed) => policy.stopping === "oracle-verified"
    ? runVerifiedDiagnostic(task, policy, seed)
    : runPolicy(task, policy, seed, settings.mode);
  const pairs = [];
  for (let trial = 0; trial < settings.trials; trial += 1) {
    for (const task of tasks) {
      const seed = seedFor(settings.seed, task.id, trial);
      const runs = settings.policies.map(policy => execute(task, policy, seed));
      const baseline = runPolicy(task, baselinePolicy, seed, settings.mode);
      const eligible = [...runs, baseline].every(run => run.status === "complete" && run.finalCorrect !== null && run.coverage !== null);
      pairs.push({ taskId: task.id, trial, seed, eligible, baseline, runs });
    }
  }
  // Use the same supported, scorable pairs for both policies and the reference.
  const matched = pairs.filter(pair => pair.eligible);
  const summaries = settings.policies.map((policy, index) => ({
    name: policy.name,
    ...summarize(matched.map(pair => pair.runs[index])),
    attempted: summarize(pairs.map(pair => pair.runs[index])),
  }));
  const trialResults = Array.from({ length: settings.trials }, (_, trial) => {
    const trialPairs = matched.filter(pair => pair.trial === trial);
    return { trial, runs: trialPairs.length, success: settings.policies.map((_, index) => mean(trialPairs.map(pair => Number(pair.runs[index].finalCorrect)))) };
  });
  const sweep = [];
  if (settings.mode === "sampling") {
    const policy = settings.policies[1];
    const budgets = [...new Set([1, 2, 4, 6, 8, policy.budget])].filter(budget => budget <= policy.budget).sort((a, b) => a - b);
    for (const budget of budgets) {
      const runs = pairs.map(pair => execute(tasks.find(task => task.id === pair.taskId), { ...policy, budget }, pair.seed));
      sweep.push({ budget, ...summarize(runs) });
    }
  }
  return {
    engineVersion: ENGINE_VERSION,
    diagnostic: settings.policies.some(policy => policy.stopping === "oracle-verified") ? "Ideal verifier uses evaluation labels; not a deployable method." : null,
    dataset: { id: dataset.id, version: dataset.version, kind: dataset.kind, model: dataset.model, evaluator: dataset.evaluator, checker: dataset.checker, limitations: dataset.limitations },
    settings: structuredClone(settings), taskIds: tasks.map(task => task.id),
    requestedRuns: pairs.length, matchedRuns: matched.length,
    excludedPairs: pairs.length - matched.length,
    summaries, baseline: summarize(matched.map(pair => pair.baseline)),
    difference: matched.length ? summaries[1].success - summaries[0].success : null,
    changedFactors: changedFactors(settings), trialResults, sweep, pairs,
    protocol: {
      sampling: "Seeded shuffle without replacement within a run; the pool is reused across replay trials.",
      pairing: "Same task, trial seed, and initial sample. Exclude a pair from both scores if any arm or reference is unsupported or unscorable.",
      aggregation: "Each matched task/trial pair has equal weight. Missing pairs can change the task mix.",
      variation: "Trial ranges describe replay order on this fixed pool; they are not confidence intervals or new model samples.",
      reservedSplit: "A protocol convention: all tasks are shipped to the browser. Freeze settings before inspecting reserved results.",
    },
  };
}

export function exportExperiment(report) {
  return { format: "sc26-workbench-v1", dataset: report.dataset, settings: report.settings, result: report };
}

export function importExperiment(value, dataset) {
  requireValue(value?.format === "sc26-workbench-v1", "Choose an exported workbench JSON file.");
  requireValue(value.dataset?.id === dataset.id && value.dataset?.version === dataset.version, "The export uses a different dataset or version.");
  if (value.result) requireValue(value.result.engineVersion === ENGINE_VERSION, "The export uses a different engine version.");
  validateSettings(value.settings, dataset);
  return structuredClone(value.settings);
}
