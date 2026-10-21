#!/usr/bin/env python3
"""Run curriculum in the existing beta job, without updating its definition.

Reuses its private network and managed identity. Overrides only this execution's
image, command and log verbosity. Does not touch IAM, schema or learner data.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
SUBSCRIPTION = '1350d930-7008-4b43-923d-6a7cd66701bc'
GROUP = 'rg-aiteacher-beta-8136'
JOB = 'job-migrate-aiteacher-beta-8136'

def az(*args):
    result = subprocess.run([sys.executable, str(ROOT / 'backend/scripts/azure-cli-audit.py'), *args,
                             '--subscription', SUBSCRIPTION, '--output', 'json'], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Azure command failed: ' + result.stderr[-1500:])
    return result.stdout

def report_from_logs(raw):
    for line in raw.splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict) and 'Log' in value:
                value = json.loads(value['Log'].removeprefix('F '))
            if isinstance(value, dict) and value.get('source') == 'learning-content-v1' and 'matches' in value:
                return value
        except (ValueError, TypeError):
            # The ACA logs CLI sometimes emits an unescaped JSON envelope and
            # prefixes the container record with CRI's 'F '. Decode only our
            # complete report object, never treat the job status as evidence.
            start = line.find('{"mode":')
            if start >= 0:
                try:
                    value, _ = json.JSONDecoder().raw_decode(line[start:])
                    if value.get('source') == 'learning-content-v1' and 'matches' in value:
                        return value
                except (ValueError, TypeError):
                    pass
    raise RuntimeError('Execution logs contain no complete reconciliation report. Do not infer success.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['inspect', 'apply', 'reconcile'])
    parser.add_argument('--image', required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--execution', help='Recover evidence from an already started execution; never start a new one')
    args = parser.parse_args()
    if not re.fullmatch(r'craiteacherbeta8136\.azurecr\.io/aiteacher@sha256:[0-9a-f]{64}', args.image):
        parser.error('Use an immutable digest in the approved beta registry.')
    if args.execution and not re.fullmatch(re.escape(JOB) + r'-[a-z0-9]+', args.execution):
        parser.error('Execution must belong to the existing beta job.')
    if args.report.exists():
        parser.error('Report exists; use a new filename to preserve evidence.')
    definition = json.loads(az('containerapp', 'job', 'show', '--name', JOB, '--resource-group', GROUP))
    template = definition['properties']['template']
    original = json.dumps(template, sort_keys=True)
    if len(template['containers']) != 1:
        raise RuntimeError('Unexpected job template; review before continuing.')
    container = template['containers'][0]
    name = container['name']
    env = {entry['name']: entry.get('value') for entry in container['env']}
    if env.get('Database__UseManagedIdentity') != 'true':
        raise RuntimeError('Existing job does not use the expected managed identity.')
    container['image'] = args.image
    container['command'] = ['dotnet', 'AITeacher.Api.dll']
    container['args'] = ['--curriculum', args.mode]
    container['env'] = [entry for entry in container['env'] if entry['name'] != 'Logging__LogLevel__Default']
    container['env'].append({'name': 'Logging__LogLevel__Default', 'value': 'Warning'})
    with tempfile.TemporaryDirectory(prefix='aiteacher-curriculum-') as directory:
        path = Path(directory) / 'execution.json'
        path.write_text(json.dumps(template))
        path.chmod(0o600)
        execution = args.execution or json.loads(az('containerapp', 'job', 'start', '--name', JOB, '--resource-group', GROUP, '--yaml', str(path)))['name']
    print(f'{args.mode}: execution {execution}', flush=True)
    deadline = time.monotonic() + 600
    previous = None
    while time.monotonic() < deadline:
        remote = json.loads(az('containerapp', 'job', 'execution', 'show', '--name', JOB, '--resource-group', GROUP,
                               '--job-execution-name', execution))['properties']
        executed = remote['template']['containers'][0]
        if executed['image'] != args.image or executed['args'] != ['--curriculum', args.mode]:
            raise RuntimeError('Execution image or operation differs from the requested evidence.')
        state = remote['status']
        if state != previous:
            print(f'Execution status: {state}', flush=True)
            previous = state
        if state in ['Succeeded', 'Failed', 'Stopped', 'Degraded']:
            break
        time.sleep(10)
    else:
        raise RuntimeError('Execution timed out; inspect remote state before retrying.')
    raw = az('containerapp', 'job', 'logs', 'show', '--name', JOB, '--resource-group', GROUP,
             '--container', name, '--execution', execution, '--tail', '100', '--format', 'json')
    report = report_from_logs(raw)
    after = json.loads(az('containerapp', 'job', 'show', '--name', JOB, '--resource-group', GROUP))
    if json.dumps(after['properties']['template'], sort_keys=True) != original:
        raise RuntimeError('Job definition changed during execution; investigate before proceeding.')
    report.update({'execution': execution, 'executionStatus': state, 'image': args.image,
                   'verifiedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'jobDefinitionUnchanged': True})
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'items'}, ensure_ascii=False), flush=True)
    if state != 'Succeeded' or report['conflicts'] or (args.mode != 'inspect' and not report['matches']):
        raise SystemExit(2)

if __name__ == '__main__':
    main()
