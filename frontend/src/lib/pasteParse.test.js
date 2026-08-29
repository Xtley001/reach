import { describe, it, expect } from 'vitest';
import { normalizePhone, parsePasteBlock } from './pasteParse';

describe('normalizePhone (C-31)', () => {
  it('accepts Nigerian local format (080...)', () => {
    expect(normalizePhone('08012345678')).toEqual({ ok: true, phone: '+2348012345678' });
  });
  it('accepts spaces/dashes/parens', () => {
    expect(normalizePhone('080 1234 5678')).toEqual({ ok: true, phone: '+2348012345678' });
    expect(normalizePhone('(080) 123-45678')).toEqual({ ok: true, phone: '+2348012345678' });
  });
  it('accepts already-E.164 numbers unchanged', () => {
    expect(normalizePhone('+2348012345678')).toEqual({ ok: true, phone: '+2348012345678' });
  });
  it('assumes country code prefix when missing +', () => {
    expect(normalizePhone('2348012345678')).toEqual({ ok: true, phone: '+2348012345678' });
  });
  it('flags unparseable garbage instead of throwing', () => {
    expect(normalizePhone('call me later').ok).toBe(false);
    expect(normalizePhone('').ok).toBe(false);
  });
});

describe('parsePasteBlock (C-32)', () => {
  it('never drops a line — every input line becomes exactly one output row', () => {
    const text = 'Amaka, 08011112222\n07022223333\ngarbage line\n\n  \n+2348033334444';
    const rows = parsePasteBlock(text);
    // blank lines are stripped before counting (not "dropped silently" — they
    // carry no data to begin with), 4 real lines in -> 4 rows out
    expect(rows).toHaveLength(4);
    expect(rows.filter(r => r.status === 'ok')).toHaveLength(3);
    expect(rows.filter(r => r.status === 'error')).toHaveLength(1);
  });

  it('parses "Name, Phone" and tab-separated forms', () => {
    const rows = parsePasteBlock('Amaka Johnson, 08011112222\nChidi\t07022223333');
    expect(rows[0]).toMatchObject({ status: 'ok', name: 'Amaka Johnson', phone: '+2348011112222' });
    expect(rows[1]).toMatchObject({ status: 'ok', name: 'Chidi', phone: '+2347022223333' });
  });

  it('parses phone-only lines with no name', () => {
    const rows = parsePasteBlock('08011112222');
    expect(rows[0]).toMatchObject({ status: 'ok', name: null, phone: '+2348011112222' });
  });
});
