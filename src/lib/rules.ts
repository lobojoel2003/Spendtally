import type { StateRules } from './types';

const modules = import.meta.glob<StateRules>('../../rules/states/*.json', {
  eager: true,
  import: 'default',
});

/** Used when a state isn't in the rules files yet. Every rule is unknown, so nothing is assumed. */
export const OTHER_STATE: StateRules = {
  code: 'OTHER',
  name: 'Another state',
  programName: 'Medically Needy / Spend-down',
  spenddownTerm: 'spend-down',
  agency: 'Your state or county Medicaid office',
  period: {
    defaultMonths: 1,
    allowedMonths: [1, 2, 3, 4, 5, 6],
    description: 'Use the period length printed on your Medicaid notice (1 to 6 months).',
  },
  submission: {
    methods: ['mail', 'fax', 'in-person'],
    payIn: null,
    description: 'Ask your caseworker how they want bills sent and whether you can pay in instead.',
  },
  rules: {
    paidBillsServiceMonthOnly: null,
    unpaidBillsCarryForward: null,
    unpaidMedicaidProviderOneMonth: null,
    premiumsCount: null,
    retroactiveMonths: null,
  },
  notes: [
    'Keep every medical bill and receipt, even small pharmacy receipts.',
    'Write your Medicaid ID number on every page you send.',
  ],
  sources: [
    {
      title:
        'Medicare Interactive: Spend-down program for people with incomes over the Medicaid limit',
      url: 'https://www.medicareinteractive.org/understanding-medicare/cost-saving-programs/medicare-and-medicaid/spend-down-program-for-beneficiaries-with-incomes-over-the-medicaid-limit',
    },
  ],
  lastReviewed: '2026-11-19',
  confidence: 'low',
};

export const STATES: StateRules[] = Object.values(modules).sort((a, b) =>
  a.name.localeCompare(b.name),
);

const byCode = new Map(STATES.map((s) => [s.code, s]));

export function getStateRules(code: string | undefined | null): StateRules {
  if (!code) return OTHER_STATE;
  return byCode.get(code.toUpperCase()) ?? OTHER_STATE;
}

export function hasStateRules(code: string): boolean {
  return byCode.has(code.toUpperCase());
}

export const METHOD_LABELS: Record<string, string> = {
  fax: 'Fax',
  mail: 'Mail',
  upload: 'Online upload',
  'in-person': 'In person',
  email: 'Email',
  phone: 'Phone',
};
