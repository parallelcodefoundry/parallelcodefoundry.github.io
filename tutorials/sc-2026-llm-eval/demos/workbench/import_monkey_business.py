"""Extract an outcome-independent offline subset from the pinned upstream JSON.
Usage: python3 import_monkey_business.py /path/to/GSM8K_Llama-3-8B-Instruct.json
"""
import hashlib
import json
from pathlib import Path
import re
import sys

REVISION = 'a9f8f73bcd6948a57ed922cba4e48062ef95f553'
SOURCE = 'https://huggingface.co/datasets/ScalingIntelligence/monkey_business'
SAMPLES_PER_QUESTION = 100
raw = Path(sys.argv[1]).read_bytes()
expected_hash = '0e334c7010a2eb39ab0aaf38cdd196da0b6219a95fd69f82d35b8f51e46ed765'
if hashlib.sha256(raw).hexdigest() != expected_hash:
    raise SystemExit('Source hash differs from the pinned release; refusing to label it as that version.')
rows = json.loads(raw)
tasks = []
for position, row in enumerate(rows):
    task_id = f"gsm8k-{row['orig_dset_idx']}"
    records = []
    assert len(row['samples']) == len(row['is_corrects'])
    for index, response in enumerate(row['samples'][:SAMPLES_PER_QUESTION]):
        match = re.search(r'#### (\-?[0-9\.\,]+)', response)
        # Extract from response only, never from the ground-truth answer.
        answer = match.group(1).replace(',', '') if match else None
        if answer is not None:
            try:
                number = float(answer)
                answer = str(int(number)) if number.is_integer() else str(number)
            except ValueError:
                answer = None
        records.append(dict(id=f'{task_id}/sample-{index}', taskId=task_id,
            runId=f'{task_id}/draw-{index}', parentId=None, kind='initial',
            response=response, extractedAnswer=answer, correct=row['is_corrects'][index],
            publicCheck=None, tokens=None, provenance='published_record', sourceSampleIndex=index))
    tasks.append(dict(id=task_id, split='evaluation' if position % 3 == 0 else 'development',
        family='GSM8K', prompt=row['question'], generationPrompt=row['prompt'],
        sourceIndex=row['orig_dset_idx'], sourceSplit=row['orig_dset_split'], records=records))
data = dict(id='monkey-business-gsm8k-llama3-8b', version=f'{REVISION}-first{SAMPLES_PER_QUESTION}-v1',
    mode='sampling', kind='published_record', model='Llama-3-8B-Instruct',
    evaluator='Monkey Business released is_corrects (GSM8K answer extraction)', checker=None,
    source=SOURCE, sourceRevision=REVISION, sourceSha256=hashlib.sha256(raw).hexdigest(),
    decoding=dict(temperature=0.6, maxTokens=512, fewShotExamples=5),
    limitations=[f'First {SAMPLES_PER_QUESTION} released samples per question; no selection by outcome.',
        'Replays reuse a finite pool, not new independent model calls.',
        'Tutorial development/reserved split partitions upstream test questions.',
        'Token counts and time are unavailable; correctness labels are upstream annotations.'], tasks=tasks)
path=Path(__file__).with_name('monkey-business.json')
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
print(f'{len(tasks)} questions; {sum(len(t["records"]) for t in tasks)} responses; {path.stat().st_size} bytes')
print('Source SHA-256:', data['sourceSha256'])
