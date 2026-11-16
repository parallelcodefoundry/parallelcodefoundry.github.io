import { defaults, evaluateComparison, exportExperiment, validateDataset, runPolicy, runVerifiedDiagnostic } from './engine.mjs?v=1.1.0';

import { estimateGenerationCost } from './cost.mjs';

const get = id => document.getElementById(id);
const percent = value => value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
let dataset;
let report;
let busy = false;

// Dataset text is always rendered as text, never interpreted as markup or code.
function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function settings(split) {
  const config = defaults('sampling');
  config.split = split;
  config.seed = Number(get('seed').value);
  config.trials = Number(get('trials').value);
  const strategy = get('selection').value;
  config.policies[0] = { ...config.policies[0], name: 'Random draw: one output', selection: 'random' };
  config.policies[1] = {
    name: get('selection').selectedOptions[0].textContent,
    budget: Number(get('budget').value),
    selection: strategy === 'random' ? 'random' : 'vote',
    stopping: strategy === 'agreement' ? 'agreement' : strategy === 'verified' ? 'oracle-verified' : 'budget',
    agreement: strategy === 'agreement' ? Number(get('agreement').value) : 2,
    fallback: strategy === 'agreement' ? get('fallback').value : 'vote',
  };
  config.costRate = Number(get('cost-rate').value);
  return config;
}

function metric(label, value, note) {
  const box = node('div', undefined, 'metric');
  box.append(node('span', label, 'metric-label'), node('strong', value, 'metric-value'), node('small', note));
  return box;
}

function render() {
  const [baseline, method] = report.summaries;
  get('results').hidden = get('finish').hidden = false;
  get('stale').hidden = true;
  get('split-label').textContent = report.settings.split === 'evaluation' ? 'Reserved questions' : 'Test questions';
  get('metrics').replaceChildren(
    metric('Control: one random model output', percent(baseline.success), 'Returned answer is correct'),
    metric(report.diagnostic ? 'Ideal verifier (answer key)' : 'Your method', percent(method.success), 'Returned answer is correct'),
    metric('% of sample pools that had a correct answer', percent(method.coverage),
      `Upper bound with a sample size of ${report.settings.policies[1].stopping !== 'budget' ? 'up to ' : ''}${report.settings.policies[1].budget}`),
  );
  const choices = report.taskIds.map(id => {
    const option = node('option', id);
    option.value = id;
    return option;
  });
  get('task').replaceChildren(...choices);
  get('trial').replaceChildren(...report.trialResults.map(result => {
    const option = node('option', `Repetition ${result.trial + 1}`);
    option.value = result.trial;
    return option;
  }));
  get('diagnostic-result').hidden = !report.diagnostic;
  get('diagnostic-result').textContent = report.diagnostic ?? '';
  renderCost();
  renderCase();
}

function updateStrategy() {
  const strategy = get('selection').value;
  get('agreement-controls').hidden = strategy !== 'agreement';
  get('agreement').disabled = get('fallback').disabled = strategy !== 'agreement';
  get('verifier-note').hidden = strategy !== 'verified';
  renderStrategyDiagram();
}

