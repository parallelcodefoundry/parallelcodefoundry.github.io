const frame = document.getElementById("preview");
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(predicate, message) {
  const deadline = performance.now() + 8000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function check(name, action) {
  const item = document.createElement("li");
  try {
    await action();
    item.textContent = `PASS · ${name}`;
    item.className = "pass";
    passed += 1;
  } catch (error) {
    item.textContent = `FAIL · ${name}: ${error.message}`;
    item.className = "fail";
    failed += 1;
  }
  document.getElementById("checks").append(item);
}

async function load(path) {
  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = reject;
    frame.src = path;
  });
}

await check("Landing page exposes all five demos in order", async () => {
  await load("../../../index.html");
  const doc = frame.contentDocument;
  const links = [...doc.querySelectorAll(".demo-card a")];
  assert(links.length === 5, "Expected five demo links.");
  assert(links[0].getAttribute("href") === "demos/sampling.html", "Token sampling must remain first.");
  assert(!doc.querySelector("#demos [disabled]"), "A demo is still disabled.");
  for (const link of links) {
    assert((await fetch(link.href)).ok, `Broken link: ${link.href}`);
  }
});

await load('../../sampling-workbench.html');
const samplingWindow = frame.contentWindow;
const samplingDoc = frame.contentDocument;
const sampleGet = id => samplingDoc.getElementById(id);
await check('sampling: real data loads and the diagram precedes the controls', async () => {
  await waitFor(() => !sampleGet('run').disabled, 'Dataset did not load.');
  assert(samplingDoc.querySelector('.workflow').textContent.includes('What is 3 × 4?'), 'Missing example flow.');
  assert(!sampleGet('experiment-settings').open, 'Experiment settings should start collapsed.');
  assert(sampleGet('experiment-settings').contains(sampleGet('cost-rate')), 'Cost should be inside experiment settings.');
  assert(sampleGet('strategy-diagram').querySelector('.chosen-answer').textContent === '12', 'Most-frequent illustration chose the wrong answer.');
  assert(sampleGet('results').hidden, 'Results should wait for a participant action.');
  assert(sampleGet('example-question').textContent.length > 30, 'Missing real question.');
});
await check('sampling: participant runs a real paired comparison', async () => {
  sampleGet('run').click();
  await waitFor(() => !sampleGet('run').disabled, 'Comparison did not finish.');
  assert(!sampleGet('results').hidden, sampleGet('status').textContent);
  assert(samplingDoc.querySelectorAll('.metric-value').length === 3, 'Missing results.');
  assert(sampleGet('answers').children.length === 4, 'Expected four actual responses.');
  assert(sampleGet('task').options.length === 84, 'Wrong test set.');
  assert(sampleGet('metrics').textContent.includes('sample size of 4'), 'Missing sample-size upper bound.');
  assert(sampleGet('answers').textContent.includes('####'), 'Missing original model response.');
});
await check('sampling: single random draw reproduces the control', async () => {
  sampleGet('selection').value = 'random';
  sampleGet('budget').value = '1';
  sampleGet('selection').dispatchEvent(new samplingWindow.Event('input', {bubbles:true}));
  sampleGet('run').click();
  await waitFor(() => !sampleGet('run').disabled, 'Comparison did not finish.');
  const values = samplingDoc.querySelectorAll('.metric-value');
  assert(values[0].textContent === values[1].textContent, 'First-answer baseline mismatch.');
});
await check('sampling: test/reserved toggle reruns the same method without locking it', async () => {
  const reserved = samplingDoc.querySelector('input[name=split][value=evaluation]');
  const test = samplingDoc.querySelector('input[name=split][value=development]');
  reserved.click();
  await waitFor(() => sampleGet('split-label').textContent.includes('Reserved'), 'Reserved run failed.');
  assert(!sampleGet('settings').disabled, 'Settings should remain editable.');
  assert(sampleGet('task').options.length === 43, 'Wrong reserved set.');
  assert(sampleGet('selection').value === 'random', 'Toggle changed the method.');
  test.click();
  await waitFor(() => sampleGet('split-label').textContent === 'Test questions', 'Could not return to test questions.');
  assert(sampleGet('task').options.length === 84, 'Wrong test set after toggling back.');
});
await check('sampling: agreement, ideal verification, repetitions, and cost are explicit', async () => {
  sampleGet('selection').value = 'agreement';
  sampleGet('agreement').value = '2';
  sampleGet('fallback').value = 'abstain';
  sampleGet('selection').dispatchEvent(new samplingWindow.Event('input', {bubbles:true}));
  assert(!sampleGet('agreement-controls').hidden, 'Missing agreement controls.');
  sampleGet('run').click();
  await waitFor(() => !sampleGet('run').disabled, 'Agreement run did not finish.');
  assert(sampleGet('case-summary').textContent.includes('no answer'), 'Expected abstention at budget 1.');
  assert(sampleGet('strategy-diagram').textContent.includes('No answer'), 'Illustration should show the fallback.');
  sampleGet('selection').value = 'verified';
  sampleGet('budget').value = '4';
  sampleGet('trials').value = '2';
  sampleGet('selection').dispatchEvent(new samplingWindow.Event('input', {bubbles:true}));
  assert(!sampleGet('verifier-note').hidden, 'Missing verifier limitation.');
  sampleGet('run').click();
  await waitFor(() => !sampleGet('run').disabled, 'Verifier run did not finish.');
  assert(!sampleGet('diagnostic-result').hidden, 'Unlabeled diagnostic result.');
  assert(sampleGet('trial').options.length === 2, 'Wrong number of experiment repetitions.');
  assert(sampleGet('strategy-diagram').querySelectorAll('.unused').length === 2, 'Ideal-verifier illustration should stop after two samples.');
  assert(sampleGet('cost-table').textContent.includes('USD / 1,000 outcomes'), 'Missing normalized cost.');
});
await check('sampling: result export creates a JSON download', async () => {
  let blob;
  const original = samplingWindow.URL.createObjectURL.bind(samplingWindow.URL);
  samplingWindow.URL.createObjectURL = value => { blob = value; return original(value); };
  const click = samplingWindow.HTMLAnchorElement.prototype.click;
  samplingWindow.HTMLAnchorElement.prototype.click = function () {};
  sampleGet('export').click();
  samplingWindow.HTMLAnchorElement.prototype.click = click;
  assert(blob.size > 0 && blob.type === 'application/json', 'Missing JSON export.');
});
await check('sampling: 375px layout fits', async () => {
  frame.style.width = '375px';
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(samplingDoc.documentElement.scrollWidth <= frame.clientWidth + 2, 'Mobile overflow.');
  frame.style.width = '1200px';
});

