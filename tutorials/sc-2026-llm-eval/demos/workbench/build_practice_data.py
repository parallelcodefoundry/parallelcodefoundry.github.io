"""Build the authored practice fixture. No model calls or candidate execution.

These small examples exercise policy decisions; their frequencies are not
measurements of any model. Edit this source, then regenerate practice-data.json.
"""

import json
from pathlib import Path


VERSION = "practice-1"
LIMITATIONS = [
    "Synthetic practice data, authored for this tutorial; no model was queried.",
    "Correctness and public-check outcomes are authored fixture labels.",
    "Token usage, elapsed time, model configuration, and monetary cost are unavailable.",
    "Replaying the same finite pool does not create new independent model samples.",
    "Authentic model records and their provenance remain to be added.",
]


def record(task_id, index, response, correct, public_check=None, parent=None):
    kind = "repair" if parent else "initial"
    return {
        "id": f"{task_id}/{kind}-{index}",
        "taskId": task_id,
        "runId": parent["runId"] if parent else f"{task_id}/draw-{index}",
        "parentId": parent["id"] if parent else None,
        "kind": kind,
        "response": response,
        "correct": correct,
        "publicCheck": public_check,
        "tokens": None,
        "provenance": "synthetic",
        "context": {
            "taskId": task_id,
            "parentId": parent["id"],
            "feedback": parent["publicCheck"]["feedback"],
        } if parent else None,
    }


# Each entry lists the entire finite pool, including repeated and invalid answers.
SAMPLING_TASKS = [
    ("blocks", "development", "Indexing", "A vector has 1,000 entries. Each block holds at most 64 entries. How many blocks are needed?", 16,
     [16, 15, 16, 16, 15, 15, 17, None]),
    ("periodic", "development", "Indexing", "A periodic array has 8 elements, indexed 0–7. Which index is one step before index 0?", 7,
     [7, -1, 7, 7, 8, -1, 7, 8]),
    ("halo", "development", "Storage", "A 10 × 12 interior grid gets a one-cell halo on every side. How many cells are stored in total?", 168,
     [120, 144, 144, 168, 144, 168, 144, 164]),
    ("mean", "development", "Reductions", "Rank 0 holds [2, 4]; rank 1 holds [9]. What is the mean over all three values?", 5,
     [6, 6, 5, 6, 5, 6, 5, None]),
    ("csr", "development", "Sparse arrays", "A CSR matrix has row pointers [0, 2, 2, 5]. How many stored entries are in row 1 (zero-based)?", 0,
     [0, 2, 0, 3, 0, 2, 0, 0]),
    ("speedup", "development", "Performance", "A serial run takes 120 seconds; a parallel run takes 30 seconds. What is the speedup?", 4,
     [4, 4, 4, 0.25, 4, 90, 4, 4]),
    ("stride", "evaluation", "Indexing", "A row-major array has shape (4, 6). What is the flat index of element (2, 3), using zero-based indices?", 15,
     [15, 11, 15, 14, 15, 15, 11, 14]),
    ("bytes", "evaluation", "Storage", "A buffer holds 256 values, each 8 bytes wide. How many bytes does it occupy?", 2048,
     [2048, 2048, 256, 2048, 2048, 1024, 2048, 2048]),
    ("residual", "evaluation", "Reductions", "The residual is [3, 4]. What is its Euclidean norm?", 5,
     [7, 5, 25, 5, 7, 5, 7, 7]),
    ("efficiency", "evaluation", "Performance", "A run has speedup 6 on 8 workers. What is parallel efficiency as a percentage?", 75,
     [75, 0.75, 75, 0.75, 75, 0.75, 75, None]),
    ("offset", "evaluation", "Sparse arrays", "A CSR matrix has row pointers [0, 1, 4, 4, 6]. At what offset does row 3 begin (zero-based)?", 4,
     [4, 6, 4, 4, 3, 4, 6, 4]),
    ("steps", "evaluation", "Indexing", "A loop starts at time 0 and advances by 0.25 until time 2. How many advances does it make?", 8,
     [9, 8, 9, 8, 9, 8, 9, 9]),
]


def sampling_tasks():
    tasks = []
    for task_id, split, family, prompt, expected, answers in SAMPLING_TASKS:
        records = []
        for index, answer in enumerate(answers):
            text = f"Answer: {answer}" if answer is not None else "I cannot determine a numeric answer."
            records.append(record(task_id, index, text, answer == expected))
        tasks.append({"id": task_id, "split": split, "family": family, "prompt": prompt, "records": records})
    return tasks


