# Self-Repair tutorial data

Source: Olausson, Inala, Wang, Gao, and Solar-Lezama, *Is Self-Repair a Silver Bullet for Code Generation?*, ICLR 2024. [Paper, version 5](https://arxiv.org/html/2306.09896v5) · [repository](https://github.com/theoxo/self-repair).

Downloaded November 15, 2026. Repository revision: `fcda7a193a732d89fc1f610074c719682228fbc4`. Archive: `paper/data/humaneval/humaneval-data.tar.bz2`, 28,384,964 bytes. SHA-256: `3c06d3c11166d3f5e08341721004de6bb3201bfb0c8e53b2154c49609f669e68` (verified against the Git LFS pointer). The archive contains model records, not human-study records.

## Browser subsets

All 164 HumanEval tasks are retained. For every task, take the first 20 initial programs in source order and the first five repairs of each failed initial program. No selection uses correctness. Passing initial programs have no repair branch. Every retained failed parent has five candidates; the importer asserts this rather than silently dropping failures.

| Browser file | Source JSONL | Bytes |
| --- | --- | ---: |
| `self-repair-codellama.json` | `codellama-humaneval-results-tokens.jsonl` | 12,004,040 |
| `self-repair-gpt35.json` | `chatgpt-humaneval-results-tokens.jsonl` | 6,904,265 |
| `self-repair-gpt4.json` | `gpt4-humaneval-results-tokens.jsonl` | 5,488,335 |
| `self-repair-feedback.json` | `codellama+chatgpt-tokens.jsonl`, `codellama+gpt4-tokens.jsonl` | 12,877,504 |

The model snapshots are CodeLlama-13b-instruct, gpt-3.5-turbo-0301, and gpt-4-0314. The paper specifies temperature 0.8. Only the selected dataset is fetched, then cached in page memory.

The tutorial assigns numeric task IDs divisible by three to **reserved** (55), and the remainder to **test** (109). This is an authored tutorial partition of HumanEval, not the paper's train/test split or a new held-out benchmark.

## Preserved fields and matching

Initial records retain processed `executed_completion`, `binary`, `fault`, and `tokens_generated`. Repairs retain `repaired_program`, `explanation`, `binary`, and `tokens_generated`. Fields are renamed in the compact schema. The task ID, initial index, repair index, source filenames, revision, and archive checksum identify each source record. Duplicate outputs remain separate draws. Original unprocessed completions and repeated repair prompts are omitted from browser files but remain in the pinned archive.

For the feedback study, the importer checks equality of original and executed code, test outcome, error, and token count at every retained task/initial index across both feedback files. GPT-3.5 and GPT-4 feedback therefore use the same starting programs. **The self-feedback file does not consistently share these starting records**, so it is not offered as a third arm in this matched feedback comparison.

Task prompts come from [OpenAI HumanEval](https://github.com/openai/human-eval/blob/master/data/HumanEval.jsonl.gz). Only `prompt` is retained; canonical solutions and executable test functions are omitted. The compressed prompt artifact's SHA-256 is `b796127e635a67f93fb35c04f4cb03cf06f38c8072ee7cee8833d7bee06979ef`, verified by the importer and stored in every browser file. HumanEval's MIT notice is preserved in [HUMANEVAL-LICENSE.txt](HUMANEVAL-LICENSE.txt). The self-repair repository does not include a separate license file at the pinned revision; attribution is retained here without assigning a new license to its records.

## Experiment semantics

This demo implements sequential search over recorded programs, not a numerical reproduction of the paper's main batched estimator:

1. Seed a shuffle of each task's initial pool. Both workflows share it.
2. Generate and check an initial program. Stop on a recorded pass.
3. Fresh sampling proceeds to the next initial program. Repair tries up to the configured number of sibling repairs of that failed initial, within the remaining program allowance. These are not iterative repairs of earlier repairs.
4. If the sibling repairs all fail, proceed to the next initial program. Stop at the first pass or program limit.

The repair stream is seeded by task/repetition and original parent index. In the feedback study both arms use the same candidate indices in their respective feedback pools. The maximum program count includes initials and repairs. Model calls also count separate external-feedback calls. Fresh sampling has no access to earlier failures. Self-feedback and repair are jointly generated in one call; external feedback plus repair uses two calls per repair candidate.

The operational test and reported outcome are the same recorded `binary` value: passing means passing the study's tests, not a separate hidden-test suite. Candidate code is displayed as text and never executed. Both arms and the one-program reference use the same included runs. Missing branches are excluded symmetrically and reported. Abstention-like failures to find a pass remain unsuccessful; they are not removed from the denominator.

Repetitions reuse finite pools and describe response-order variation, not new generations or confidence intervals. The demo samples without replacement inside each pool per repetition; the paper's bootstrap estimator used replacement. Results need not match published percentages.

## Interactive sections

The first section always compares one program with repair; it has no no-repair strategy selector. Code Llama can use self-feedback, GPT-3.5 feedback, or GPT-4 feedback. Other code models use self-feedback. External feedback selections load the aligned external-feedback dataset described above.

The second section generates fresh programs and is revealed only after the participant selects whether section 1's results support the hypothesis. Either choice unlocks it; running repair alone does not. Model and program limit are disabled dropdowns that continuously mirror section 1, including after unlocking. The repair reference's candidate count and feedback source also synchronize automatically. Task set, seed, and repetitions are initialized from section 1 at unlock and then remain independently editable. Each run recomputes the repair reference at matching settings rather than comparing against a stale saved score. Linked changes mark old results stale; an in-progress run retains its executed settings and is marked stale if controls change during loading. Both sections retain independent exports.

## Cost

Program counts and inferred model-call counts measure work. Output token counts are copied from the source's `tokens_generated`. The repository's `paper/data/calculate-token-counts.py` reconstructs these counts from processed programs and explanations; they are not API usage records. Self-repair uses the corresponding model tokenizer; mixed-model feedback files use the code model's tokenizer for the combined explanation and repair. These are a length proxy, not exact cross-provider billing. Input tokens, execution costs, latency, and dollar costs are not available. Equal program limits do not establish equal compute.

## Reproduce

Download the archive from the pinned revision:

```sh
curl -L --fail https://media.githubusercontent.com/media/theoxo/self-repair/fcda7a193a732d89fc1f610074c719682228fbc4/paper/data/humaneval/humaneval-data.tar.bz2 -o /tmp/self-repair-humaneval.tar.bz2
curl -L --fail https://raw.githubusercontent.com/openai/human-eval/master/data/HumanEval.jsonl.gz -o /tmp/ablation-HumanEval.jsonl.gz
python3 tutorials/sc-2026-llm-eval/demos/workbench/import_self_repair.py /tmp/self-repair-humaneval.tar.bz2 /tmp/ablation-HumanEval.jsonl.gz
node --test tutorials/sc-2026-llm-eval/demos/workbench/tests/ablation.test.mjs
```

The importer streams the archive without extracting or executing its contents. Exports contain settings, source metadata, summary scores, pairing seeds, and trace indices. Reproduce them with `evaluateRepair` and the matching browser dataset. No live inference is used.
