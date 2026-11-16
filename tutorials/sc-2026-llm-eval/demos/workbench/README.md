# SC26 evaluation workbenches

The [sampling workbench](../sampling-workbench.html) and [ablation workbench](../ablation-workbench.html) run entirely in the browser. Sampling uses bundled **Monkey Business model outputs**; see [its provenance](MONKEY_BUSINESS_PROVENANCE.md). Ablation uses recorded **Self-Repair / HumanEval programs and repairs**; see [its provenance](SELF_REPAIR_PROVENANCE.md). Each lesson has a small UI and evaluation module; they share seeded shuffling and presentation styles.

## Run locally

From the website checkout:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/tutorials/sc-2026-llm-eval/>. Use another port if 8000 is occupied. No build, packages, API keys, or model downloads are needed for the two new workbenches. Opening the HTML directly with `file://` is not supported because the pages load modules and JSON.

The landing page links all five demos. The original token-sampling, metrics, and replay pages are preserved. Their existing optional model/server requirements have not changed.

## Instructor guide

### Sampling: 20 minutes

1. **First 4 minutes:** Explain the diagram: question, sampled responses, selection. Open the example question.
2. **Next 6 minutes:** Compare one answer with four attempts and the most frequent answer. Inspect one question and open the model responses.
3. **Next 5 minutes:** Change the budget or try random selection, agreement stopping, or the ideal-verifier diagnostic. Explain the difference between finding a correct answer and returning it.
4. **Last 5 minutes:** Toggle between test and reserved questions with the same method and save the result. Discuss limits of reusing a fixed response pool.

Sampling strategies are separate from experiment repetitions, which set the outcome denominator. The ideal-verifier option explicitly uses the answer key; it is not an operational verifier. Estimated generation costs and their assumptions are exported alongside results. The sampling UI calls the internal `development` split “test questions”; the stored IDs remain compatible with existing exports. Sampling exports the executed experiment; it does not expose the old two-policy editor or import controls.

### Ablation: 20 minutes

1. **Explore LLM Repair:** Change the code model, program limit, repairs per failed program, and feedback source. Compare repair with one program. There is no selectable no-repair workflow in this section. Code Llama also supports recorded GPT-3.5 or GPT-4 feedback; these use a different starting pool from self-feedback.
2. **Assess the hypothesis:** Participants may rerun section 1 as often as they wish. After a completed run, **Supported** and **Not supported** both unlock section 2. The UI does not grade their choice. Edited results must be rerun before answering.
3. **Ablate the Repair:** The model and program-limit dropdowns are disabled and always mirror section 1. Repair-candidate count and feedback source also synchronize automatically for the reference. The initial unlock carries over task set, repetitions, and seed; those experiment settings can then be changed independently in section 2.
4. **Compare:** Run without repair. The chart shows one program, a matched repair reference, and fresh generation. Changes in section 1 mark affected ablation results stale, without locking the section again. Both sections retain their own results and exports.

Cost and task traces expand on demand. Defaults give 46.0% success for one program, 51.9% for repair, and 53.4% for fresh attempts. Dataset and method is a single paragraph linking the public dataset and paper.

Repair candidates are siblings of their original failed program, not iterative repairs. No-feedback revisions and human-study records are unavailable. Cost shows programs, model calls, and reconstructed output-token counts, not measured dollars or equal compute.

### During the session

- Each section keeps its own results. Editing settings marks only that section’s old result as stale.
- Task-set selectors live in each section’s collapsed experiment settings. Run the section again after changing its task set.
- Empty task filters display a message. Select **All outcomes** to restore cases.
- Exports describe the last executed experiment, including its pinned data and settings.
- Both lessons load local JSON; serve the checkout over HTTP instead of opening files directly.

## Reproduction and checks

Developer checks use Node 18+ and Python 3.9+, with no installed packages:

```sh
python3 tutorials/sc-2026-llm-eval/demos/workbench/build_practice_data.py
node tutorials/sc-2026-llm-eval/demos/workbench/audit-data.mjs
node --test tutorials/sc-2026-llm-eval/demos/workbench/tests/*.test.mjs
```

Open `demos/workbench/tests/browser.html` through the local server for browser checks. It exercises links, both experiment sections, model and feedback selection, hypothesis unlocking, synchronized controls, matched references, independent results, task filters, exports, invalid inputs, and a 375-pixel layout. The test page reports each result. No browser automation package is needed.