# Initial entries: code body, public-check pass, final correctness, public feedback.
# Repair entries use the same tuple; None means that branch is absent.
# These are deliberately small authored cases, not a sample of model performance.
CODE_TASKS = [
    {
        "id": "ceil-div", "split": "development", "family": "Indexing",
        "prompt": "Implement blocks(n, width) for integers n ≥ 0 and width > 0. Return the number of blocks needed to hold n entries.",
        "signature": "blocks(n, width)",
        "publicTests": "blocks(10, 4) == 3",
        "initials": [
            ("return (n + width - 1) // width", True, True, "Public test passed."),
            ("return n // width", False, False, "blocks(10, 4): expected 3, got 2."),
            ("return n // width + 1", True, False, "Public test passed."),
            ("return round(n / width)", False, False, "blocks(10, 4): expected 3, got 2."),
        ],
        "repairs": [
            ("return n // width + 1", True, False, "Public test passed."),
            ("return (n + width - 1) // width", True, True, "Public test passed."),
            ("return (n + width - 1) // width", True, True, "Public test passed."),
            ("return n // width + 1", True, False, "Public test passed."),
        ],
    },
    {
        "id": "wrap-index", "split": "development", "family": "Indexing",
        "prompt": "Implement wrap(i, n). For integer i and n > 0, return the equivalent periodic index in [0, n).",
        "signature": "wrap(i, n)", "publicTests": "wrap(-1, 8) == 7",
        "initials": [
            ("return i % n", True, True, "Public test passed."),
            ("return i + n if i < 0 else i", True, False, "Public test passed."),
            ("return abs(i) % n", False, False, "wrap(-1, 8): expected 7, got 1."),
            ("return (i + n) % n", True, True, "Public test passed."),
        ],
        "repairs": [
            ("return (i + n) % n", True, True, "Public test passed."),
            None,
            ("return i % n", True, True, "Public test passed."),
            ("return i + n if i < 0 else i", True, False, "Public test passed."),
        ],
    },
    {
        "id": "row-count", "split": "development", "family": "Sparse arrays",
        "prompt": "Implement row_count(ptr, row) for a valid CSR row-pointer list. Return the number of stored entries in zero-based row.",
        "signature": "row_count(ptr, row)", "publicTests": "row_count([0, 2, 5], 0) == 2",
        "initials": [
            ("return ptr[row + 1] - ptr[row]", True, True, "Public test passed."),
            ("return ptr[row + 1]", True, False, "Public test passed."),
            ("return ptr[row]", False, False, "row_count([0, 2, 5], 0): expected 2, got 0."),
            ("return len(ptr) - 1", True, False, "Public test passed."),
        ],
        "repairs": [
            ("return ptr[row + 1] - ptr[row]", True, True, "Public test passed."),
            ("return ptr[row + 1] - ptr[row]", True, True, "Public test passed."),
            ("return ptr[row + 1]", True, False, "Public test passed."),
            ("return ptr[row + 1] - ptr[row]", True, True, "Public test passed."),
        ],
    },
    {
        "id": "mean-value", "split": "development", "family": "Reductions",
        "prompt": "Implement mean(xs) for a nonempty list of finite numbers. Return the arithmetic mean.",
        "signature": "mean(xs)", "publicTests": "mean([2, 4]) == 3",
        "initials": [
            ("return sum(xs) / len(xs)", True, True, "Public test passed."),
            ("return sum(xs) // len(xs)", True, False, "Public test passed."),
            ("return sum(xs)", False, False, "mean([2, 4]): expected 3, got 6."),
            ("return (min(xs) + max(xs)) / 2", True, False, "Public test passed."),
        ],
        "repairs": [
            ("return sum(xs) / len(xs)", True, True, "Public test passed."),
            ("return sum(xs) / len(xs)", True, True, "Public test passed."),
            None,
            ("return sum(xs) // len(xs)", True, False, "Public test passed."),
        ],
    },
    {
        "id": "flat-index", "split": "evaluation", "family": "Indexing",
        "prompt": "Implement flat(row, col, columns). Return the zero-based offset in a row-major array with the given number of columns.",
        "signature": "flat(row, col, columns)", "publicTests": "flat(1, 2, 4) == 6",
        "initials": [
            ("return row * columns + col", True, True, "Public test passed."),
            ("return col * columns + row", False, False, "flat(1, 2, 4): expected 6, got 9."),
            ("return row * columns + col + 1", False, False, "flat(1, 2, 4): expected 6, got 7."),
            ("return columns + col", True, False, "Public test passed."),
        ],
        "repairs": [
            ("return row * columns + col + 1", False, False, "flat(1, 2, 4): expected 6, got 7."),
            ("return row * columns + col", True, True, "Public test passed."),
            ("return row * columns + col", True, True, "Public test passed."),
            ("return row * columns + col", True, True, "Public test passed."),
        ],
    },
    {
        "id": "exclusive-sum", "split": "evaluation", "family": "Reductions",
        "prompt": "Implement prefix(xs). Return exclusive prefix sums: [2, 3, 1] becomes [0, 2, 5]. An empty input returns [].",
        "signature": "prefix(xs)", "publicTests": "prefix([2, 3, 1]) == [0, 2, 5]",
        "initials": [
            ("return [sum(xs[:i]) for i in range(len(xs))]", True, True, "Public test passed."),
            ("return [sum(xs[:i + 1]) for i in range(len(xs))]", False, False, "Expected [0, 2, 5], got [2, 5, 6]."),
            ("return [0] + [sum(xs[:i]) for i in range(1, len(xs))]", True, False, "Public test passed."),
            ("return xs", False, False, "Expected [0, 2, 5], got [2, 3, 1]."),
        ],
        "repairs": [
            ("return [sum(xs[:i]) for i in range(len(xs))]", True, True, "Public test passed."),
            ("return [sum(xs[:i]) for i in range(len(xs))]", True, True, "Public test passed."),
            None,
            ("return [0] + xs[:-1]", False, False, "Expected [0, 2, 5], got [0, 2, 3]."),
        ],
    },
    {
        "id": "max-absolute", "split": "evaluation", "family": "Reductions",
        "prompt": "Implement max_abs(xs) for a nonempty list of finite numbers. Return the largest absolute value.",
        "signature": "max_abs(xs)", "publicTests": "max_abs([-5, 2]) == 5",
        "initials": [
            ("return max(abs(x) for x in xs)", True, True, "Public test passed."),
            ("return abs(max(xs))", False, False, "max_abs([-5, 2]): expected 5, got 2."),
            ("return abs(min(xs))", True, False, "Public test passed."),
            ("return max(xs)", False, False, "max_abs([-5, 2]): expected 5, got 2."),
        ],
        "repairs": [
            ("return abs(min(xs))", True, False, "Public test passed."),
            ("return max(abs(x) for x in xs)", True, True, "Public test passed."),
            ("return max(abs(x) for x in xs)", True, True, "Public test passed."),
            ("return abs(min(xs))", True, False, "Public test passed."),
        ],
    },
    {
        "id": "has-converged", "split": "development", "family": "Stopping rules",
        "prompt": "Implement converged(residual, tolerance). Return True exactly when abs(residual) ≤ tolerance; tolerance is nonnegative.",
        "signature": "converged(residual, tolerance)", "publicTests": "converged(0.1, 0.2) is True",
        "initials": [
            ("return abs(residual) <= tolerance", True, True, "Public test passed."),
            ("return residual <= tolerance", True, False, "Public test passed."),
            ("return abs(residual) >= tolerance", False, False, "converged(0.1, 0.2): expected True, got False."),
            ("return abs(residual) < tolerance", True, False, "Public test passed."),
        ],
        "repairs": [
            ("return abs(residual) < tolerance", True, False, "Public test passed."),
            ("return abs(residual) <= tolerance", True, True, "Public test passed."),
            ("return abs(residual) <= tolerance", True, True, "Public test passed."),
            ("return abs(residual) <= tolerance", True, True, "Public test passed."),
        ],
    },
]


