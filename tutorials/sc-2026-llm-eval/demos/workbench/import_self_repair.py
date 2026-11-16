"""Build bounded browser datasets from the published HumanEval repair archive.

Usage: python3 import_self_repair.py ARCHIVE HUMAN_EVAL_PROMPTS_GZ
Never executes model-generated code. Selection uses source order, not outcomes.
"""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parent
REVISION = 'fcda7a193a732d89fc1f610074c719682228fbc4'
ARCHIVE_SHA = '3c06d3c11166d3f5e08341721004de6bb3201bfb0c8e53b2154c49609f669e68'
PROMPT_SHA = 'b796127e635a67f93fb35c04f4cb03cf06f38c8072ee7cee8833d7bee06979ef'
FILES = {
    'codellama': 'codellama-humaneval-results-tokens.jsonl',
    'gpt35': 'chatgpt-humaneval-results-tokens.jsonl',
    'gpt4': 'gpt4-humaneval-results-tokens.jsonl',
    'feedback35': 'codellama+chatgpt-tokens.jsonl',
    'feedback4': 'codellama+gpt4-tokens.jsonl',
}
MODELS = {'codellama': 'Code Llama 13B Instruct', 'gpt35': 'GPT-3.5 Turbo (0301)',
          'gpt4': 'GPT-4 (0314)', 'feedback': 'Code Llama 13B Instruct'}


def completion(source, index):
    assert isinstance(source['binary'], bool)
    return {'index': index, 'code': source['executed_completion'],
            'passed': source['binary'], 'error': source['fault'],
            'tokens': source['tokens_generated']}


def repairs(source):
    result = []
    for index, repair in enumerate((source['repairs'] or [])[:5]):
        assert isinstance(repair['binary'], bool)
        result.append({'index': index, 'code': repair['repaired_program'] or '',
                       'feedback': repair['explanation'], 'passed': repair['binary'],
                       'tokens': repair['tokens_generated']})
    # Do not silently discard failed parents with absent repair branches.
    assert source['binary'] or len(result) == 5
    return result


def main(archive, prompts_path):
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert digest == ARCHIVE_SHA, 'Archive differs from the pinned release.'
    assert hashlib.sha256(prompts_path.read_bytes()).hexdigest() == PROMPT_SHA, 'Task prompts differ from the pinned artifact.'
    with gzip.open(prompts_path, 'rt') as handle:
        prompts = {row['task_id']: row['prompt'] for row in map(json.loads, handle)}
    sources = {}
    with tarfile.open(archive, 'r|bz2') as handle:
        for member in handle:
            if member.name not in FILES.values():
                continue
            tasks = {}
            for line in handle.extractfile(member):
                row = json.loads(line)
                tasks[row['task_id']] = [
                    {**completion(source, index), 'repairs': repairs(source),
                     'original': source['original_completion']}
                    for index, source in enumerate(row['completions'][:20])
                ]
                assert len(tasks[row['task_id']]) == 20
            assert len(tasks) == 164
            sources[member.name] = tasks
    for key, model in MODELS.items():
        primary = sources[FILES['feedback35' if key == 'feedback' else key]]
        tasks = []
        for task_id in sorted(primary, key=lambda value: int(value.split('/')[1])):
            records = []
            for parent in primary[task_id]:
                record = {k: v for k, v in parent.items() if k not in ('original', 'repairs')}
                record['repairs'] = {'self': parent['repairs']}
                if key == 'feedback':
                    other = sources[FILES['feedback4']][task_id][parent['index']]
                    for field in ('original', 'code', 'passed', 'error', 'tokens'):
                        assert parent[field] == other[field], (task_id, parent['index'], field)
                    record['repairs'] = {'gpt35': parent['repairs'], 'gpt4': other['repairs']}
                records.append(record)
            tasks.append({'id': task_id, 'prompt': prompts[task_id],
                          'split': 'reserved' if int(task_id.split('/')[1]) % 3 == 0 else 'test',
                          'initials': records})
        data = {'id': 'self-repair-' + key, 'version': REVISION + '-first20x5-v1',
                'model': model, 'feedbackStudy': key == 'feedback',
                'source': {'repository': 'https://github.com/theoxo/self-repair',
                           'revision': REVISION, 'archiveSha256': digest,
                           'files': [FILES['feedback35'], FILES['feedback4']] if key == 'feedback' else [FILES[key]],
                           'promptSha256': hashlib.sha256(prompts_path.read_bytes()).hexdigest()},
                'tasks': tasks}
        path = ROOT / ('self-repair-' + key + '.json')
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(path.name, path.stat().st_size, 'bytes')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
