import { describe, expect, test } from 'vitest';
import { num, parseCsv, sum } from '../src/lib/csv';

describe('parseCsv', () => {
  test('handles quotes, escaped quotes, commas and blank lines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n\n1,2\n')).toEqual([
      { a: 'x, y', b: 'say "hi"' },
      { a: '1', b: '2' },
    ]);
  });

  test('handles CRLF line endings, a BOM and newlines inside quotes', () => {
    expect(parseCsv('﻿a,b\r\n"line1\nline2",2\r\n')).toEqual([{ a: 'line1\nline2', b: '2' }]);
  });

  test('returns no rows for empty input or a header-only file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('date,platform\n')).toEqual([]);
  });

  test('fills missing trailing fields with empty strings', () => {
    expect(parseCsv('a,b,c\n1\n')).toEqual([{ a: '1', b: '', c: '' }]);
  });
});

describe('num and sum', () => {
  test('num tolerates currency, commas and blanks', () => {
    expect(num('$1,200')).toBe(1200);
    expect(num('')).toBe(0);
    expect(num('n/a')).toBe(0);
    expect(num(undefined)).toBe(0);
  });

  test('sum adds a column', () => {
    expect(sum([{ x: '1' }, { x: '$2,000' }, { x: '' }], 'x')).toBe(2001);
  });
});
