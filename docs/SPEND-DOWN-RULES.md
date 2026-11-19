# How Spendtally models a spend-down

This page explains the rules behind the ledger in [`src/lib/engine.ts`](../src/lib/engine.ts) and the warnings in [`src/lib/warnings.ts`](../src/lib/warnings.ts). It is written for contributors and curious users. It is **not legal advice**. Your Medicaid office makes the final decision.

## The basics

A spend-down (also called _medically needy_, _excess income_, _surplus_, _share of cost_ or a _Medicaid deductible_) lets someone whose income is a little over the Medicaid limit qualify anyway. The amount over the limit works like a deductible. Once medical bills for a **period** add up to it, Medicaid covers the rest of that period.

- The **period** (budget or base period) is 1 to 6 months, depending on the state. Some states let the person choose (Washington: 3 or 6 months; New York and New Hampshire: 1 or 6).
- The **amount** is on the person's notice. In Spendtally it can be entered per month (multiplied by the period length) or for the whole period.
- Bills are usually **sent** to the agency. Some states also accept a **pay-in**: paying the amount directly.

Sources: [Medicare Interactive](https://www.medicareinteractive.org/understanding-medicare/cost-saving-programs/medicare-and-medicaid/spend-down-program-for-beneficiaries-with-incomes-over-the-medicaid-limit), [CSS New York: Best Practices for Medicaid Spenddown (2026)](https://bplc.cssny.org/files/attachment/d68a9d7d-821b-4ae3-95ae-d09553c2fa11/Best%20Practices%20for%20Medicaid%20Spenddown.pdf), [Washington HCA spenddown FAQ](https://hca.wa.gov/assets/free-or-low-cost/spenddown-webinar-faq.pdf), [Missouri DSS](https://mydss.mo.gov/spend-down), and [42 CFR 435.831](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-435/subpart-I/section-435.831).

## Rules the ledger applies

| #   | Rule                                                                                 | How Spendtally handles it                                                                                                                             | State flag                                                                                                    |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **Paid bills count only in the month of service.**                                   | A paid bill is only ever applied to the period that contains its date of service. Anything left over expires.                                         | `paidBillsServiceMonthOnly` (when `false`, a paid bill counts in the month it was **paid**, as in California) |
| 2   | **Unpaid bills still owed can carry forward.**                                       | Leftover unpaid balances go into a carry-over pool used by later periods, oldest first. Unpaid bills dated before the first period start in the pool. | `unpaidBillsCarryForward` (`false` turns the pool off)                                                        |
| 3   | **Medicaid pays the rest once the spend-down is met.**                               | In a met period, unpaid bills from providers that take Medicaid are marked _Medicaid may pay $X_ and closed.                                          | —                                                                                                             |
| 4   | **An unpaid bill from a Medicaid provider turns coverage on for one month only.**    | After such a bill helps meet a period, it is closed (`one-month-rule`), even if it came from the carry-over pool.                                     | `unpaidMedicaidProviderOneMonth`                                                                              |
| 5   | **The part of a bill used for the spend-down is not covered.**                       | Every bill shows "$X is your share", and the packet footnote says so.                                                                                 | —                                                                                                             |
| 6   | **Each bill counts once.**                                                           | "I sent it" stores a submission that locks each bill's counted amount to that period. Later periods only see what is left.                            | —                                                                                                             |
| 7   | **Bills from non-Medicaid providers still count**, but Medicaid will never pay them. | They are used before Medicaid-provider bills, and a warning explains that the person keeps owing them.                                                | —                                                                                                             |

### Order of use inside a period

1. Amounts already **sent** for this period (locked).
2. **Paid** bills from this period, by date. They expire if unused.
3. **Unpaid** bills from this period from providers that don't take Medicaid, or might not.
4. **Carried-over** unpaid balances, oldest first.
5. **Unpaid** bills from this period from **Medicaid providers**. Using these last lets Medicaid pay them once the period is met.

This order keeps as much value as possible for the person. Agencies may apply bills in a different order, so the app labels its numbers as estimates.

## Warnings

| Code                        | When                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `unpaid-medicaid-one-month` | Unpaid bill from a Medicaid provider (if the state has the one-month rule) |
| `non-medicaid-provider`     | Provider does not take Medicaid                                            |
| `unknown-provider`          | Medicaid status not known                                                  |
| `spenddown-portion`         | Part of the bill was counted, so that part is the person's to pay          |
| `medicaid-may-pay`          | Period met, so Medicaid may pay the remainder                              |
| `paid-other-month`          | Paid in a different month than the care                                    |
| `before-first-period`       | Paid bill dated before the first tracked period                            |
| `future-date`               | Date of service after today                                                |
| `duplicate`                 | Same provider, date and amount as another bill                             |
| `no-copy`                   | No photo or PDF attached                                                   |

## Retroactive coverage changes in 2027

Federal H.R. 1 (2025), section 71112, shortens retroactive Medicaid coverage for applications filed on or after **January 1, 2027**. People who are 65 or older, blind or disabled can get up to **two** months instead of three ([Justice in Aging](https://justiceinaging.org/hr1-reduces-medicaid-retroactive-eligibility-starting-in-2027/)). The state files list `retroactiveMonths: 3`, the rule for applications made before then. The in-app guide explains the change.

## State rules files

Each `rules/states/XX.json` file follows [`rules/schema.json`](../rules/schema.json). `null` means **not confirmed**, never "no". Every file lists its sources, a `lastReviewed` date and a `confidence` level. Research notes, including excluded states and conflicting sources, are in [`docs/research/state-rules-notes.md`](research/state-rules-notes.md).
