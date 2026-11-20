#!/usr/bin/env python3
"""Validate and load a versioned course package through the author API.

--check validates offline. Against a host it is a dry run by default and prints
the plan; --apply writes. Catalog entries are reused by slug and never
overwritten. A unit receives a new revision only when its document changed, and
that revision is published. Questions, tests and maps use deterministic IDs and
receive a new revision only when their content or pinned unit revision changed.
Never touches learner data.

Authenticate in a browser as an author and export the value of the
`ait_dotnet_session` cookie as AITEACHER_SESSION. It is never printed.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from course_package import CLOSED, Package, PackageError  # noqa: E402

DEFAULT_COURSE = SCRIPTS.parent / 'configuration/courses/az-900'


def _api_module():
    # Reuse the same-origin client of load-topic-descriptions.py (hyphenated file name).
    spec = importlib.util.spec_from_file_location('topic_loader', SCRIPTS / 'load-topic-descriptions.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_module(path):
    """Validate one module file inside a temporary single-module package view."""
    package = Package.__new__(Package)
    package.root = Path(path).resolve().parent.parent
    package.course = json.loads((package.root / 'course.json').read_text(encoding='utf-8'))
    package.namespace = None
    package.modules = [json.loads(Path(path).read_text(encoding='utf-8'))]
    return package.validate()


def summary(package):
    rows = []
    for m in package.modules:
        types = {}
        for q in m['questions']:
            types[q['type']] = types.get(q['type'], 0) + 1
        rows.append({'topic': m['slug'], 'readings': len(m['unit']['readings']), 'exercises': len(m['unit']['exercises']),
                     'questions': types, 'tests': [t['key'] for t in m['tests']], 'graphEdges': len(m['graph']['edges'])})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--course', type=Path, default=DEFAULT_COURSE)
    parser.add_argument('--check', action='store_true', help='Validate offline and exit')
    parser.add_argument('--module', type=Path, help='With --check: validate a single module file')
    parser.add_argument('--base-url', help='Same origin as the React app, e.g. https://<beta-host>')
    parser.add_argument('--apply', action='store_true', help='Write; without it nothing changes')
    args = parser.parse_args()
    try:
        if args.check and args.module:
            warnings = check_module(args.module)
            print(json.dumps({'valid': True, 'module': str(args.module), 'warnings': warnings}, ensure_ascii=False, indent=2))
            return
        package = Package(args.course)
        warnings = package.validate()
    except PackageError as error:
        print(f'Paquete inválido:\n{error}', file=sys.stderr)
        sys.exit(1)
    if args.check:
        print(json.dumps({'valid': True, 'warnings': warnings, 'modules': summary(package)}, ensure_ascii=False, indent=2))
        return
    if not args.base_url:
        parser.error('Use --check or --base-url.')
    session = os.environ.get('AITEACHER_SESSION', '').strip()
    if not session:
        parser.error('Set AITEACHER_SESSION to the author session cookie value.')
    loader = _api_module()
    from course_loader import run  # noqa: E402
    report, ok = run(loader.Api(args.base_url, session), loader.ApiError, package, args.apply)
    report['warnings'] = warnings
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
