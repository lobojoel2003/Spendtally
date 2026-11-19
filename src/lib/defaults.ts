import { monthKeyOf } from './dates';
import type { Bill, Profile, Settings } from './types';
import { newId } from './id';

export const EMPTY_PROFILE: Profile = {
  fullName: '',
  medicaidId: '',
  caseNumber: '',
  dateOfBirth: '',
  phone: '',
  address: '',
  agencyName: '',
  agencyFax: '',
  caseworker: '',
};

export function defaultSettings(now = new Date()): Settings {
  return {
    onboarded: false,
    stateCode: '',
    spenddownCents: 0,
    amountBasis: 'month',
    periodMonths: 1,
    periodAnchor: monthKeyOf(now),
    profile: { ...EMPTY_PROFILE },
    theme: 'system',
    textSize: 'normal',
  };
}

/** Fills in any field a stored or imported settings object is missing. */
export function normalizeSettings(raw: Partial<Settings> | undefined, now = new Date()): Settings {
  const base = defaultSettings(now);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    profile: { ...EMPTY_PROFILE, ...(raw.profile ?? {}) },
  };
}

export function newBill(partial: Partial<Bill> = {}): Bill {
  const now = new Date().toISOString();
  return {
    id: newId('bill'),
    provider: '',
    serviceDate: '',
    amountCents: 0,
    status: 'unpaid',
    medicaidProvider: 'unknown',
    category: 'doctor',
    notes: '',
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}
