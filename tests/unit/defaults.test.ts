import { describe, expect, it } from 'vitest';
import { defaultSettings, newBill, normalizeSettings } from '../../src/lib/defaults';
import { newId } from '../../src/lib/id';

describe('defaults', () => {
  it('starts in the current month, not onboarded', () => {
    const s = defaultSettings(new Date(2026, 10, 19));
    expect(s.periodAnchor).toBe('2026-11');
    expect(s.onboarded).toBe(false);
  });

  it('fills missing fields from older or imported settings', () => {
    const s = normalizeSettings({ stateCode: 'NY', profile: { fullName: 'A' } as never });
    expect(s.stateCode).toBe('NY');
    expect(s.profile.fullName).toBe('A');
    expect(s.profile.medicaidId).toBe('');
    expect(s.textSize).toBe('normal');
  });

  it('creates bills with unique ids', () => {
    expect(newBill().id).not.toBe(newBill().id);
    expect(newId('x')).toMatch(/^x_[a-z0-9]+$/);
  });
});
