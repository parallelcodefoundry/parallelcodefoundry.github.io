---
language:
- en
license:
- mit
multilinguality:
- monolingual
size_categories:
- <1k
pretty_name: Monkey Business
tags:
- math-word-problems
- verifiers
configs:
- config_name: GSM8K_Llama-3-8B-Instruct
  data_files:
  - split: test
    path: "GSM8K_Llama-3-8B-Instruct.json"
- config_name: GSM8K_Llama-3-70B-Instruct
  data_files:
  - split: test
    path: "GSM8K_Llama-3-70B-Instruct.json"
- config_name: MATH_Llama-3-8B-Instruct
  data_files:
  - split: test
    path: "MATH_Llama-3-8B-Instruct.json"
- config_name: MATH_Llama-3-70B-Instruct
  data_files:
  - split: test
    path: "MATH_Llama-3-70B-Instruct.json"
- config_name: MATH_Llama-3-8B
  data_files:
  - split: test
    path: "MATH_Llama-3-8B.json"
- config_name: MATH_Gemma-2B
  data_files:
  - split: test
    path: "MATH_Gemma-2B.json"
- config_name: MATH_Gemma-7B
  data_files:
  - split: test
    path: "MATH_Gemma-7B.json"
- config_name: MATH_Pythia-70M
  data_files:
  - split: test
    path: "MATH_Pythia-70M.json"
- config_name: MATH_Pythia-160M
  data_files:
  - split: test
    path: "MATH_Pythia-160M.json"
- config_name: MATH_Pythia-410M
  data_files:
  - split: test
    path: "MATH_Pythia-410M.json"
- config_name: MATH_Pythia-1B
  data_files:
  - split: test
    path: "MATH_Pythia-1B.json"
- config_name: MATH_Pythia-1.4B
  data_files:
  - split: test
    path: "MATH_Pythia-1.4B.json"
- config_name: MATH_Pythia-2.8B
  data_files:
  - split: test
    path: "MATH_Pythia-2.8B.json"
- config_name: MATH_Pythia-6.9B
  data_files:
  - split: test
    path: "MATH_Pythia-6.9B.json"
- config_name: MATH_Pythia-12B
  data_files:
  - split: test
    path: "MATH_Pythia-12B.json"
- config_name: CodeContests_Llama-3-8B-Instruct
  data_files:
  - split: test
    path: "CodeContests_Llama-3-8B-Instruct.json"
- config_name: CodeContests_Llama-3-70B-Instruct
  data_files:
  - split: test
    path: "CodeContests_Llama-3-70B-Instruct.json"
- config_name: CodeContests_Llama-3-8B
  data_files:
  - split: test
    path: "CodeContests_Llama-3-8B.json"
- config_name: CodeContests_Gemma-2B
  data_files:
  - split: test
    path: "CodeContests_Gemma-2B.json"
- config_name: CodeContests_Gemma-7B
  data_files:
  - split: test
    path: "CodeContests_Gemma-7B.json"
- config_name: MiniF2F-MATH_Llama-3-8B-Instruct
  data_files:
  - split: test
    path: "MiniF2F-MATH_Llama-3-8B-Instruct.json"
- config_name: MiniF2F-MATH_Llama-3-70B-Instruct
  data_files:
  - split: test
    path: "MiniF2F-MATH_Llama-3-70B-Instruct.json"
---

# **Monkey Business**
Monkey Business is a dataset of samples from large language models. It contains both correct and incorrect samples from a variety of models (the Llama-3, Gemma, and Pythia series) on a variety of tasks (problems from GSM8K, MATH, CodeContests, and MiniF2F-MATH). We hope that it can be useful for developing improved verification methods that assess whether a model generated answer is correct.

This dataset was created as part of the project: "Large Language Monkeys: Scaling Inference Compute with Repeated Sampling".
- **Project page:** https://scalingintelligence.stanford.edu/pubs/large_language_monkeys/
- **Paper:** https://arxiv.org/abs/2407.21787
  
