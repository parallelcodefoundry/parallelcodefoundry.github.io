import {
  defaults, evaluateComparison, exportExperiment, importExperiment,
  validateDataset, validateSettings,
} from "./engine.mjs?v=1.1.0";

const mode = document.body.dataset.demo;
const byId = id => document.getElementById(id);
const percent = value => value === null ? "Unavailable" : `${(100 * value).toFixed(1)}%`;
const decimal = value => value === null ? "Unavailable" : value.toFixed(2);
const points = value => value === null ? "Unavailable" : `${value > 0 ? "+" : ""}${(100 * value).toFixed(1)} pp`;
const state = { dataset: null, report: null, split: "development", frozen: null, busy: false };

// All imported names, task text, and candidate responses enter the DOM as text.
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function table(headers, rows, caption) {
  const result = element("table");
  if (caption) result.append(element("caption", caption));
  const head = element("thead");
  const headerRow = element("tr");
  for (const title of headers) {
    const cell = element("th", title);
    cell.scope = "col";
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = element("tbody");
  for (const row of rows) {
    const tr = element("tr");
    row.forEach((value, index) => {
      const cell = element(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      cell.append(value instanceof Node ? value : document.createTextNode(String(value)));
      tr.append(cell);
    });
    body.append(tr);
  }
  result.append(head, body);
  return result;
}

function field(prefix, key, label, value, options = null, wide = false) {
  const wrapper = element("div", null, wide ? "wide" : "");
  const id = `${prefix}-${key}`;
  const title = element("label", label);
  title.htmlFor = id;
  const control = element(options ? "select" : "input");
  control.id = id;
  if (options) {
    for (const [optionValue, text] of options) {
      const option = element("option", text);
      option.value = optionValue;
      control.append(option);
    }
  } else {
    control.type = "text";
    control.maxLength = 50;
    control.required = true;
  }
  control.value = value;
  wrapper.append(title, control);
  return wrapper;
}

function renderPolicies(policies) {
  const container = byId("policies");
  container.replaceChildren();
  policies.forEach((policy, index) => {
    const prefix = `policy-${index}`;
    const panel = element("fieldset", null, "policy");
    panel.append(element("legend", `Policy ${index === 0 ? "A" : "B"}`));
    const fields = element("div", null, "policy-fields");
    fields.append(field(prefix, "name", "Name", policy.name, null, true));
    if (mode === "sampling") {
      fields.append(
        field(prefix, "budget", "Attempt limit", policy.budget, Array.from({ length: 8 }, (_, i) => [i + 1, String(i + 1)])),
        field(prefix, "selection", "Return", policy.selection, [["first", "First sample"], ["last", "Last sample"], ["vote", "Plurality vote"]]),
        field(prefix, "stopping", "Stop when", policy.stopping, [["budget", "Limit reached"], ["agreement", "Answers agree"]]),
        field(prefix, "agreement", "Matching answers needed", policy.agreement, Array.from({ length: 7 }, (_, i) => [i + 2, String(i + 2)])),
      );
    } else {
      fields.append(
        field(prefix, "action", "After the first attempt", policy.action, [["none", "No continuation (one shot)"], ["fresh", "Fresh attempt"], ["repair", "Feedback repair"]], true),
        field(prefix, "condition", "Continue when", policy.condition, [["on-failure", "Public check fails"], ["always", "Always"]]),
        field(prefix, "selection", "Return", policy.selection, [["first", "Original output"], ["last", "Latest output"], ["public-pass", "First public-check pass"]]),
      );
    }
    panel.append(fields, element("p", mode === "sampling"
      ? "Voting ignores invalid answers; ties go to the answer seen first."
      : "If no output passes the public check, that selector returns the latest output.", "hint"));
    container.append(panel);
  });
  syncPolicyFields();
}

function syncPolicyFields() {
  for (let index = 0; index < 2; index += 1) {
    if (mode === "sampling") {
      byId(`policy-${index}-agreement`).disabled = byId(`policy-${index}-stopping`).value !== "agreement";
    } else {
      byId(`policy-${index}-condition`).disabled = byId(`policy-${index}-action`).value === "none";
    }
  }
}

function readSettings() {
  const policies = [0, 1].map(index => {
    const value = key => byId(`policy-${index}-${key}`).value;
    return mode === "sampling"
      ? { name: value("name").trim(), budget: Number(value("budget")), stopping: value("stopping"), agreement: Number(value("agreement")), selection: value("selection") }
      : { name: value("name").trim(), action: value("action"), condition: value("condition"), selection: value("selection") };
  });
  return { mode, split: state.split, seed: Number(byId("seed").value), trials: Number(byId("trials").value), policies };
}

function applySettings(settings) {
  state.split = settings.split;
  state.frozen = settings.split === "evaluation" ? structuredClone(settings) : null;
  byId("seed").value = settings.seed;
  byId("trials").value = settings.trials;
  renderPolicies(settings.policies);
  syncControls();
}

function syncControls() {
  byId("experiment-controls").disabled = state.busy || Boolean(state.frozen);
  byId("run").disabled = state.busy;
  byId("freeze").disabled = state.busy || Boolean(state.frozen);
  byId("reset").disabled = state.busy;
  byId("development").hidden = !state.frozen;
  const count = state.dataset.tasks.filter(task => task.split === state.split).length;
  byId("split-label").textContent = `${state.split === "evaluation" ? "Reserved evaluation" : "Development"} · ${count} tasks`;
}

function setStatus(message, error = false) {
  byId("status").textContent = message;
  byId("status").classList.toggle("error", error);
}

function markDirty() {
  syncPolicyFields();
  if (state.report) byId("stale").hidden = false;
  setStatus("Settings changed. Run the comparison to update the results.");
}

function metric(label, value, note) {
  const box = element("div", null, "metric");
  box.append(
    element("span", label, "metric-label"),
    element("strong", value, "metric-value"),
    element("small", note),
  );
  return box;
}

function renderResults(report) {
  byId("results").hidden = false;
  byId("cases").hidden = false;
  byId("stale").hidden = true;
  byId("result-label").textContent = `${report.settings.split === "evaluation" ? "Reserved" : "Development"} · seed ${report.settings.seed}`;
  const a = report.summaries[0];
  const b = report.summaries[1];
  byId("metrics").replaceChildren(
    metric("A · Returned success", percent(a.success), report.settings.policies[0].name),
    metric("B · Returned success", percent(b.success), report.settings.policies[1].name),
    metric("B − A · Paired difference", points(report.difference), `${report.matchedRuns} matched runs · ${report.taskIds.length} tasks requested`),
  );
  const rows = [report.baseline, a, b].map((summary, index) => {
    const letter = index === 1 ? "A" : "B";
    const name = index === 0 ? "One shot · reference" : `${letter} · ${summary.name}`;
    const className = index === 0 ? "" : `policy-name policy-${letter.toLowerCase()}`;
    return [
      element("span", name, className),
      percent(summary.success), percent(summary.coverage), percent(summary.gap),
      decimal(summary.meanCalls),
      ...(mode === "ablation" ? [decimal(summary.meanChecks)] : []),
      summary.abstentions,
    ];
  });
  const headers = [
    "Policy", "Returned success", "Oracle coverage", "Selection gap",
    mode === "sampling" ? "Mean attempts" : "Mean calls",
    ...(mode === "ablation" ? ["Mean checks"] : []), "Abstentions",
  ];
  byId("summary-table").replaceChildren(
    table(headers, rows, "Synthetic practice results · same included runs for every policy"),
  );
  renderComparisonNotes(report);

  if (mode === "sampling") renderSweep(report);
  else renderTransitions(report);
  renderAccounting(report);
  updateCaseChoices();
}

function renderComparisonNotes(report) {
  const [a, b] = report.summaries;
  const factorNames = {
    budget: "attempt limit", stopping: "stopping rule", agreement: "agreement threshold",
    selection: "selection rule", action: "continuation action", condition: "continuation condition",
  };
  const changed = report.changedFactors.map(factor => factorNames[factor]);
  const notes = [
    changed.length ? `Changed: ${changed.join(", ")}.` : "Both policies use the same rules.",
    "Fixed: task set, starting samples, seed, and final evaluator.",
    `${report.matchedRuns} of ${report.requestedRuns} pairs included; ${report.excludedPairs} excluded from both scores.`,
  ];
  if (report.excludedPairs) {
    notes.push(
      `Unavailable runs: A ${a.attempted.unsupported}, B ${b.attempted.unsupported}.`,
      `Unscorable runs: A ${a.attempted.unscorable}, B ${b.attempted.unscorable}.`,
    );
  }
  if (mode === "ablation") {
    notes.push(
      "Actual calls can differ; token costs are unknown.",
      "Without a no-feedback revision control, this comparison cannot isolate feedback.",
    );
  }
  byId("comparison-notes").textContent = notes.join(" ");
}

function renderAccounting(report) {
  const [a, b] = report.summaries;
  const ranges = [0, 1].map(index => {
    const values = report.trialResults.map(trial => trial.success[index]).filter(value => value !== null);
    return values.length ? `${percent(Math.min(...values))}–${percent(Math.max(...values))}` : "Unavailable";
  });
  const notes = [
    `${report.taskIds.length} tasks × ${report.settings.trials} replay trials; ${report.matchedRuns} matched, scorable runs.`,
    "Each included pair has equal weight; exclusions can change the task mix.",
    `Trial success ranges: A ${ranges[0]}, B ${ranges[1]}.`,
    "These describe ordering within a fixed pool, not confidence intervals.",
    "The paired difference is in percentage points (pp).",
    "Tokens, timing, and monetary costs are unavailable.",
    mode === "sampling"
      ? `Unparseable answers consumed: A ${a.invalidAnswers}, B ${b.invalidAnswers}.`
      : "Calls and checks describe the authored workflow, not measured model usage.",
  ];
  byId("accounting").textContent = notes.join(" ");
  const rows = report.trialResults.map(trial => [trial.trial + 1, trial.runs, ...trial.success.map(percent)]);
  byId("trial-table").replaceChildren(
    table(["Replay trial", "Included tasks", "A · Success", "B · Success"], rows),
  );
}

function renderSweep(report) {
  byId("sweep-title").textContent = `Policy B across attempt limits · ${report.settings.policies[1].name}`;
  const rows = report.sweep.map(result => {
    const cell = element("div", `${percent(result.success)} / ${percent(result.coverage)}`);
    const track = element("div", null, "bar-track");
    track.setAttribute("aria-hidden", "true");
    const coverage = element("div", null, "bar");
    coverage.style.width = `${100 * (result.coverage ?? 0)}%`;
    const success = element("div", null, "bar success");
    success.style.width = `${100 * (result.success ?? 0)}%`;
    track.append(coverage, success);
    cell.append(track);
    return [result.budget, cell, percent(result.gap), decimal(result.meanCalls), result.scored];
  });
  byId("sweep-table").replaceChildren(table(["Attempt limit", "Success / coverage", "Selection gap", "Mean attempts", "Scored runs"], rows));
}

function renderTransitions(report) {
  const rows = report.summaries.map((summary, index) => {
    const counts = summary.transitions;
    return [`${index === 0 ? "A" : "B"} · ${summary.name}`, counts.recovery, counts.regression, counts.stayedCorrect, counts.stayedIncorrect];
  });
  byId("transition-table").replaceChildren(table(["Policy", "Incorrect → correct", "Correct → incorrect", "Correct → correct", "Incorrect → incorrect"], rows));
  const initial = report.baseline.transitions;
  const failing = initial.stayedIncorrect;
  const recovery = report.summaries.map(summary => failing ? percent(summary.transitions.recovery / failing) : "Unavailable (no initial failures)");
  byId("transition-notes").textContent = [
    `${report.matchedRuns} included runs: ${initial.stayedCorrect} initially correct, ${failing} initially incorrect.`,
    `Recovery among initial failures: A ${recovery[0]}, B ${recovery[1]}.`,
    "Overall success includes both groups.",
  ].join(" ");
}

function filteredPairs() {
  const filter = byId("case-filter").value;
  return state.report.pairs.filter(pair => {
    if (filter === "different") return pair.eligible && pair.runs[0].finalCorrect !== pair.runs[1].finalCorrect;
    if (filter === "gap") return pair.runs.some(run => run.status === "complete" && run.coverage && !run.finalCorrect);
    if (filter === "recovery") return pair.runs.some(run => run.status === "complete" && run.initialCorrect === false && run.finalCorrect === true);
    if (filter === "regression") return pair.runs.some(run => run.status === "complete" && run.initialCorrect === true && run.finalCorrect === false);
    if (filter === "unsupported") return pair.runs.some(run => run.status === "unsupported");
    return true;
  });
}

function setOptions(select, values) {
  const previous = select.value;
  select.replaceChildren();
  for (const [value, label] of values) {
    const option = element("option", label);
    option.value = String(value);
    select.append(option);
  }
  if (values.some(([value]) => String(value) === previous)) select.value = previous;
  select.disabled = values.length === 0;
}

function updateCaseChoices() {
  const ids = [...new Set(filteredPairs().map(pair => pair.taskId))];
  setOptions(byId("case-task"), ids.map(id => {
    const task = state.dataset.tasks.find(candidate => candidate.id === id);
    return [id, `${task.id} · ${task.family}`];
  }));
  updateTrialChoices();
}

function updateTrialChoices() {
  const pairs = filteredPairs().filter(pair => pair.taskId === byId("case-task").value);
  setOptions(byId("case-trial"), pairs.map(pair => [pair.trial, `Trial ${pair.trial + 1}`]));
  renderCase();
}

function outcome(value) {
  return value === null ? "Unknown" : value ? "Pass" : "Fail";
}

function renderTrace(run, name) {
  const panel = element("article", null, "trace-panel");
  panel.append(element("h3", name));
  const result = run.status === "unsupported" ? "Unavailable branch · excluded from comparison"
    : run.abstained ? "No answer returned"
    : `Returned: ${run.selectedId} · Final evaluation: ${outcome(run.finalCorrect)}`;
  panel.append(element("p", result, "hint"));
  const events = element("ol", null, "trace-events");
  for (const event of run.trace) {
    let text;
    if (event.action === "check") text = `Check ${event.sampleId}: ${event.observation.feedback}`;
    else if (["stop", "select"].includes(event.action)) text = `${event.action === "stop" ? "Stop" : "Select"}: ${event.reason}`;
    else text = `${{ sample: "Sample", initial: "Initial sample", fresh: "Fresh attempt", repair: "Repair" }[event.action]}: ${event.sampleId}`;
    events.append(element("li", text));
  }
  panel.append(events);
  for (const record of run.consumed) {
    const selected = run.selectedId === record.id;
    const card = element("div", null, `candidate${selected ? " selected" : ""}`);
    const header = element("div", null, "candidate-header");
    const grade = record.correct === null ? "unknown" : record.correct ? "passed" : "failed";
    const label = element(
      "span", `${selected ? "Returned · " : ""}Final: ${outcome(record.correct)}`, `outcome ${grade}`,
    );
    header.append(element("code", record.id), label);
    const response = element("pre");
    response.append(element("code", record.response));
    card.append(header, response);
    if (record.parentId) card.append(element("p", `Parent: ${record.parentId}. Repair input: original task, parent code, and its public feedback.`));
    if (mode === "ablation") {
      const check = run.trace.find(event => event.action === "check" && event.sampleId === record.id);
      card.append(element("p", check ? `Public check used: ${check.observation.feedback}` : "Public check not used by this policy."));
    }
    panel.append(card);
  }
  return panel;
}

function renderCase() {
  const container = byId("case-detail");
  const pair = filteredPairs().find(candidate => candidate.taskId === byId("case-task").value && candidate.trial === Number(byId("case-trial").value));
  if (!pair) {
    container.replaceChildren(element("p", "No cases match this filter. Try another filter or policy.", "hint"));
    return;
  }
  const task = state.dataset.tasks.find(candidate => candidate.id === pair.taskId);
  const prompt = element("div", null, "task-prompt");
  prompt.append(element("strong", task.id), element("p", task.prompt));
  if (task.publicTests) prompt.append(element("p", `Public test: ${task.publicTests}`, "hint"));
  const inclusion = pair.eligible
    ? "Included in both scores."
    : "Excluded from both scores; available actions are shown below.";
  prompt.append(element("p", `Trial seed: ${pair.seed}. ${inclusion}`, "hint"));
  const traces = element("div", null, "trace-grid");
  pair.runs.forEach((run, index) => traces.append(renderTrace(run, `${index === 0 ? "A" : "B"} · ${state.report.settings.policies[index].name}`)));
  container.replaceChildren(prompt, traces);
}

async function runExperiment(reserved = false, imported = null) {
  if (state.busy || (!imported && !byId("experiment-form").reportValidity())) return;
  try {
    const hadResults = Boolean(state.report);
    const settings = imported ?? structuredClone(state.frozen ?? readSettings());
    if (reserved) settings.split = "evaluation";
    validateSettings(settings, state.dataset);
    state.busy = true;
    syncControls();
    setStatus("Running paired policies…");
    // Let the browser paint status before running the bounded offline evaluation.
    await new Promise(resolve => setTimeout(resolve, 0));
    state.report = evaluateComparison(state.dataset, settings);
    applySettings(settings);
    renderResults(state.report);
    setStatus(settings.split === "evaluation"
      ? "Reserved evaluation complete. This configuration is frozen. Export it, or return to development to make changes."
      : "Comparison complete. Inspect a case, change a rule, and run again.");
    if (hadResults) byId("results").scrollIntoView({ block: "start" });
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.busy = false;
    syncControls();
  }
}

function downloadExperiment() {
  const exportData = exportExperiment(state.report);
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = `sc26-${mode}-${state.report.settings.split}-seed-${state.report.settings.seed}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Exported the last completed experiment, including its configuration and traces.");
}

async function loadImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error("Choose an experiment file smaller than 25 MB.");
    let value;
    try { value = JSON.parse(await file.text()); }
    catch { throw new Error("That file is not valid JSON. Choose an exported experiment."); }
    const settings = importExperiment(value, state.dataset);
    await runExperiment(false, settings);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.value = "";
  }
}

function attachEvents() {
  byId("experiment-form").addEventListener("submit", event => { event.preventDefault(); runExperiment(); });
  byId("experiment-controls").addEventListener("input", markDirty);
  byId("clone-policy").addEventListener("click", () => {
    const settings = readSettings();
    settings.policies[1] = { ...settings.policies[0], name: `${settings.policies[0].name} copy`.slice(0, 50) };
    renderPolicies(settings.policies);
    markDirty();
  });
  byId("freeze").addEventListener("click", () => runExperiment(true));
  byId("development").addEventListener("click", () => {
    applySettings({ ...state.frozen, split: "development" });
    markDirty();
  });
  byId("reset").addEventListener("click", () => runExperiment(false, defaults(mode)));
  byId("export").addEventListener("click", downloadExperiment);
  byId("import").addEventListener("click", () => byId("import-file").click());
  byId("import-file").addEventListener("change", loadImport);
  byId("case-filter").addEventListener("change", updateCaseChoices);
  byId("case-task").addEventListener("change", updateTrialChoices);
  byId("case-trial").addEventListener("change", renderCase);
}

async function start() {
  try {
    const response = await fetch(new URL("practice-data.json", import.meta.url));
    if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
    const bundle = await response.json();
    state.dataset = validateDataset(bundle[mode]);
    applySettings(defaults(mode));
    attachEvents();
    await runExperiment();
  } catch (error) {
    setStatus(`Unable to load the workbench: ${error.message} Serve the checkout with python3 -m http.server 8000, then reload this page.`, true);
  }
}

start();
