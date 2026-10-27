#!/usr/bin/env python3
"""Merge Moodle quiz XML files under one category, without serializing questions."""
import argparse
import os
from pathlib import Path
import sys
import tempfile
from xml.parsers import expat
from xml.sax.saxutils import escape


def quiz_body(raw):
    """Return original UTF-8 inner bytes, removing category records only."""
    raw.decode('utf-8-sig')  # Refuse other encodings rather than changing question bytes.
    parser = expat.ParserCreate()
    depth = 0
    begin = end = None
    removed = []
    outer_comments = []
    current = None
    count = 0

    def start(name, attrs):
        nonlocal depth, begin, current, count
        if depth == 0:
            if name != 'quiz' or attrs:
                raise ValueError('Expected <quiz> without attributes; inherited namespaces are unsupported')
            begin = raw.index(b'>', parser.CurrentByteIndex) + 1
        elif depth == 1:
            if name != 'question' or not attrs.get('type'):
                raise ValueError(f'Unsupported top-level element: {name}')
            if attrs['type'] == 'category':
                current = parser.CurrentByteIndex
            else:
                count += 1
        depth += 1

    def finish(name):
        nonlocal depth, end, current
        depth -= 1
        if depth == 1 and current is not None:
            offset = parser.CurrentByteIndex
            stop = raw.index(b'>', offset) + 1 if raw[offset:offset+2] == b'</' else offset
            removed.append((current, stop))
            current = None
        if depth == 0:
            end = parser.CurrentByteIndex

    def reject(*args):
        raise ValueError('DTD/entity declarations are unsupported')

    def text(value):
        if depth == 1 and value.strip():
            raise ValueError('Unsupported text directly inside quiz')

    def comment(value):
        if depth == 0:
            offset = parser.CurrentByteIndex
            outer_comments.append(raw[offset:raw.index(b'-->', offset) + 3])

    def processing(target, data):
        if depth == 0:
            raise ValueError('Processing instructions outside quiz are unsupported')

    parser.CommentHandler = comment
    parser.ProcessingInstructionHandler = processing
    parser.StartElementHandler = start
    parser.EndElementHandler = finish
    parser.CharacterDataHandler = text
    parser.StartDoctypeDeclHandler = reject
    parser.EntityDeclHandler = reject
    parser.ExternalEntityRefHandler = reject
    parser.Parse(raw, True)
    if begin is None or end is None or end < begin or count == 0:
        raise ValueError('No questions in quiz')
    chunks = []
    cursor = begin
    for first, last in removed:
        chunks.append(raw[cursor:first])
        cursor = last
    chunks.append(raw[cursor:end])
    return b'\n'.join(outer_comments) + b'\n' + b''.join(chunks), count, len(removed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='+', type=Path, help='Moodle XML files (shell wildcards supported)')
    parser.add_argument('--category', required=True, help='Category name or path, e.g. Linear algebra/Bases')
    parser.add_argument('-o', '--output', required=True, type=Path)
    parser.add_argument('-f', '--force', action='store_true', help='Replace existing output')
    args = parser.parse_args()
    try:
        category = args.category
        if not category.strip() or any(not part.strip() for part in category.split('/')) or '$' in category:
            raise ValueError('Specify a nonempty category path without empty segments or $ context markers')
        if any(ord(c) < 32 for c in category):
            raise ValueError('Control characters in category')
        sources = [p.resolve() for p in args.inputs]
        target = args.output.resolve()
        if len(set(sources)) != len(sources):
            raise ValueError('Duplicate input files')
        if target in sources:
            raise ValueError('Output must not overwrite an input XML (place output outside input glob)')
        if target.exists() and not args.force:
            raise ValueError('Output exists; use --force to replace')
        bodies = []
        total = 0
        for source in sources:
            try:
                body, count, removed = quiz_body(source.read_bytes())
            except (ValueError, expat.ExpatError) as error:
                raise ValueError(f'{source.name}: {error}') from error
            bodies.append(body)
            total += count
            print(f'{source.name}: {count} questions; {removed} category records replaced', file=sys.stderr)
        marker = ('<question type="category"><category><text>' +
                  escape('$course$/top/' + category) + '</text></category></question>\n').encode('utf-8')
        output = b'<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n' + marker + b'\n'.join(bodies) + b'\n</quiz>\n'
        # Reparse the complete document before creating any output.
        expat.ParserCreate().Parse(output, True)
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.merged-', delete=False) as temp:
            temp.write(output)
            temporary = Path(temp.name)
        try:
            if args.force:
                os.replace(temporary, target)
            else:
                os.link(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        print(f'{total} questions → {target}', file=sys.stderr)
        return 0
    except (OSError, ValueError, expat.ExpatError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
