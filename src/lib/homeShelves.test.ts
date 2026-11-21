import { describe, expect, it } from 'vitest';
import { parseShelfLimit, shelfKeyFor, shelvesToShow } from './homeShelves';

describe('home shelves', () => {
  it('keys a shelf by its node', () => {
    expect(shelfKeyFor('abc')).toBe('shelf:abc');
  });
  it('reads the books limit: empty means all, 1 to 60 otherwise', () => {
    expect(parseShelfLimit('')).toBeNull();
    expect(parseShelfLimit('  ')).toBeNull();
    expect(parseShelfLimit('12')).toBe(12);
    expect(parseShelfLimit('60')).toBe(60);
    expect(parseShelfLimit('0')).toBe('invalid');
    expect(parseShelfLimit('61')).toBe('invalid');
    expect(parseShelfLimit('-3')).toBe('invalid');
    expect(parseShelfLimit('3.5')).toBe('invalid');
    expect(parseShelfLimit('اثنين')).toBe('invalid');
  });
  it('draws the shelves that are on and point at a node the website can show, in order', () => {
    const rows = [
      { section_key: 'shelf:c', node_id: 'c', visible: true, sort_order: 2 },
      { section_key: 'shelf:a', node_id: 'a', visible: true, sort_order: 0 },
      { section_key: 'shelf:off', node_id: 'off', visible: false, sort_order: 1 },
      { section_key: 'shelf:gone', node_id: 'gone', visible: true, sort_order: 3 },
      { section_key: 'shelf:none', node_id: null, visible: true, sort_order: 4 },
    ];
    expect(shelvesToShow(rows, new Set(['a', 'c', 'off'])).map((r) => r.node_id)).toEqual(['a', 'c']);
  });
});
