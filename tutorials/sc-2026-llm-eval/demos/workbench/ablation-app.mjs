import { evaluateRepair, policiesFor, validateRepairData } from './ablation-engine.mjs';

const percent = value => value === null ? '—' : `${(100 * value).toFixed(1)}%`;
const decimal = value => value === null ? '—' : value.toFixed(2);
const points = value => value === null ? '—' : `${value > 0 ? '+' : ''}${(100 * value).toFixed(1)} pp`;
const datasets = new Map();

// Programs and feedback are always text, never interpreted as HTML or code.
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function loadData(config) {
  const key = config.feedback === 'self' ? config.model : 'feedback';
  if (!datasets.has(key)) {
    const request = fetch(new URL(`./self-repair-${key}.json`, import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error(`Could not load the dataset (${response.status}).`);
        return response.json();
      })
      .then(validateRepairData)
      .catch(error => { datasets.delete(key); throw error; });
    datasets.set(key, request);
  }
  return datasets.get(key);
}

function option(value, label = value) {
  const element = node('option', label);
  element.value = value;
  return element;
}

function createExperiment(root) {
  const kind = root.dataset.experiment;
  const isRepair = kind === 'repair';
  const get = name => root.querySelector(`[data-ui="${name}"]`);
  const field = name => root.querySelector(`[data-field="${name}"]`);
  let reference = { repairs: 1, feedback: 'self' };
  let report;
  let reportData;
  let busy = false;

  get('results-host').append(document.getElementById('results-template').content.cloneNode(true));
  if (isRepair) get('reflection').after(document.getElementById('hypothesis-choice'));
  for (const label of root.querySelectorAll('[data-label]')) {
    const name = label.dataset.label;
    get(name).id = `${kind}-${name}`;
    label.htmlFor = get(name).id;
  }

  function settings() {
    const model = field('model').value;
    return { study: 'compute', model, control: isRepair ? 'one' : 'fresh',
      feedback: model === 'codellama' ? (isRepair ? field('feedback').value : reference.feedback) : 'self',
      budget: Number(field('budget').value), repairs: isRepair ? Number(field('repairs').value) : reference.repairs,
      repetitions: Number(field('repetitions').value), seed: Number(field('seed').value), split: field('split').value };
  }

  function markChanged() {
    if (!report) return;
    get('stale').hidden = false;
    if (isRepair) document.getElementById('hypothesis-choice').disabled = true;
  }

  function updateDiagram() {
    const config = settings();
    if (isRepair) {
      get('feedback-control').hidden = config.model !== 'codellama';
      get('feedback-note').hidden = config.feedback === 'self';
    }
    const policy = policiesFor(config)[isRepair ? 1 : 0];
    const chips = node('ol', undefined, 'sample-chips');
    let used = 0;
    while (used < policy.budget) {
      chips.append(node('li', used ? 'Fresh program' : 'First program', 'sample-chip'));
      used += 1;
      if (isRepair) {
        for (let index = 0; index < policy.repairs && used < policy.budget; index += 1) {
          chips.append(node('li', `Repair ${index + 1}`, 'sample-chip match'));
          used += 1;
        }
      }
    }
    const row = node('div', undefined, 'comparison-row');
    row.append(node('strong', isRepair ? 'With repair' : 'Without repair'), chips);
    get('diagram').replaceChildren(row);
  }

  function renderResults() {
    const [control, repair] = report.summaries;
    get('results').hidden = false;
    get('stale').hidden = true;
    get('split-label').textContent = `${report.settings.split === 'test' ? 'Test' : 'Reserved'} tasks · ${report.dataset.model}`;
    const rows = isRepair ? [
      { ...control, name: 'One program', className: 'baseline' },
      { ...repair, name: 'With repair', className: 'repair-reference' },
    ] : [
      { ...report.baseline, name: 'One program', className: 'baseline' },
      { ...repair, name: 'Repair reference', className: 'repair-reference' },
      { ...control, name: 'Without repair', className: 'fresh' },
    ];
    get('bars').replaceChildren(node('figcaption', 'Runs that found a passing program'));
    for (const result of rows) {
      const row = node('div', undefined, `result-bar-row ${result.className}`);
      const track = node('div', undefined, 'result-bar-track');
      const fill = node('div', undefined, 'result-bar-fill');
      fill.style.width = `${100 * (result.success ?? 0)}%`;
      track.append(fill);
      row.append(node('span', result.name), track, node('strong', percent(result.success)));
      get('bars').append(row);
    }
    get('finding').textContent = isRepair
      ? `${points(report.difference)} with repair versus one program.`
      : `${points(report.difference === null ? null : -report.difference)} without repair versus the repair reference.`;
    get('reflection').textContent = isRepair
      ? 'How does the gain change with the model and number of repair candidates?'
      : 'Does repair still offer an advantage when fresh generation gets the same program limit?';
    renderCost(rows);
    get('exclusions').hidden = report.excluded === 0;
    get('exclusions').textContent = `${report.excluded} pairs lack a required branch and are excluded from every score.`;
    refreshCases();
    if (isRepair) {
      document.getElementById('hypothesis-choice').hidden = false;
      document.getElementById('hypothesis-choice').disabled = false;
    }
  }

  function renderCost(rows) {
    const table = node('table');
    const head = node('thead');
    const headings = node('tr');
    for (const label of ['Workflow', 'Mean programs', 'Mean model calls', 'Mean output tokens', 'Initial failures recovered']) {
      const cell = node('th', label);
      cell.scope = 'col';
      headings.append(cell);
    }
    head.append(headings);
    const body = node('tbody');
    for (const result of rows) {
      const row = node('tr');
      for (const value of [result.name, decimal(result.meanPrograms), decimal(result.meanCalls),
        result.meanTokens === null ? '—' : Math.round(result.meanTokens).toLocaleString(),
        `${result.recovered} / ${result.initialFailures} (${percent(result.recovery)})`]) row.append(node('td', value));
      body.append(row);
    }
    table.append(head, body);
    get('cost-table').replaceChildren(table);
  }

  function matchingPairs() {
    return report.pairs.filter(pair => {
      if (!pair.included) return false;
      const [a, b] = pair.runs;
      switch (get('filter').value) {
        case 'different': return a.passed !== b.passed;
        case 'a-wins': return a.passed && !b.passed;
        case 'b-wins': return b.passed && !a.passed;
        case 'both-fail': return !a.passed && !b.passed;
        default: return true;
      }
    });
  }

  function refreshCases() {
    const previous = get('task').value;
    const ids = [...new Set(matchingPairs().map(pair => pair.taskId))];
    get('task').replaceChildren(...ids.map(id => option(id)));
    if (ids.includes(previous)) get('task').value = previous;
    get('case-empty').hidden = ids.length > 0;
    get('case-detail').hidden = ids.length === 0;
    refreshRepetitions();
  }

  function refreshRepetitions() {
    const previous = get('repetition').value;
    const repetitions = matchingPairs().filter(pair => pair.taskId === get('task').value).map(pair => pair.repetition);
    get('repetition').replaceChildren(...repetitions.map(value => option(value, `Repetition ${value + 1}`)));
    if (previous !== '' && repetitions.includes(Number(previous))) get('repetition').value = previous;
    renderCase();
  }

  function renderCase() {
    const task = reportData.tasks.find(task => task.id === get('task').value);
    if (!task) return;
    const pair = matchingPairs().find(pair => pair.taskId === task.id && pair.repetition === Number(get('repetition').value));
    if (!pair) return;
    get('task-prompt').textContent = task.prompt;
    get('traces').replaceChildren(...pair.runs.map((run, index) => {
      const panel = node('div', undefined, 'trace-panel');
      const policy = report.policies[index];
      panel.append(node('h3', policy.name), node('p', `${run.passed ? 'Pass' : 'No passing program'} · ${run.programs} ${run.programs === 1 ? 'program' : 'programs'} · ${run.tokens.toLocaleString()} output tokens`, run.passed ? 'passed' : 'failed'));
      run.trace.forEach((event, position) => {
        const parent = task.initials.find(record => record.index === event.parent);
        const record = event.kind === 'initial' ? parent : parent.repairs[policy.feedback].find(record => record.index === event.index);
        const detail = node('details', undefined, `candidate${event.passed ? ' selected' : ''}`);
        const label = event.kind === 'initial' ? position === 0 ? 'Shared first program' : 'Fresh program' : `Repair of initial sample ${event.parent + 1}`;
        detail.append(node('summary', `${position + 1}. ${label} · ${event.passed ? 'Pass' : 'Fail'}`));
        if (event.kind === 'repair') detail.append(node('strong', 'Recorded feedback and response'), node('pre', record.feedback));
        detail.append(node('strong', 'Program evaluated'), node('pre', record.code));
        if (event.kind === 'initial' && !record.passed) detail.append(node('strong', 'Test failure'), node('pre', parent.error));
        detail.append(node('small', `Source: ${task.id}, initial ${event.parent}, ${event.kind === 'repair' ? `repair ${event.index}` : 'initial output'}. Indices start at zero.`));
        panel.append(detail);
      });
      return panel;
    }));
  }

  async function run() {
    if (busy || root.hidden || !get('form').reportValidity()) return;
    const config = settings();
    busy = true;
    get('settings').disabled = get('run').disabled = true;
    if (isRepair) document.getElementById('hypothesis-choice').disabled = true;
    get('status').textContent = 'Comparing recorded programs…';
    try {
      const data = await loadData(config);
      if (isRepair) document.getElementById('example-task').textContent = data.tasks.find(task => task.split === 'test').prompt;
      await new Promise(resolve => setTimeout(resolve, 0));
      const next = evaluateRepair(data, config);
      reportData = data;
      report = next;
      renderResults();
      if (Object.entries(settings()).some(([key, value]) => config[key] !== value)) markChanged();
      get('status').textContent = 'Comparison complete.';
      get('status').classList.remove('error');
      get('results').scrollIntoView({ block: 'nearest' });
    } catch (error) {
      get('status').textContent = error.message;
      get('status').classList.add('error');
    } finally {
      busy = false;
      get('settings').disabled = get('run').disabled = false;
    }
  }

  function syncSettings(config, includeExperiment = false) {
    const before = settings();
    reference = { repairs: config.repairs, feedback: config.feedback };
    const keys = includeExperiment ? ['model', 'budget', 'split', 'repetitions', 'seed'] : ['model', 'budget'];
    for (const key of keys) field(key).value = config[key];
    updateDiagram();
    if (Object.entries(settings()).some(([key, value]) => before[key] !== value)) markChanged();
  }

  get('form').addEventListener('submit', event => { event.preventDefault(); run(); });
  get('settings').addEventListener('input', () => { updateDiagram(); markChanged(); });
  get('filter').addEventListener('change', refreshCases);
  get('task').addEventListener('change', refreshRepetitions);
  get('repetition').addEventListener('change', renderCase);
  get('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report)], { type: 'application/json' }));
    const link = node('a');
    link.href = url;
    link.download = `${kind}-${report.dataset.id}-${report.settings.split}-${report.settings.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  updateDiagram();
  get('settings').disabled = get('run').disabled = false;
  get('status').textContent = 'Ready: choose settings and run.';
  return { settings, syncSettings };
}

const repair = createExperiment(document.getElementById('repair-panel'));
const ablate = createExperiment(document.getElementById('ablate-panel'));
let ablationUnlocked = false;
const repairControls = document.querySelector('#repair-panel [data-ui=settings]');
repairControls.addEventListener('input', () => ablate.syncSettings(repair.settings()));
ablate.syncSettings(repair.settings());
for (const button of document.querySelectorAll('[data-hypothesis]')) {
  button.addEventListener('click', () => {
    if (document.getElementById('hypothesis-choice').disabled) return;
    for (const choice of document.querySelectorAll('[data-hypothesis]')) choice.setAttribute('aria-pressed', String(choice === button));
    if (!ablationUnlocked) {
      ablate.syncSettings(repair.settings(), true);
      ablationUnlocked = true;
    }
    document.getElementById('ablate-panel').hidden = false;
    document.getElementById('ablate-panel').scrollIntoView({ block: 'start' });
    document.getElementById('ablate-title').focus({ preventScroll: true });
  });
}

try {
  const data = await loadData(repair.settings());
  document.getElementById('example-task').textContent = data.tasks.find(task => task.split === 'test').prompt;
} catch {
  document.getElementById('example-task').textContent = 'The example could not load. Run an experiment to retry loading the dataset.';
}
