import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { outputSchemaFor, parseRecords } from '../src/structured.js';

describe('parseRecords', () => {
  const cols = ['window', 'tab', 'active', 'title', 'url'];
  it('maps tab-separated lines to records and keeps other lines as notes', () => {
    const out = '1\t1\t*\tHome\thttps://a.com\n1\t2\t\tDocs\thttps://b.com\n… 3 more tabs not shown';
    expect(parseRecords(out, cols)).toEqual({
      items: [
        { window: '1', tab: '1', active: '*', title: 'Home', url: 'https://a.com' },
        { window: '1', tab: '2', active: '', title: 'Docs', url: 'https://b.com' },
      ],
      notes: ['… 3 more tabs not shown'],
    });
  });
  it('friendly status output becomes a note with no items', () => {
    expect(parseRecords('Safari is not running', cols)).toEqual({ items: [], notes: ['Safari is not running'] });
  });
  it('empty output', () => {
    expect(parseRecords('', cols)).toEqual({ items: [], notes: [] });
  });
  it('single-column records', () => {
    expect(parseRecords('Finder\nSafari', ['name']).items).toEqual([{ name: 'Finder' }, { name: 'Safari' }]);
  });
  it('schema validates the parsed shape', () => {
    const schema = outputSchemaFor(cols);
    expect(schema.safeParse(parseRecords('1\t1\t*\tHome\thttps://a.com', cols)).success).toBe(true);
    expect(z.toJSONSchema(schema)).toMatchObject({ properties: { items: { type: 'array' } } });
  });
});
