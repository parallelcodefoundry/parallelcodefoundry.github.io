# Synthetic fixture provenance

The sampling lesson now uses [Monkey Business records](MONKEY_BUSINESS_PROVENANCE.md). This file documents the retained test fixture and the ablation demo only.

## Current data: synthetic practice fixture

Prepared for this website change on November 13, 2026. These are authored examples, **not model generations, published measurements, or a new model experiment**. Real records are an explicit placeholder, as permitted in the implementation request.

| Property | Value |
| --- | --- |
| Dataset IDs | `sc26-sampling-practice`, `sc26-ablation-practice` |
| Version | `practice-1` |
| Source | `build_practice_data.py`, in this directory |
| Transform | `python3 build_practice_data.py` |
| Output | `practice-data.json` |
| Final evaluator | `authored-correctness-v1`: authored correctness labels |
| Public checker | `authored-public-tests-v1` for ablation; none for sampling |
| Model/version/decoding | Unavailable: no model was used |
| Token counts, latency, money | `null` / unavailable; never estimated from text length |
| Upstream material | None vendored; prompts, short code examples, and feedback are authored here |

Run `node audit-data.mjs` for the exact file SHA-256, byte count, validation result, split counts, missing branches, label diversity, and missing measurements. The source and transformed output are checked in together. Regeneration is deterministic. These files follow the repository's licensing terms; this change does not assign a new license or assert rights to an external corpus.

The bundled JSON is 82,231 bytes. SHA-256: `d8a4a15b21d3cd0e152d8429135a6ccd7ddf1f20c778359975d6e01e03eb5e27`.

## Fixture audit

- **Sampling:** 12 tasks, six development and six reserved, eight initial records per task (96 total). Questions cover indexing, storage, reductions, sparse arrays, and performance arithmetic. Pools include correct, incorrect, duplicate, and unparseable answers.
- **Ablation:** eight tasks, five development and three reserved. Each has four initial records (32 total). There are 29 repair records; three parents have no repair. Initial successes remain in the data. Cases include recovery, regression, public-pass/final-fail, and missing continuations.
- **Ancestry:** initial records have unique draw IDs. Repairs have their own sample IDs, retain their parent's draw ID, and include the original task ID, parent ID, and exact authored feedback. The parent response and task text are recoverable from those IDs.
- **Information boundary:** numeric answers are extracted from output text. Ablation policies may invoke authored public checks. Final labels are consulted only after selection. No candidate code is executed.
- **Costs:** calls count consumed records. Checker calls count distinct checks actually invoked. These are workflow counts on a synthetic fixture, not measured inference costs. Every token count is missing.
- **Splits:** explicit, stable task splits. Reserved tasks are shipped to the browser and are not secret. They support a practice protocol, not a claim about held-out model generalization.
- **Replay:** initial records are shuffled without replacement per task/run. Both policies share the same stream and initial sample. Repeated trials reuse the finite pool and are not additional model generations.

Labels and feedback were authored for simple examples and engine edge cases. Their frequencies were not sampled from a model. Do not infer that any strategy is better on real tasks from these scores.

## Field mapping

| Source concept | JSON field |
| --- | --- |
| Dataset identity and evidence type | `id`, `version`, `kind` |
| Workload and stable split | `tasks[].id`, `prompt`, `family`, `split` |
| Distinct output and initial draw | `records[].id`, `taskId`, `runId` |
| Original or child output | `kind`, `parentId`, `context` |
| Displayed output | `response` |
| Permitted feedback | `publicCheck.passed`, `publicCheck.feedback` |
| Scoring label | `correct` (true, false, or null) |
| Missing token measurement | `tokens: null` |
| Evidence type per record | `provenance: "synthetic"` |

Unsupported continuation requests are excluded from both comparison arms and retained in exports. They are not scored as failures. Unknown final labels and unknown coverage similarly exclude a pair; abstention is separately counted as no success.

## Empirical sources to review

The specification proposes the following sources. **Sampling now uses Monkey Business; see its separate provenance above. The other proposed sources have not been imported or license-audited.** Their model settings, release completeness, rights, source hashes, and valid comparison subsets remain open items.

- Brown et al., *Large Language Monkeys*: <https://arxiv.org/abs/2407.21787>; proposed sample source: [Monkey Business](https://huggingface.co/datasets/ScalingIntelligence/monkey_business).
- Olausson et al., *Is Self-Repair a Silver Bullet for Code Generation?*: <https://arxiv.org/abs/2306.09896>; proposed source: [self-repair repository](https://github.com/theoxo/self-repair).
- Huang et al., *Large Language Models Cannot Self-Correct Reasoning Yet*: <https://arxiv.org/abs/2310.01798>; conceptual reference proposed by the specification.

Before switching the tutorial to empirical data, record the acquisition date and pinned ref, source hashes, separate licenses for prompts/code/outputs, extraction commands, field mapping, exclusions, evaluator and operational-check meanings, and branch availability. Verify that final labels were not repurposed as public checks. A feedback-versus-no-feedback claim needs an actual matched control; no such arm is bundled now.
