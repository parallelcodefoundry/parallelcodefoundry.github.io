import { seedFor, shuffled } from './engine.mjs';

export const VERSION = '1.1.0';

export function validateRepairData(data) {
  if (!data.id || !data.version || !Array.isArray(data.tasks) || !data.tasks.length) throw new Error('Invalid repair dataset.');
  const ids = new Set();
  for (const task of data.tasks) {
    if (ids.has(task.id) || !['test', 'reserved'].includes(task.split) || typeof task.prompt !== 'string') throw new Error('Invalid task.');
    ids.add(task.id);
    const indices = new Set();
    for (const parent of task.initials) {
      if (indices.has(parent.index)) throw new Error('Duplicate initial sample.');
      indices.add(parent.index);
      for (const record of [parent, ...Object.values(parent.repairs).flat()]) {
        if (typeof record.passed !== 'boolean' || typeof record.code !== 'string' || !Number.isInteger(record.tokens) || record.tokens < 0) throw new Error('Invalid recorded output.');
      }
    }
  }
  return data;
}

export function policiesFor(settings) {
  const common = { budget: settings.budget, repairs: settings.repairs };
  if (settings.study === 'feedback') return [
    { ...common, name: 'GPT-3.5 feedback', action: 'repair', feedback: 'gpt35' },
    { ...common, name: 'GPT-4 feedback', action: 'repair', feedback: 'gpt4' },
  ];
  const feedback = settings.feedback ?? 'self';
  const repairName = feedback === 'self' ? 'Self-repair' : `Repair · ${feedback === 'gpt35' ? 'GPT-3.5' : 'GPT-4'} feedback`;
  return [
    { ...common, name: settings.control === 'one' ? 'One program' : 'Fresh attempts', action: 'fresh', budget: settings.control === 'one' ? 1 : settings.budget },
    { ...common, name: repairName, action: 'repair', feedback },
  ];
}

// The recorded test outcome is the operational check in this study. It is not
// a separate hidden label. Repairs are siblings of their original parent.
export function runRepairPolicy(task, policy, seed) {
  const order = shuffled(task.initials, seed);
  const trace = [];
  let tokens = 0;
  let calls = 0;
  let passed = false;
  let supported = true;
  function take(record, parent, kind) {
    trace.push({ kind, parent: parent.index, index: record.index, passed: record.passed, tokens: record.tokens });
    tokens += record.tokens;
    calls += kind === 'repair' && policy.feedback !== 'self' ? 2 : 1;
    passed = record.passed;
  }
  for (const parent of order) {
    if (trace.length >= policy.budget || passed) break;
    take(parent, parent, 'initial');
    if (passed || policy.action !== 'repair') continue;
    const branches = shuffled(parent.repairs[policy.feedback] ?? [], seedFor(seed, parent.index, 'repairs'));
    const count = Math.min(policy.repairs, policy.budget - trace.length);
    for (let index = 0; index < count; index += 1) {
      if (!branches[index]) { supported = false; break; }
      take(branches[index], parent, 'repair');
      if (passed) break;
    }
    if (!supported) break;
  }
  if (!passed && trace.length < policy.budget) supported = false;
  return { supported, passed, initialPassed: order[0].passed, programs: trace.length, calls, tokens, trace };
}

function summarize(runs) {
  const count = runs.length;
  const total = key => runs.reduce((sum, run) => sum + Number(run[key]), 0);
  const successes = total('passed');
  const failures = runs.filter(run => !run.initialPassed);
  const recovered = failures.filter(run => run.passed).length;
  return { count, successes, success: count ? successes / count : null,
    recovered, initialFailures: failures.length, recovery: failures.length ? recovered / failures.length : null,
    meanPrograms: count ? total('programs') / count : null,
    meanCalls: count ? total('calls') / count : null,
    meanTokens: count ? total('tokens') / count : null };
}

export function evaluateRepair(data, settings) {
  const feedback = settings.feedback ?? 'self';
  if (!['self', 'gpt35', 'gpt4'].includes(feedback)) throw new Error('Invalid feedback source.');
  const needsFeedbackData = settings.study === 'feedback' || feedback !== 'self';
  if (!['compute', 'feedback'].includes(settings.study) || needsFeedbackData !== data.feedbackStudy) throw new Error('Choose a dataset for this study.');
  if (feedback !== 'self' && settings.model !== 'codellama') throw new Error('External feedback is recorded only for Code Llama.');
  if (!['test', 'reserved'].includes(settings.split) || !['one', 'fresh'].includes(settings.control)) throw new Error('Invalid comparison.');
  for (const [key, low, high] of [['budget', 1, 8], ['repairs', 1, 5], ['repetitions', 1, 20], ['seed', 0, 4294967295]]) {
    if (!Number.isInteger(settings[key]) || settings[key] < low || settings[key] > high) throw new Error(`Invalid ${key}. Use an integer from ${low} to ${high}.`);
  }
  const policies = policiesFor(settings);
  const tasks = data.tasks.filter(task => task.split === settings.split);
  if (!tasks.length) throw new Error('No tasks in this split.');
  const pairs = [];
  for (let repetition = 0; repetition < settings.repetitions; repetition += 1) {
    for (const task of tasks) {
      const seed = seedFor(settings.seed, task.id, repetition);
      const baseline = runRepairPolicy(task, { action: 'fresh', budget: 1 }, seed);
      const runs = policies.map(policy => runRepairPolicy(task, policy, seed));
      pairs.push({ taskId: task.id, repetition, seed, baseline, runs, included: runs.every(run => run.supported) });
    }
  }
  const included = pairs.filter(pair => pair.included);
  const summaries = policies.map((policy, index) => ({ name: policy.name, ...summarize(included.map(pair => pair.runs[index])) }));
  return { version: VERSION, dataset: { id: data.id, version: data.version, model: data.model, source: data.source },
    settings: structuredClone(settings), policies, baseline: summarize(included.map(pair => pair.baseline)), summaries,
    difference: included.length ? summaries[1].success - summaries[0].success : null,
    requested: pairs.length, included: included.length, excluded: pairs.length - included.length, pairs,
    method: 'Sequential search without replacement within each initial/repair pool; stop at the first recorded test pass. Reuse finite pools across repetitions. Repairs always condition on their own initial program. Both arms and the one-program reference use the same included pairs. Token counts are the source’s reconstructed output counts, not billed input/output usage. No separate hidden-test score.' };
}
