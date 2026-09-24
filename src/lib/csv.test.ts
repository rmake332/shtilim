import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and joins rows with CRLF', () => {
    expect(toCsv(['א', 'ב'], [[1, 'ג']])).toBe('﻿א,ב\r\n1,ג');
  });

  it('quotes cells with commas, quotes or newlines', () => {
    expect(toCsv(['x'], [['a,b'], ['תשפ"ז'], ['1\n2']])).toBe('﻿x\r\n"a,b"\r\n"תשפ""ז"\r\n"1\n2"');
  });

  it('renders null and undefined as empty', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('﻿a,b\r\n,');
  });
});
