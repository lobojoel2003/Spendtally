import { describe, expect, it } from 'vitest';
import { parseHash } from '../../src/lib/router';

describe('parseHash', () => {
  it.each([
    ['', 'home', {}],
    ['#/', 'home', {}],
    ['#/bills', 'bills', {}],
    ['#/bills/abc', 'bill', { id: 'abc' }],
    ['#/add', 'add', {}],
    ['#/packet', 'packet', {}],
    ['#/packet/2026-11', 'packet', { period: '2026-11' }],
    ['#/settings', 'settings', {}],
    ['#/help', 'help', {}],
    ['#/welcome', 'welcome', {}],
    ['#/nope', 'notfound', {}],
  ])('%s → %s', (hash, name, params) => {
    const r = parseHash(hash);
    expect(r.name).toBe(name);
    expect(r.params).toEqual(params);
  });

  it('reads query parameters', () => {
    expect(parseHash('#/?period=2026-10').query.get('period')).toBe('2026-10');
  });
});
