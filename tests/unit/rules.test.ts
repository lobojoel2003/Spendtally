import { describe, expect, it } from 'vitest';
import { OTHER_STATE, STATES, getStateRules, hasStateRules } from '../../src/lib/rules';

describe('state rules', () => {
  it('loads every state file, sorted by name', () => {
    expect(STATES.length).toBeGreaterThan(30);
    const names = STATES.map((s) => s.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it('includes the states named in the project brief', () => {
    for (const code of ['NY', 'WA', 'MO']) expect(hasStateRules(code)).toBe(true);
  });

  it('models New York’s one-month rule and pay-in option', () => {
    const ny = getStateRules('ny');
    expect(ny.rules.unpaidMedicaidProviderOneMonth).toBe(true);
    expect(ny.submission.payIn).toBe(true);
    expect(getStateRules('WA').period.allowedMonths).toEqual([3, 6]);
  });

  it('falls back to a neutral rule set', () => {
    expect(getStateRules('ZZ')).toBe(OTHER_STATE);
    expect(getStateRules(undefined)).toBe(OTHER_STATE);
    expect(Object.values(OTHER_STATE.rules).every((v) => v === null)).toBe(true);
  });

  it('keeps every default period inside the allowed list', () => {
    for (const s of STATES) expect(s.period.allowedMonths).toContain(s.period.defaultMonths);
  });
});
