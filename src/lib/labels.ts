import type { BillCategory } from './types';

export const CATEGORY_LABELS: Record<BillCategory, string> = {
  doctor: 'Doctor visit',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  dental: 'Dental',
  vision: 'Vision / eyeglasses',
  lab: 'Lab or imaging',
  therapy: 'Therapy',
  equipment: 'Medical equipment',
  transport: 'Medical transport',
  premium: 'Insurance premium',
  'home-care': 'Home care',
  other: 'Other medical',
};

export const SOURCE_LABELS = {
  submitted: 'Sent',
  paid: 'Paid',
  unpaid: 'Unpaid',
  carried: 'Carried over',
} as const;