Regenerate the small example reports after intentional engine or fixture changes:

```sh
node tutorials/sc-2026-llm-eval/demos/workbench/audit-data.mjs --write-examples
```

The legacy synthetic fixture examples (for engine development, not the current sampling lesson) contain computed results for seed 2026 and 20 replay trials per task:

- **Synthetic sampling example:** on 120 development runs, one shot returns a correct answer in 45.8% of runs; eight-attempt voting returns one in 55.8%. Voting's oracle coverage is 100%. These are results on authored examples, not a model benchmark.
- **Synthetic ablation example:** on 95 matched development runs, fresh attempts succeed in 48.4% and feedback repair in 55.8%, with 1.28 calls per included run for each. Five pairs lack a required repair branch and are excluded from both scores. This comparison does not isolate feedback or control token cost.

The engine tests cover identities and ancestry, deterministic pairing, label isolation, finite-pool budgets, voting, abstention, regression, missing branches, missing costs, matched denominators, and export round trips. Browser testing during implementation used Chrome; Firefox and Safari still need a rehearsal check.

## Code map

| File | Responsibility |
| --- | --- |
| `engine.mjs` | Validation, seeded record order, policy execution, scoring, pairing, exports |
| `sampling-app.mjs` | Sampling lesson controls, diagrams, results, and exports |
| `ablation-app.mjs` | Repair lesson controls, diagrams, results, and exports |
| `ablation-engine.mjs` | Recorded test-driven search, paired studies, token accounting |
| `import_self_repair.py` | Pinned archive conversion and feedback-parent alignment |
| `app.mjs` | Legacy synthetic-workbench UI, no longer loaded by either lesson |
| `workbench.css` | Shared responsive presentation |
| `build_practice_data.py` | Authored fixture source; never runs candidate code |
| `practice-data.json` | Versioned, offline data for both demos |
| `audit-data.mjs` | Data validation, counts, SHA-256, computed example reports |
| `tests/` | Engine and browser checks |

The engine passes response text and public observations to decision logic. `scoreRun` reads final labels only after selection. Repair records must point to an initial sample in the same task and carry that parent's feedback context. Missing branches return an unsupported status, never an invented answer.

Scores use the intersection of supported, scorable task/trial pairs for A, B, and the one-shot reference. Each included pair has equal weight. Exclusions can change the task mix, so the UI reports counts and keeps excluded traces available. Per-trial ranges describe variation over a fixed pool; they are not confidence intervals.

## Legacy synthetic fixtures

The original synthetic fixture and examples remain for engine regression checks. Neither current lesson loads them. The following notes describe that legacy schema; real ablation data uses `ablation-engine.mjs` and the format documented in [SELF_REPAIR_PROVENANCE.md](SELF_REPAIR_PROVENANCE.md).

1. Map tasks and responses to the existing JSON schema. Keep initial draw IDs distinct, even for identical prompts or output text. A repair inherits its parent's run ID and uses a separate sample ID.
2. Provide task and split IDs, model/decoding configuration, response text, evaluator identity, and separately identified public checks. Extend validation for any new fields or action types.
3. Verify the answer extractor before enabling voting. Do not use whole-program voting for code tasks. Only enable a public-check policy when the data contain a legitimate operational signal.
4. Pin the data version. Update page labels, pool sizes, provenance, and policy limits to reflect the imported data. Run the audit and all checks before replacing the practice fixture.
5. For a feedback-specific ablation, obtain matched revisions with and without feedback. Do not infer missing branches or borrow a repair from another parent. Add token-budget controls only after token accounting is reliable.

Full browser exports include the dataset/version, evaluator/checker, frozen settings, seeds, task IDs, every action and output, costs and missingness, paired scores, and limitations. They can be large because they retain complete traces; the checked-in examples omit traces and recompute them on import.

Not available in the real-data ablation lesson: recorded no-feedback revisions, human-study records, measured input-token/time budgets, or a separate hidden-test score. No live model calls were made.

The sampling page uses authored arithmetic illustrations to explain the workflow and selection strategies. These figures are separate from dataset results. The strategy figure runs the same policy code on a tiny fixed example and updates with the sample limit, agreement threshold, and fallback. Experiment settings (repetitions, seed, and cost rate) are collapsed by default.
