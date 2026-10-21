#!/usr/bin/env python3
"""Build a local /api/units/import payload. Does not connect to any service."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--corpus', type=Path, default=Path(__file__).resolve().parents[2] / 'mcp_learning_server/content/learning_content.json')
parser.add_argument('--topic-mappings', type=Path, help='JSON object mapping source topic names to catalog topic UUIDs')
parser.add_argument('--output', type=Path, help='Destination JSON payload; written only when all mappings exist')
args = parser.parse_args()
records = json.loads(args.corpus.read_text())
topics = sorted({record['topic'] for record in records})
if not args.topic_mappings:
    print(json.dumps(dict.fromkeys(topics, '<catalog-topic-uuid>'), ensure_ascii=False, indent=2))
else:
    from uuid import UUID
    mappings = json.loads(args.topic_mappings.read_text())
    for topic in topics:
        if topic not in mappings:
            parser.error(f'Missing mapping for {topic}')
        try:
            if UUID(mappings[topic]).int == 0:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            parser.error(f'Invalid catalog UUID for {topic}')
    if args.output is None:
        parser.error('--output is required with --topic-mappings')
    args.output.write_text(json.dumps({'records': records, 'topicMappings': mappings}, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared {len(records)} records across {len(topics)} source topics: {args.output}')