def ablation_tasks():
    tasks = []
    for source in CODE_TASKS:
        records = []
        for index, (body, passed, correct, feedback) in enumerate(source["initials"]):
            parent = record(source["id"], index, f"def {source['signature']}:\n    {body}", correct,
                            {"passed": passed, "feedback": feedback})
            records.append(parent)
            repair = source["repairs"][index]
            if repair is not None:
                body, passed, correct, feedback = repair
                records.append(record(source["id"], index, f"def {source['signature']}:\n    {body}", correct,
                                      {"passed": passed, "feedback": feedback}, parent))
        tasks.append({key: source[key] for key in ["id", "split", "family", "prompt", "publicTests"]} | {"records": records})
    return tasks


def dataset(mode, tasks):
    return {
        "id": f"sc26-{mode}-practice", "version": VERSION, "mode": mode,
        "kind": "synthetic", "model": None,
        "evaluator": "authored-correctness-v1",
        "checker": "authored-public-tests-v1" if mode == "ablation" else None,
        "limitations": LIMITATIONS + (["No revision-without-feedback arm exists; a feedback effect cannot be isolated."] if mode == "ablation" else []),
        "tasks": tasks,
    }


if __name__ == "__main__":
    bundle = {"sampling": dataset("sampling", sampling_tasks()), "ablation": dataset("ablation", ablation_tasks())}
    destination = Path(__file__).with_name("practice-data.json")
    destination.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {destination.name}: {len(bundle['sampling']['tasks'])} sampling tasks, {len(bundle['ablation']['tasks'])} ablation tasks.")