await load('../../ablation-workbench.html');
const repairWindow = frame.contentWindow;
const repairDoc = frame.contentDocument;
const panel = kind => repairDoc.getElementById(`${kind}-panel`);
const ui = (kind, name) => panel(kind).querySelector(`[data-ui="${name}"]`);
const field = (kind, name) => panel(kind).querySelector(`[data-field="${name}"]`);
function change(kind, name, value) {
  field(kind, name).value = value;
  field(kind, name).dispatchEvent(new repairWindow.Event('input', { bubbles: true }));
}
async function runExperiment(kind) {
  ui(kind, 'run').click();
  await waitFor(() => !ui(kind, 'run').disabled && !ui(kind, 'results').hidden && ui(kind, 'stale').hidden, `${kind} did not finish.`);
}
async function exportReport(kind) {
  let blob;
  const create = repairWindow.URL.createObjectURL;
  const click = repairWindow.HTMLAnchorElement.prototype.click;
  repairWindow.URL.createObjectURL = value => { blob = value; return create.call(repairWindow.URL, value); };
  repairWindow.HTMLAnchorElement.prototype.click = function () {};
  ui(kind, 'export').click();
  repairWindow.HTMLAnchorElement.prototype.click = click;
  repairWindow.URL.createObjectURL = create;
  return JSON.parse(await blob.text());
}
await check('ablation: the first run does not unlock section 2', async () => {
  assert(panel('ablate').hidden, 'Section 2 must start locked.');
  assert(repairDoc.getElementById('hypothesis-choice').hidden, 'Wait for results before asking for a conclusion.');
  await runExperiment('repair');
  assert(panel('ablate').hidden, 'Running repair must not unlock the ablation.');
  assert(!repairDoc.getElementById('hypothesis-choice').hidden, 'Missing hypothesis choice.');
  assert(!ui('repair','cost-details').open, 'Costs should start collapsed.');
  assert(repairDoc.querySelector('#data-notes').querySelectorAll('p').length === 1, 'Dataset note should be one paragraph.');
  assert(!repairDoc.querySelector('#data-notes a[href$=".md"]'), 'No internal markdown links.');
});
await check('ablation: participants can rerun repair before either hypothesis choice unlocks section 2', async () => {
  change('repair','model','gpt35');
  assert(repairDoc.getElementById('hypothesis-choice').disabled, 'Stale results must not solicit an assessment.');
  await runExperiment('repair');
  change('repair','model','codellama');
  await runExperiment('repair');
  assert(panel('ablate').hidden, 'Repeated repair runs must not unlock section 2.');
  repairDoc.querySelector('[data-hypothesis="not-supported"]').click();
  assert(!panel('ablate').hidden, 'Not supported must also unlock section 2.');
  repairDoc.querySelector('[data-hypothesis="supported"]').click();
  assert(repairDoc.querySelector('[data-hypothesis="supported"]').getAttribute('aria-pressed') === 'true', 'Choice should be visible.');
  assert(field('ablate','model').disabled && field('ablate','budget').disabled, 'Linked selects must remain disabled.');
});
await check('ablation: model and limit sync immediately, and matching runs preserve the repair reference', async () => {
  change('repair','budget','4');
  change('repair','repairs','3');
  assert(field('ablate','budget').value === '4', 'Limit did not update before running.');
  change('repair','model','gpt4');
  assert(field('ablate','model').value === 'gpt4', 'Model did not update.');
  await runExperiment('repair');
  const first = await exportReport('repair');
  await runExperiment('ablate');
  const second = await exportReport('ablate');
  assert(JSON.stringify(first.summaries[1]) === JSON.stringify(second.summaries[1]), 'Matched repair reference changed.');
  assert(second.pairs.every(pair => pair.runs[0].trace.every(event => event.kind === 'initial')), 'Ablated arm used repairs.');
  assert(field('ablate','model').disabled && field('ablate','budget').disabled, 'Run must not re-enable linked selects.');
});
await check('ablation: linked edits stale old results and keep the section unlocked', async () => {
  change('repair','budget','8');
  assert(!ui('ablate','stale').hidden, 'Old ablation result must be stale.');
  assert(!panel('ablate').hidden, 'Do not require another assessment after unlocking.');
  await runExperiment('ablate');
  assert((await exportReport('ablate')).policies.every(policy => policy.budget === 8), 'Wrong linked budget.');
  assert(!ui('repair','stale').hidden, 'Ablation run must not update repair results.');
});
await check('ablation: both external feedback settings synchronize to the reference', async () => {
  change('repair','model','codellama');
  for (const feedback of ['gpt35','gpt4']) {
    change('repair','feedback',feedback);
    await runExperiment('repair');
    await runExperiment('ablate');
    const result = await exportReport('ablate');
    assert(result.dataset.id === 'self-repair-feedback' && result.settings.feedback === feedback, 'Feedback reference did not sync.');
    assert(result.dataset.source.archiveSha256.length === 64, 'Missing pinned source in export.');
  }
});
await check('ablation: experiment settings remain independent and invalid inputs retain results', async () => {
  change('ablate','split','reserved');
  change('ablate','repetitions','2');
  await runExperiment('ablate');
  assert(ui('ablate','task').options.length === 55 && ui('repair','task').options.length === 109, 'Task sets should remain independent.');
  const result = await exportReport('ablate');
  assert(result.requested === 110, 'Wrong repetition count.');
  change('ablate','seed','-1');
  ui('ablate','run').click();
  assert(!field('ablate','seed').checkValidity() && !ui('ablate','stale').hidden, 'Invalid input should retain stale results.');
  change('ablate','seed','2026');
});
await check('ablation: removed copy, captions and comparison prose; mobile controls remain labeled', async () => {
  assert(!repairDoc.getElementById('try-ablation') && !ui('ablate','copy'), 'Copy buttons remain.');
  for (const text of ['Path if every program fails', 'Repetitions change the number', 'Output tokens are reconstructed', 'Comparison details', 'Repair reference: up to']) {
    assert(!repairDoc.body.textContent.includes(text), `Text not removed: ${text}`);
  }
  frame.style.width = '375px';
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(repairDoc.documentElement.scrollWidth <= frame.clientWidth + 2, 'Mobile overflow.');
  for (const control of repairDoc.querySelectorAll('input, select')) assert(control.labels.length > 0, `Missing label: ${control.id}`);
  frame.style.width = '1200px';
});

document.getElementById('status').textContent = `${passed} passed; ${failed} failed.`;
document.body.dataset.status = failed ? 'failed' : 'passed';