## Dataset Summary

We provide model-generated samples to problems from each of the following tasks and models:

[GSM8K](https://huggingface.co/datasets/openai/gsm8k): Samples for 127 random problems from the test set. Samples are generated from  the following models:
- [Llama-3-8B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [Llama-3-70B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-70B-Instruct)


[MATH](https://huggingface.co/datasets/hendrycks/competition_math): Samples for 128 random problems from the test set. Samples are generated from the following models:
- [Llama-3-8B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [Llama-3-70B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-70B-Instruct)
- [Llama-3-8B](https://huggingface.co/meta-llama/Meta-Llama-3-8B)
- [Gemma-2B](https://huggingface.co/google/gemma-2b)
- [Gemma-7B](https://huggingface.co/google/gemma-7b)
- [Pythia-70M](https://huggingface.co/EleutherAI/pythia-70m)
- [Pythia-160M](https://huggingface.co/EleutherAI/pythia-160m)
- [Pythia-410M](https://huggingface.co/EleutherAI/pythia-410m)
- [Pythia-1B](https://huggingface.co/EleutherAI/pythia-1b)
- [Pythia-1.4B](https://huggingface.co/EleutherAI/pythia-1.4b)
- [Pythia-2.8B](https://huggingface.co/EleutherAI/pythia-2.8b)
- [Pythia-6.9B](https://huggingface.co/EleutherAI/pythia-6.9b)
- [Pythia-12B](https://huggingface.co/EleutherAI/pythia-12b)


[CodeContests](https://huggingface.co/datasets/deepmind/code_contests): Samples for the 140 problems in the test set that do not contain images in the problem description. Samples are generated from  the following models:
- [Llama-3-8B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [Llama-3-70B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-70B-Instruct)
- [Llama-3-8B](https://huggingface.co/meta-llama/Meta-Llama-3-8B)
- [Gemma-2B](https://huggingface.co/google/gemma-2b)
- [Gemma-7B](https://huggingface.co/google/gemma-7b)


[MiniF2F-MATH](https://huggingface.co/datasets/cat-searcher/minif2f-lean4): Samples for the 130 problems in the test set that are formalized problems from the MATH dataset. Samples are generated from  the following models:
- [Llama-3-8B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [Llama-3-70B-Instruct](https://huggingface.co/meta-llama/Meta-Llama-3-70B-Instruct)


We provide a dataset configuration for each (task, model) pair listed above, using the naming convention DATASET_MODEL. For example, to load the samples from Llama-3-8B-Instruct samples on GSM8K, use:


```python
from datasets import load_dataset
dataset = load_dataset("ScalyIntelligence/monkey_business","GSM8K_Llama-3-8B-Instruct")["test"]
```

Each configuration has a single split, "test", containing all the data (as the original problems come from each task's test split).

## Data Fields

Dataset items from all configurations contain the following fields (with the exception that the CodeContests and MiniF2F-MATH configurations do not contain the `gt_answer` field):

- `question`: The question the model is solving, as a string.


- `gt_answer`: The full ground truth solution string to the question from the original dataset.


- `prompt`: The prompt given to the model when generating samples. The prompt is the same across all 10k samples.


- `samples`: A list of 10k strings containing the model's samples for the given problem.


- `is_corrects`: A list of 10k booleans where is_corrects[i] is True if samples[i] is correct and False otherwise.


- `orig_dset_split`: What split the problem came from in the original dataset.


- `orig_dset_idx`: The index of the problem in the split of the original huggingface dataset (note the links for all original datasets are in the Dataset Summary Section).


## Dataset Creation

| **Dataset**        | **Generating Samples**                                                                                                                                                                                                                                                                                                   | **Assessing Sample Correctness**                                                                                                                                                                                                                           |
|--|-------|--------|
| **GSM8K**          | We generated samples for 128 randomly sampled test-set problems (note that we identified a problem with an incorrect ground truth which we omit from this dataset). We sampled with a temperature of 0.6 and did not use nucleus sampling. We used 5 few-shot examples from the training set that are randomly sampled per-problem. We generated 10,000 samples per problem, and set 512 as the max token length for each generated solution. | We follow [LMEval](https://github.com/EleutherAI/lm-evaluation-harness) and extract the content after the quadruple hashes using the regex: `#### (\-?[0-9\.\,]+)` for both the ground truth and model-generated answers and use string equality to assess correctness. |
| **MATH**           | We generated samples for 128 randomly sampled test-set problems. We sampled with a temperature of 0.6 and did not use nucleus sampling. We use the same fixed 5 few-shot example as [this paper](https://arxiv.org/abs/2206.14858). We generated 10,000 samples per problem, and set 512 as the max token length for each generated solution. | We follow the `minerva_math` task from [LMEval](https://github.com/EleutherAI/lm-evaluation-harness) which uses the `sympy` library to simplify final answers before testing for equivalence.                                                              |
| **CodeContests**   | We generated samples for the 140 test-set problems that do not contain an image tag in the problem description. We sampled with a temperature of 0.5 and a top-p value of 0.95. We use 2 few-shot examples that are randomly sampled per problem. We generated 10,000 samples and set 1024 as the max token length for each generated solution. | We use the same answer comparison function as [AlphaCode](https://www.science.org/doi/10.1126/science.abq1158) and use the concatenation of public, private, and generated tests to validate correctness of solutions.                                      |
| **MiniF2F-MATH**   | We report results on the 130 questions in the test set of the [lean4 MiniF2F dataset](https://github.com/rah4927/lean-dojo-mew/blob/main/MiniF2F/Test.lean) that correspond to formalized MATH problems. This dataset is derived from the fixed version of the [original MiniF2F dataset](https://arxiv.org/abs/2109.00110). We sample with a temperature of 0.5 and do not use nucleus sampling. We generated 10,000 samples per problem and set 200 as the max token length for each generated solution. We use the same fixed 5 few-shot prompt with examples coming from the validation set. | To grade solutions, we use the `lean-dojo 1.1.2` library with `lean version 4.3.0-rc2`. We set a timeout of 10 seconds for every tactic step. Note that there may be false negatives due to correct proofs timing out being labelled as incorrect. |

## Manually Graded Chain-of-Thought Faithfulness

We conducted a manual study assessing the faithfulness of the chain-of-thought reasoning for 105 correct samples across 35 problems from the GSM8K dataset with varying difficulties. Interestingly, we find that the chains-of-thought mostly follow valid logical steps, even for problems where the vast majority of solutions are false. For the complete human evaluation, see this [spreadsheet](https://docs.google.com/spreadsheets/d/1D-suvkheNA4fjLsO2TuwHNqwx2TIECmp/edit?gid=452801524#gid=452801524).


| Pass@1    | # Problems | # CoT Graded | Correct CoT | Incorrect CoT | Incorrect Ground Truth |
|-----------|------------|--------------|-------------|---------------|------------------------|
| 0-10%     | 5          | 15           | 11          | 1             | 1 problem, 3 CoTs      |
| 10-25%    | 10         | 30           | 27          | 3             | 0 problems             |
| 25-75%    | 29         | 30           | 28          | 2             | 0 problems             |
| 75-100%   | 84         | 30           | 30          | 0             | 0 problems             |

## License

We release our samples under the [MIT License](https://opensource.org/licenses/MIT), please refer to the original datasets’ licenses for the original problems and answers.

## Citation Information

```bibtex
@misc{brown2024largelanguagemonkeysscaling,
      title={Large Language Monkeys: Scaling Inference Compute with Repeated Sampling}, 
      author={Bradley Brown and Jordan Juravsky and Ryan Ehrlich and Ronald Clark and Quoc V. Le and Christopher Ré and Azalia Mirhoseini},
      year={2024},
      eprint={2407.21787},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2407.21787}, 
}
```
