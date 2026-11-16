// An API-equivalent estimate, not measured token usage or local GPU cost.
export function estimateGenerationCost(dataset, report, ratePerMillion = 0.20) {
  if (!Number.isFinite(ratePerMillion) || ratePerMillion < 0) throw new Error('Invalid cost rate.');
  const tokens = text => Math.ceil(Array.from(text).length / 4);
  const tasks = new Map(dataset.tasks.map(task => [task.id, task]));
  const pairs = report.pairs.filter(pair => pair.eligible);
  const arms = [0, 1].map(index => {
    let inputTokens = 0;
    let outputTokens = 0;
    let calls = 0;
    let checks = 0;
    for (const pair of pairs) {
      const task = tasks.get(pair.taskId);
      const run = pair.runs[index];
      // Charge the complete few-shot prompt for every generated response.
      inputTokens += tokens(task.generationPrompt ?? task.prompt) * run.consumed.length;
      outputTokens += run.consumed.reduce((sum, record) => sum + tokens(record.response), 0);
      calls += run.cost.calls;
      checks += run.cost.checkerCalls;
    }
    const totalUsd = (inputTokens + outputTokens) * ratePerMillion / 1e6;
    return {
      runs: pairs.length, inputTokens, outputTokens, calls, checks, totalUsd,
      meanCalls: pairs.length ? calls / pairs.length : null,
      meanChecks: pairs.length ? checks / pairs.length : null,
      usdPerThousandRuns: pairs.length ? totalUsd / pairs.length * 1000 : null,
    };
  });
  return {
    kind: 'heuristic-api-equivalent', ratePerMillion, arms,
    assumptions: 'Approximate tokens as Unicode characters / 4, rounded up per prompt or response. Charge the full prompt on every call; no caching or batching discount. Apply the same rate to input and output. Verification cost is excluded. These are hypothetical generation costs, not actual spending or local GPU costs.',
    rateReference: 'Illustrative $0.20/M rate, consistent with Llama-3-8B / Together AI in the pricing table of https://aclanthology.org/2025.gem-1.72.pdf; not a current quote.',
  };
}
