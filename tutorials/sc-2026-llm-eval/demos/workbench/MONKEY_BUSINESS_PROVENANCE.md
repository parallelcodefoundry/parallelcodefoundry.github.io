# Monkey Business sampling data

Acquired November 15, 2026 from [ScalingIntelligence/monkey_business](https://huggingface.co/datasets/ScalingIntelligence/monkey_business), revision `a9f8f73bcd6948a57ed922cba4e48062ef95f553`.

- Source file: `GSM8K_Llama-3-8B-Instruct.json`.
- Source SHA-256: `0e334c7010a2eb39ab0aaf38cdd196da0b6219a95fd69f82d35b8f51e46ed765`.
- Model: Llama-3-8B-Instruct. The release describes temperature 0.6, no nucleus sampling, five per-question few-shot examples, and a maximum of 512 generated tokens.
- Subset: all 127 released questions, first 100 responses in source order for each (12,700 responses). Selection does not inspect correctness. Duplicate responses remain distinct draws.
- Tutorial split: source positions divisible by three are reserved (43); the other 84 are development. Both partitions originate in the upstream GSM8K test set.
- Question, generation prompt, output text, source question/sample indices, and correctness labels are preserved. The reference solution is omitted. `correct` comes directly from `is_corrects`; it is not recomputed or used for selection.
- Voting extracts the first `#### (\-?[0-9\.\,]+)` match from the response, removes commas, and normalizes numeric spelling. Missing or malformed matches have no vote. Ties use first encounter. The released labels remain authoritative even when numeric normalization differs from upstream string comparison.
- No operational checker, token counts, timings, or inference calls are available. Effort counts consumed recorded responses. Repeated shuffles reuse a finite pool; no iid performance or confidence interval is inferred.

## Reproduce

Download the pinned file (about 367 MB) to a temporary directory, then run:

```sh
curl -L --fail 'https://huggingface.co/datasets/ScalingIntelligence/monkey_business/resolve/a9f8f73bcd6948a57ed922cba4e48062ef95f553/GSM8K_Llama-3-8B-Instruct.json' -o /tmp/monkey-gsm8k.json
python3 tutorials/sc-2026-llm-eval/demos/workbench/import_monkey_business.py /tmp/monkey-gsm8k.json
```

The bundled `monkey-business.json` is about 7 MB. Participants need only this local subset; the upstream file is not needed at tutorial time. The importer preserves failed and unparseable responses. Engine tests validate identities, splits, and selection independence from correctness.

## Attribution and licenses

Brown, Bradley; Juravsky, Jordan; Ehrlich, Ryan; Clark, Ronald; Le, Quoc V.; Ré, Christopher; and Mirhoseini, Azalia. *Large Language Monkeys: Scaling Inference Compute with Repeated Sampling* (2024), [arXiv:2407.21787](https://arxiv.org/abs/2407.21787).

The release licenses generated samples under MIT; see the bundled upstream [dataset card](MONKEY_BUSINESS_CARD.md). GSM8K questions and few-shot examples are from OpenAI's grade-school-math release, also MIT; its notice is retained in [GSM8K-LICENSE.txt](GSM8K-LICENSE.txt). The MIT permission and warranty terms for the generated samples are retained in [MONKEY_BUSINESS-LICENSE.txt](MONKEY_BUSINESS-LICENSE.txt).

These are real recorded outputs, not new measurements of the full benchmark. Small-pool and task-subset effects limit interpretation. The ablation workbench continues to use its separate synthetic fixture.

## Strategies and repetitions

The one-output control returns the first item of a seeded shuffle: a uniform draw from the recorded pool. The selectable random strategy consumes its full budget and returns a uniform random member using a separate seeded selection stream. Most-frequent selection uses all samples. Agreement stopping returns the matching answer once N agree; at exhaustion it either abstains or votes, as configured. Abstention remains in the denominator as unsuccessful.

Experiment repetitions determine the number of scored question/workflow outcomes, not the number of samples allowed within a workflow. Samples cannot repeat within a repetition but can recur across repetitions. Increasing repetitions provides additional random orders on the same data, not new model generations.

“Stop when verified” is explicitly an **ideal-verifier diagnostic**. It uses released correctness labels in a separate runner, stops at the first passing label, and abstains at the limit if none pass. Its trace and report are labeled as diagnostic. These records do not contain an independent operational verifier; the diagnostic cannot establish that such a verifier exists or would be perfect on real tasks. Ordinary selectors still never inspect evaluation labels.

## Cost estimate

`cost.mjs` estimates API-equivalent generation expense, not the original experiment's spending or the cost of running a local GPU. Tokens are approximated as Unicode character count divided by four, rounded up separately for each prompt and response. The complete stored few-shot prompt is charged for every consumed response, without caching or batch discounts. Recorded token counts remain missing; estimates do not overwrite them.

The illustrative default is $0.20 per million input or output tokens, consistent with the Llama-3-8B / Together AI entry in the pricing table of [this 2025 research paper](https://aclanthology.org/2025.gem-1.72.pdf). This is a historical scale reference, not a current provider quote. The rate is editable. Mathematical text may tokenize differently from the four-character approximation.

Results show mean outputs, mean verifier checks, estimated generation USD per 1,000 question/workflow outcomes, and the total for all scored outcomes in the experiment. Costs include unsuccessful and abstained outcomes. Verification costs are excluded, not assumed measured as zero; a real verifier may dominate cost. Both the rate and all assumptions appear in exported JSON under `generationCost`. No model inference or paid service is invoked by the demo.
