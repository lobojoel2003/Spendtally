/** A calendar month, formatted `YYYY-MM`. */
export type MonthKey = string;
/** A calendar date, formatted `YYYY-MM-DD`. */
export type ISODate = string;

export type BillStatus = 'paid' | 'unpaid';
export type TriState = 'yes' | 'no' | 'unknown';

export type BillCategory =
  | 'doctor'
  | 'hospital'
  | 'pharmacy'
  | 'dental'
  | 'vision'
  | 'lab'
  | 'therapy'
  | 'equipment'
  | 'transport'
  | 'premium'
  | 'home-care'
  | 'other';

export interface OcrSnapshot {
  text: string;
  confidence: number;
  detected: { provider: boolean; serviceDate: boolean; amount: boolean };
}

export interface Bill {
  id: string;
  provider: string;
  /** Date the care or item was received (not the statement date). */
  serviceDate: ISODate;
  /** What you paid, or still owe, after insurance. Integer cents. */
  amountCents: number;
  status: BillStatus;
  paidDate?: ISODate | undefined;
  /** Does this provider accept Medicaid? */
  medicaidProvider: TriState;
  category: BillCategory;
  notes: string;
  attachmentIds: string[];
  ocr?: OcrSnapshot | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  billId: string;
  mime: 'image/jpeg' | 'application/pdf';
  name: string;
  blob: Blob;
  thumb?: Blob | undefined;
  width?: number | undefined;
  height?: number | undefined;
  createdAt: string;
}

export interface Profile {
  fullName: string;
  medicaidId: string;
  caseNumber: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  agencyName: string;
  agencyFax: string;
  caseworker: string;
}

export type AmountBasis = 'month' | 'period';
export type ThemePref = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';

export interface Settings {
  onboarded: boolean;
  stateCode: string;
  /** The spend-down amount from your notice. Integer cents. */
  spenddownCents: number;
  /** Whether `spenddownCents` is per month or for the whole period. */
  amountBasis: AmountBasis;
  periodMonths: number;
  /** First month of a spend-down period. Other periods tile forward and back from here. */
  periodAnchor: MonthKey;
  profile: Profile;
  theme: ThemePref;
  textSize: TextSize;
}

/** A packet the person marked as sent. Locks how bills were counted for that period. */
export interface Submission {
  id: string;
  periodKey: MonthKey;
  createdAt: string;
  /** Bill id → cents counted toward this period's spend-down. */
  applied: Record<string, number>;
  billIds: string[];
  totalCents: number;
  method: string;
}

export type SubmissionMethod = 'fax' | 'mail' | 'upload' | 'in-person' | 'email' | 'phone';

export interface StateRules {
  code: string;
  name: string;
  programName: string;
  spenddownTerm: string;
  agency: string;
  period: {
    defaultMonths: number;
    allowedMonths: number[];
    description: string;
  };
  submission: {
    methods: SubmissionMethod[];
    payIn: boolean | null;
    description: string;
  };
  rules: {
    paidBillsServiceMonthOnly: boolean | null;
    unpaidBillsCarryForward: boolean | null;
    unpaidMedicaidProviderOneMonth: boolean | null;
    premiumsCount: boolean | null;
    retroactiveMonths: number | null;
  };
  notes: string[];
  sources: { title: string; url: string }[];
  lastReviewed: string;
  confidence: 'high' | 'medium' | 'low';
}
