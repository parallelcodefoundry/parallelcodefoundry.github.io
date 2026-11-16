import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateRepair, runRepairPolicy, validateRepairData } from '../ablation-engine.mjs';
import { shuffled } from '../engine.mjs';

const load = key => validateRepairData(JSON.parse(fs.readFileSync(new URL(`../self-repair-${key}.json`, import.meta.url))));
const config = { study: 'compute', model: 'codellama', control: 'fresh', budget: 2, repairs: 1, repetitions: 2, seed: 2026, split: 'test' };
const data = load('codellama');
const failingTask = { id: 'fixture', initials: Array.from({ length: 8 }, (_, index) => ({
  index, code: 'initial', passed: false, error: 'failed', tokens: 10,
  repairs: { self: Array.from({ length: 5 }, (_, index) => ({ index, code: 'repair', feedback: 'feedback', passed: false, tokens: 20 })) },
})) };

test('real datasets preserve all tasks, bounded pools, outcomes and ancestry', () => {
  for (const key of ['codellama', 'gpt35', 'gpt4', 'feedback']) {
    const dataset = key === 'codellama' ? data : load(key);
    assert.equal(dataset.tasks.length, 164);
    assert.equal(dataset.tasks.filter(task => task.split === 'test').length, 109);
    for (const task of dataset.tasks) {
      assert.equal(task.initials.length, 20);
      for (const initial of task.initials) for (const repairs of Object.values(initial.repairs)) {
        assert.equal(repairs.length, initial.passed ? 0 : 5);
        assert.deepEqual(repairs.map(record => record.index), initial.passed ? [] : [0, 1, 2, 3, 4]);
      }
    }
  }
});

test('program limits include repairs and retries; sibling repairs keep their parent', () => {
  const result = runRepairPolicy(failingTask, { action: 'repair', feedback: 'self', budget: 8, repairs: 2 }, 42);
  assert.equal(result.programs, 8);
  assert.equal(result.calls, 8);
  assert.equal(result.tokens, 130);
  assert.deepEqual(result.trace.map(event => event.kind), ['initial', 'repair', 'repair', 'initial', 'repair', 'repair', 'initial', 'repair']);
  for (const index of [1, 2, 4, 5, 7]) assert.equal(result.trace[index].parent, result.trace[index - (index % 3)].parent);
});

test('recorded pass stops immediately; unused records cannot influence the result', () => {
  const task = structuredClone(failingTask);
  const first = shuffled(task.initials, 42)[0];
  first.passed = true;
  const run = runRepairPolicy(task, { action: 'repair', feedback: 'self', budget: 8, repairs: 5 }, 42);
  assert.equal(run.programs, 1);
  assert.equal(run.passed, true);
  assert.equal(run.tokens, 10);
});

test('missing repairs do not turn into invented fresh attempts', () => {
  const task = structuredClone(failingTask);
  for (const initial of task.initials) initial.repairs.self = [];
  const dataset = { ...data, tasks: [{ ...task, split: 'test' }] };
  const result = evaluateRepair(dataset, config);
  assert.equal(result.excluded, config.repetitions);
  assert.equal(result.baseline.success, null);
  assert.equal(result.summaries[0].count, 0);
});

test('same settings reproduce paired records; budget one gives identical results', () => {
  const result = evaluateRepair(data, { ...config, budget: 1 });
  assert.equal(result.difference, 0);
  assert.deepEqual(evaluateRepair(data, { ...config, budget: 1 }), result);
  for (const pair of result.pairs) assert.deepEqual(pair.runs[0].trace, pair.runs[1].trace);
});

test('feedback study pairs initial programs and counts separate feedback calls', () => {
  const result = evaluateRepair(load('feedback'), { ...config, study: 'feedback', budget: 8, repairs: 3 });
  assert.equal(result.excluded, 0);
  for (const pair of result.pairs) {
    assert.deepEqual(pair.runs[0].trace[0], pair.runs[1].trace[0]);
    for (const run of pair.runs) {
      assert.equal(run.calls, run.programs + run.trace.filter(event => event.kind === 'repair').length);
      assert(run.programs <= 8);
    }
  }
});

test('all supported models and split choices produce complete real comparisons', () => {
  for (const model of ['codellama', 'gpt35', 'gpt4']) {
    const dataset = model === 'codellama' ? data : load(model);
    for (const split of ['test', 'reserved']) {
      const result = evaluateRepair(dataset, { ...config, model, split, budget: 8, repairs: 5 });
      assert.equal(result.excluded, 0);
      assert.equal(result.requested, (split === 'test' ? 109 : 55) * config.repetitions);
      for (const pair of result.pairs) {
        assert.equal(pair.runs[0].initialPassed, pair.runs[1].initialPassed);
        if (pair.baseline.passed) assert(pair.runs.every(run => run.passed));
      }
    }
  }
});

test('invalid or incompatible controls are rejected', () => {
  for (const overrides of [{ seed: -1 }, { budget: 9 }, { repairs: 0 }, { repetitions: 21 }, { study: 'feedback' }, { split: 'other' }]) {
    assert.throws(() => evaluateRepair(data, { ...config, ...overrides }));
  }
});

test('serialized reports replay from their pinned dataset and settings', () => {
  const report = JSON.parse(JSON.stringify(evaluateRepair(data, config)));
  assert.deepEqual(evaluateRepair(data, report.settings), report);
});

test('individual feedback choices compare against the same starting pool and preserve a copied repair reference', () => {
  const dataset = load('feedback');
  for (const feedback of ['gpt35', 'gpt4']) {
    const first = evaluateRepair(dataset, { ...config, control: 'one', feedback, budget: 4, repairs: 3 });
    const second = evaluateRepair(dataset, { ...first.settings, control: 'fresh' });
    assert.deepEqual(first.summaries[1], second.summaries[1]);
    for (let index = 0; index < first.pairs.length; index++) {
      assert.deepEqual(first.pairs[index].runs[1], second.pairs[index].runs[1]);
      assert(second.pairs[index].runs[0].trace.every(event => event.kind === 'initial'));
    }
  }
});

test('external feedback cannot silently use a different model or initial pool', () => {
  assert.throws(() => evaluateRepair(data, { ...config, feedback: 'gpt4' }));
  assert.throws(() => evaluateRepair(load('feedback'), { ...config, feedback: 'gpt4', model: 'gpt4' }));
  assert.throws(() => evaluateRepair(data, { ...config, feedback: 'unknown' }));
});