// Authored illustration, separate from the recorded dataset and experiment scores.
// Use the same policy runner so the picture follows the selected limit and rule.
function renderStrategyDiagram() {
  const policy = settings('development').policies[1];
  if (!Number.isInteger(policy.agreement) || policy.agreement < 2 || policy.agreement > 8) {
    get('strategy-diagram').replaceChildren(node('figcaption', 'Choose N between 2 and 8 to see the illustration.'));
    return;
  }
  const task = {
    id: 'illustration',
    records: [12, 10, 12, 8, 12, 10, 12, 12].map((answer, index) => ({
      id: `illustration-${index}`, kind: 'initial', response: `Answer: ${answer}`,
      correct: answer === 12, tokens: null, publicCheck: null,
    })),
  };
  const verified = policy.stopping === 'oracle-verified';
  const run = verified ? runVerifiedDiagnostic(task, policy, 70) : runPolicy(task, policy, 70, 'sampling');
  const selected = run.consumed.find(record => record.id === run.selectedId);
  const answer = selected?.response.replace('Answer: ', '') ?? 'No answer';
  const samples = node('div', undefined, 'diagram-samples');
  samples.append(node('span', 'Samples in order', 'diagram-label'));
  const chips = node('ol', undefined, 'sample-chips');
  for (const record of run.consumed) {
    const value = record.response.replace('Answer: ', '');
    const matches = policy.selection === 'random' ? record.id === run.selectedId : selected && value === answer;
    const chip = node('li', undefined, `sample-chip${matches ? ' match' : ''}`);
    chip.append(node('span', value));
    if (verified) chip.append(node('small', record.correct ? 'Pass' : 'Fail'));
    chips.append(chip);
  }
  for (let index = run.consumed.length; index < policy.budget; index += 1) {
    const unused = node('li', '–', 'sample-chip unused');
    unused.setAttribute('aria-label', 'Not sampled: stopped early');
    chips.append(unused);
  }
  samples.append(chips);
  const arrow = node('span', '→', 'flow-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  const result = node('div', undefined, 'diagram-result');
  result.append(node('span', 'Return', 'diagram-label'), arrow, node('strong', answer, 'chosen-answer'));
  const matching = run.consumed.filter(record => record.response === selected?.response).length;
  let reason;
  if (verified) reason = 'Check each answer; stop at the first pass. Answer key: 12.';
  else if (policy.selection === 'random') reason = 'Choose one sample at random.';
  else if (policy.stopping === 'agreement') {
    reason = matching >= policy.agreement
      ? `${policy.agreement} answers agree. Stop after ${run.cost.calls} samples.`
      : `N = ${policy.agreement} not reached. ${run.abstained ? 'Return no answer.' : 'Use the most frequent answer.'}`;
  } else reason = `${answer} appears ${matching} ${matching === 1 ? 'time' : 'times'}.${matching === 1 && policy.budget > 1 ? ' Ties go to the answer seen first.' : ''}`;
  const caption = node('figcaption', `Illustration · What is 3 × 4? ${reason}`);
  get('strategy-diagram').replaceChildren(samples, result, caption);
}

function renderCost() {
  const table = node('table');
  const head = node('thead');
  const row = node('tr');
  for (const label of ['Method', 'Mean outputs', 'Mean checks', 'USD / 1,000 outcomes', 'USD / experiment']) {
    const cell = node('th', label);
    cell.scope = 'col';
    row.append(cell);
  }
  head.append(row);
  const body = node('tbody');
  report.generationCost.arms.forEach((arm, index) => {
    const row = node('tr');
    const name = index === 0 ? 'One-output control' : report.settings.policies[1].name;
    for (const value of [name, arm.meanCalls.toFixed(2), arm.meanChecks.toFixed(2),
      `$${arm.usdPerThousandRuns.toFixed(3)}`, `$${arm.totalUsd.toFixed(3)}`]) row.append(node('td', value));
    body.append(row);
  });
  table.append(node('caption', `Estimate at $${report.generationCost.ratePerMillion.toFixed(2)} per million tokens.`), head, body);
  get('cost-table').replaceChildren(table);
}

function renderCase() {
  const task = dataset.tasks.find(task => task.id === get('task').value);
  const pair = report.pairs.find(pair => pair.taskId === task.id && pair.trial === Number(get('trial').value));
  const [baseline, method] = pair.runs;
  get('question').textContent = task.prompt;
  const outcome = run => run.abstained ? 'no answer' : run.finalCorrect ? 'correct' : 'incorrect';
  get('case-summary').textContent = `One-answer baseline: ${outcome(baseline)}. Your method: ${outcome(method)}. ` +
    method.trace.find(event => event.action === 'stop').reason;
  get('answers').replaceChildren(...method.consumed.map((record, index) => {
    const selected = record.id === method.selectedId;
    const detail = node('details', undefined, `candidate${selected ? ' selected' : ''}`);
    const label = `Attempt ${index + 1}: ${record.extractedAnswer ?? 'No numeric answer'} · ` +
      `${record.correct ? 'Correct' : 'Incorrect'}${selected ? ' · Returned by your method' : ''}` +
      `${index === 0 ? ' · Baseline answer' : ''}`;
    detail.append(node('summary', label), node('pre', record.response), node('small', record.id));
    return detail;
  }));
}

async function run() {
  if (busy || !get('sampling-form').reportValidity()) return;
  const split = document.querySelector('input[name=split]:checked').value;
  const config = settings(split);
  busy = true;
  get('settings').disabled = get('question-set').disabled = get('run').disabled = true;
  get('status').textContent = 'Comparing recorded answers…';
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    report = evaluateComparison(dataset, config);
    report.generationCost = estimateGenerationCost(dataset, report, config.costRate);
    render();
    get('status').textContent = 'Comparison complete. Inspect the answers below.';
    get('results').scrollIntoView({ block: 'start' });
  } catch (error) {
    get('status').textContent = error.message;
  } finally {
    busy = false;
    get('settings').disabled = get('question-set').disabled = get('run').disabled = false;
  }
}

get('sampling-form').addEventListener('submit', event => { event.preventDefault(); run(); });
get('settings').addEventListener('input', () => { updateStrategy(); if (report) get('stale').hidden = false; });
get('task').addEventListener('change', renderCase);
get('trial').addEventListener('change', renderCase);
get('question-set').addEventListener('change', () => run());
get('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportExperiment(report))], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = `monkey-business-${report.settings.split}-${report.settings.seed}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  const response = await fetch(new URL('./monkey-business.json', import.meta.url));
  if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
  dataset = validateDataset(await response.json());
  get('example-question').textContent = dataset.tasks.find(task => task.split === 'development').prompt;
  updateStrategy();
  get('settings').disabled = get('run').disabled = false;
  get('status').textContent = 'Ready: choose a rule and run the comparison.';
} catch (error) {
  get('status').textContent = `${error.message} Serve the checkout with python3 -m http.server 8000, then reload.`;
}
