import { describe, expect, it } from 'vitest';
import { findAmounts, findDates, normalizeDigits, parseBillText } from '../../src/lib/ocr/parse';

const today = '2026-11-19';

const HOSPITAL_STATEMENT = `
MERCY GENERAL HOSPITAL
1200 Harbor Ave, Albany, NY 12208
PATIENT STATEMENT
Statement Date: 11/14/2026
Patient: Rose Alvarez          Account #: 448812
Date of Service: 10/28/2026
Description                         Charges
Emergency room visit                $1,480.00
Lab work                              $212.40
Insurance payments                 -$1,301.12
Patient Responsibility               $391.28
Amount Due: $391.28    Due Date: 12/05/2026
Please detach and return with your payment
`;

const PHARMACY_RECEIPT = `
Walgreens #04412
45 State St
Albany NY 12207
RX# 2291184  Filled 11/03/26
ATORVASTATIN 20MG TAB
Copay                 12.50
Subtotal              12.50
Tax                    0.00
TOTAL                 12.50
VISA ****4421         12.50
Approved  Auth Code 08812
Thank you
`;

const DOCTOR_BILL = `
Hudson Valley Cardiology Associates, PC
Make checks payable to: Hudson Valley Cardiology Associates
Statement date November 10, 2026
DOB: 03/14/1951
DOS        Procedure                Charge     Ins Paid    Balance
10/02/2026 Office visit, est        $245.00    $180.00     $65.00
10/16/2026 Echocardiogram           $890.00    $610.00     $280.00
Total balance due                                          $345.00
`;

// Real Tesseract output for tests/fixtures/sample-bill.png: side-by-side header, wrapped name.
const REAL_OCR =
  'MERCY GENERAL                 STATEMENT\n\nHOSPITAL\n\n1200 Harbor Avenue\n\nAlbany, NY 12208\n\nStatement Date: 11/14/2026\n\nPatient: Rose Alvarez Account: 448812\n\nDate of Service: 10/28/2026\n\nDescription                                                                                Charges\n\nEmergency room visit                                                           $1,480.00\n\nLab work                                                                                     $212.40\n\nInsurance payments                                                      -$1,301.12\nAmount Due:                                              $391.28\n\nDue Date: 12/05/2026 - Please detach and return with your payment\n';

describe('parseBillText', () => {
  it('reads real OCR output with a wrapped, two-column header', () => {
    const r = parseBillText(REAL_OCR, today);
    expect(r.provider?.value).toBe('Mercy General Hospital');
    expect(r.serviceDate?.value).toBe('2026-10-28');
    expect(r.amount?.value).toBe(39128);
    expect(r.status).toBe('unpaid');
  });

  it('reads a hospital statement', () => {
    const r = parseBillText(HOSPITAL_STATEMENT, today);
    expect(r.provider?.value).toBe('Mercy General Hospital');
    expect(r.serviceDate?.value).toBe('2026-10-28');
    expect(r.serviceDate?.confidence).toBeGreaterThan(0.8);
    expect(r.amount?.value).toBe(39128);
    expect(r.amount?.confidence).toBeGreaterThan(0.8);
    expect(r.status).toBe('unpaid');
    expect(r.category).toBe('hospital');
  });

  it('reads a pharmacy receipt', () => {
    const r = parseBillText(PHARMACY_RECEIPT, today);
    expect(r.provider?.value).toMatch(/Walgreens/);
    expect(r.serviceDate?.value).toBe('2026-11-03');
    expect(r.amount?.value).toBe(1250);
    expect(r.status).toBe('paid');
    expect(r.category).toBe('pharmacy');
  });

  it('reads an itemized doctor bill, skipping the birth date and statement date', () => {
    const r = parseBillText(DOCTOR_BILL, today);
    expect(r.provider?.value).toBe('Hudson Valley Cardiology Associates');
    expect(r.provider?.label).toBe('Payable to');
    expect(r.serviceDate?.value).toBe('2026-10-02');
    expect(r.dates.map((d) => d.value)).not.toContain('1951-03-14');
    expect(r.amount?.value).toBe(34500);
    expect(r.status).toBe('unpaid');
  });

  it('returns nulls for empty text', () => {
    const r = parseBillText('', today);
    expect(r.provider).toBeNull();
    expect(r.serviceDate).toBeNull();
    expect(r.amount).toBeNull();
    expect(r.status).toBeNull();
  });

  it('treats a zero balance as paid', () => {
    const r = parseBillText(
      'Lakeside Clinic\nDate of service 09/09/2026\nPayment received $40.00\nBalance due $0.00',
      today,
    );
    expect(r.status).toBe('paid');
    expect(r.amount?.value).toBe(4000);
  });
});

describe('findDates', () => {
  it('understands common formats', () => {
    expect(findDates('Service 10/28/2026').map((d) => d.value)).toEqual(['2026-10-28']);
    expect(findDates('Svc 3-7-26').map((d) => d.value)).toEqual(['2026-03-07']);
    expect(findDates('2026-04-09').map((d) => d.value)).toEqual(['2026-04-09']);
    expect(findDates('Seen on March 7th, 2026').map((d) => d.value)).toEqual(['2026-03-07']);
    expect(findDates('Visit 7 Mar 2026').map((d) => d.value)).toEqual(['2026-03-07']);
    expect(findDates('25/12/2026').map((d) => d.value)).toEqual(['2026-12-25']);
    expect(findDates('13/13/2026')).toEqual([]);
  });

  it('skips future dates and corrects OCR digit slips', () => {
    const r = parseBillText(
      'Clinic\nDate of service: l0/O2/2026\nNext appointment 01/05/2027\nAmount due $20.00',
      today,
    );
    expect(r.serviceDate?.value).toBe('2026-10-02');
    expect(normalizeDigits('1O/2l/2O26')).toBe('10/21/2026');
  });
});

describe('findAmounts', () => {
  it('finds money but not ZIP codes or percentages', () => {
    expect(findAmounts('Albany NY 12208').map((a) => a.value)).toEqual([]);
    expect(findAmounts('Coinsurance 20.00%').map((a) => a.value)).toEqual([]);
    expect(findAmounts('Total $1,480.00 and 12.40').map((a) => a.value)).toEqual([148000, 1240]);
    expect(findAmounts('Due $45').map((a) => a.value)).toEqual([4500]);
  });
});
