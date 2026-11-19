# Spendtally state spend-down data: research notes

Last reviewed: 2026-11-19

## How this was researched (read first)

- Direct page fetching was blocked in this session. Every host tried failed DNS resolution: medicareinteractive.org, bplc.cssny.org, hca.wa.gov, mydss.mo.gov, kff.org, triagecancer.org. Nothing was downloaded or read in full.
- All facts come from a web-search tool. It returns page titles, URLs and short excerpts or summaries of indexed pages. Text marked "quote" below is the wording the search tool returned for that page. It could not be checked against the live page. Treat it as close to verbatim, not certified verbatim, and re-check before quoting publicly.
- Where a state source said nothing about premiums, `premiumsCount` is `true` based on federal law. 42 CFR 435.831(e)(1) requires medically needy programs to deduct "Medicare and other health insurance premiums, and deductibles or coinsurance charges". Those states list the eCFR page in `sources`. Missouri is a 209(b) spend-down state, not a medically needy state, so its value is left `null`.
- `retroactiveMonths` is 3 everywhere it is set, which is the rule as of today. Federal H.R. 1 (2025), section 71112, cuts retroactive coverage to 2 months for people who are aged, blind or disabled, for applications filed on or after 2027-01-01 (sources: Justice in Aging, https://justiceinaging.org/hr1-reduces-medicaid-retroactive-eligibility-starting-in-2027/; NY Health Access, https://nyhealthaccess.org/entry/46/). The app should change this value to 2 for applications from January 2027, or show a warning. Only NY.json mentions it in `notes`.
- Fields left `null` mean the search did not confirm the fact. They do not mean the answer is "no".
- To re-verify: allow those hosts in the session's network settings and re-check each state's `sources`. Low and medium confidence states should go first.

## States covered (33)

AR, CA, CT, DC, FL, GA, HI, IA, IL, KS, KY, LA, MA, MD, ME, MI, MN, MO, MT, NC, ND, NE, NH, NJ, NY, PA, RI, UT, VA, VT, WA, WI, WV

Confidence:
- high (12): CT, FL, IL, MI, MO, NC, NY, UT, VA, VT, WA, WI
- medium (20): AR, CA, DC, GA, IA, KS, KY, LA, MA, MD, ME, MN, MT, ND, NE, NH, NJ, PA, RI, WV
- low (1): HI

## States excluded and why

- **TN (Tennessee):** KFF's 2026 table lists Tennessee's medically needy pathway as covering only pregnant people and children. Adults can get the TennCare "Standard Spend Down" demonstration, but enrollment is capped (target 100,000, maximum 105,000). Applications are taken only during occasional call-in windows that close after a set number of calls, and approved people get 12-month eligibility. It is effectively closed to new enrollees most of the time, and it is not a recurring monthly or periodic spend-down. Source: Tenn. Comp. R. & Regs. 1200-13-14 (Jan 2026), https://publications.tnsosfiles.com/rules/1200/1200-13/1200-13-14.20260126.pdf
- **TX (Texas):** The medically needy pathway covers only pregnant people and children (KFF 2026 table).
- **IN (Indiana):** Spend-down ended for people living in the community on June 1, 2014 (Indiana FSSA stakeholder FAQ, https://www.in.gov/medicaid/members/files/StakeholderMeetingFAQ_Final.pdf).
- **OH (Ohio):** The spend-down program ended on August 1, 2016 (https://hcjfs.org/spend-down-medicaid-program-ending). One AI-written secondary site (brevy.com) says an "ABD spend-down" still exists. No official source supports that, so it was ignored.
- **OK (Oklahoma):** No medically needy pathway for older or disabled adults in KFF or the other lists found. The only Oklahoma "spenddown" language found is in long-term-care rules (OAC 317:35-9-1). Whether Oklahoma is still a 209(b) state, which would require a spend-down, was not confirmed. Worth a second look.
- **All other states** (AL, AK, AZ, CO, DE, ID, MS, NV, NM, OR, SC, SD, WY): No medically needy pathway in KFF's 2026 "Medicaid Eligibility for Medically Needy Populations" table (https://www.kff.org/medicaid/state-indicator/medicaid-eligibility-through-the-medically-needy-pathway/). Missouri is also missing from that table but was added as a 209(b) spend-down state.

## Conflicts with KFF's table

The search tool's reading of KFF's 2026 budget-period column was partly garbled. Where it disagreed with a state's own rules, the state's own source was used:
- **DC:** The current DHCF page says community spend-down uses a one-month budget period and long-term care uses six months. Older DHCF fact sheets describe January–June and July–December periods. One month was used.
- **RI:** The search reading of KFF said 1 month, but 210-RICR-40-05-2 says six months. Six was used.
- **GA:** KFF said 6 months, but PAMMS 2150 says "each month is a separate budget period" within a six-month review. One month was used. KFF's 2026 table also seems to mark Georgia as not covering seniors and people with disabilities under medically needy. Georgia's own manual has an active "ABD Medically Needy" class (PAMMS 2150), so Georgia was kept at medium confidence.
- **FL and NY:** The search reading of KFF said "annually", but both state sources describe monthly amounts. Monthly was used.
- **IA:** KFF says "other". Iowa HHS describes a two-month certification period, so `allowedMonths` is `[2]`.

## Other things worth knowing

- **Pay-in exists (7 states):** IL, MN, MO, MT, NY, UT, WI. Wisconsin calls it "prepayment", and anyone can make it. Hawaii's waiver also allows an "enrollment fee equal to the spend-down obligation", but how it works for members was not confirmed, so HI `payIn` is `null`.
- **Paid bills counted by date paid, not date of care:** CA ("receipts can only be used ... in the month in which the bills were paid"), MA and VT (paid during the period), FL and GA (paid this month or recently). For these, `paidBillsServiceMonthOnly` is `false`.
- **Providers do most of the work:** In CA, IA, MN, ND and NE, providers usually report or bill the spend-down for you. CA uses Share of Cost clearance. IA providers send claims to Iowa Medicaid. MN and ND take the spend-down off claims. NE uses a monthly provider form. People mostly hand in bills from non-Medicaid providers or old bills themselves.
- **MO carryover window:** Bills from the current month or the 3 months before can be applied to the current month or the next 3 months.

## General rules (quotes from the four sources the owner cited, plus closely related official text)

### 1. Spend-down period length (1–6 months)

- Medicare Interactive, quote: "Your spend-down amount will be the difference between your income and the Medicaid eligibility limit, as determined by your state over a given length of time (one to six months)." https://www.medicareinteractive.org/understanding-medicare/cost-saving-programs/medicare-and-medicaid/spend-down-program-for-beneficiaries-with-incomes-over-the-medicaid-limit
- Medicare Rights Center NY handout, quote: "If you do not meet your spend-down amount, you will not have Medicaid coverage for that month." https://www.medicareinteractive.org/wp-content/uploads/Medicaid-Spend-Down-NY.pdf
- Washington (the HCA webinar FAQ itself could not be retrieved, so these come from the state rule and program pages). Search-tool summary of WAC 182-519-0110: a person "may pick a three-month or six-month base period". DSHS, paraphrased: if you do not choose, the default base period is 6 months. https://apps.leg.wa.gov/wac/default.aspx?cite=182-519-0110 and https://www.dshs.wa.gov/esa/community-services-offices/spenddown
- Missouri, quote: "you will not have MO HealthNet coverage for the months that you do not pay or reach your spend down." https://mydss.mo.gov/spend-down

### 2. Submitting bills vs. paying monthly (pay-in)

- Medicare Interactive, quote: "Some states require you to submit receipts or bills to Medicaid to show your monthly expenses. Other states may let you pay a monthly premium directly to Medicaid for the amount that your income is over your state's Medicaid spend-down level." (URL above)
- New York (NYS Office for the Aging HIICAP Notebook 2026, Module 14). Quote: the person "pays the spenddown amount to the district, up to six months at a time." On bills, quote: the person "must submit medical bills for these services -- paid or unpaid -- to the social services district Medicaid office one month at a time", and "there will be a gap in coverage each month while the Medicaid office processes the medical bills." https://aging.ny.gov/system/files/documents/2026/04/hiicap-notebook-2026-module-14-medicaid.pdf
- CSS "Best Practices for Medicaid Spenddown" (https://bplc.cssny.org/files/attachment/d68a9d7d-821b-4ae3-95ae-d09553c2fa11/Best%20Practices%20for%20Medicaid%20Spenddown.pdf): the contents could not be retrieved. The search tool only confirmed that it gives the NYC Centralized Surplus Unit fax number 917-639-0645 and points to the MAP-931y Surplus Fax cover sheet (https://www.nyc.gov/assets/hra/downloads/pdf/MAP-931y-E-Surplus-Fax-Medical-Bills.pdf).
- Missouri, quotes: "You can have your payment taken directly out of your bank account on the 10th of each month and it will give you coverage for the next month." Bills instead: "If you cannot meet your spend down for a particular month, you can combine medical bills from different months. This is called carryover." Paraphrased: you can choose a different method each month, and paying online starts coverage the day after payment. https://mydss.mo.gov/spend-down
- Washington: no pay-in option was found. Search-tool summary of the DSHS page: receipts and bills are mailed to DSHS CSD Customer Service Center, P.O. Box 11699, Tacoma, WA 98411-6699, or brought to a Community Services Office. https://www.dshs.wa.gov/esa/community-services-offices/spenddown

### 3. Paid bills count only in the month of service

- None of the four cited sources, as returned by search, states this rule directly.
- New York DOH, paraphrased by the search tool: for current enrollees, only current bills may be used, and they must be incurred in the same month coverage is sought. For new applicants, paid bills must have been incurred and paid in the 3 months before the application month. https://www.health.ny.gov/health_care/medicaid/excess_income.htm
- Michigan states it plainly. MDHHS deductible Q&A, quote: the specialist "can use paid bills to establish eligibility only for the month you received the service; can use unpaid bills to establish eligibility for any month; will use the oldest unpaid bills first." https://www.michigan.gov/-/media/Project/Websites/mdhhs/Folder1/Folder40/617_medicaid_decuct.pdf
- Washington DSHS, quote: "Bills used to meet your spenddown must show a statement date within the current base period and show the original date of service and provider name." Also: "Bills do not have to be paid to be applied to your spenddown, just show the expenses that are owed."

### 4. An unpaid bill from a Medicaid provider activates coverage for only one month

- This rule was not found in any source the search tool could reach. The CSS "Best Practices" PDF, which the owner says documents it, could not be read. NY.json sets `unpaidMedicaidProviderOneMonth: true` on the owner's word, backed by the NY sources below. Every other state is `null`.
- Closest supporting NY text. NY Health Access / Selfhelp guide, paraphrased: for outpatient care, once bills equal one month's excess income, the spend-down is met and Medicaid covers the rest of that month's bills. That is why a Medicaid provider's unpaid bill gets "used up". NY Health Access, quote: "give the provider (if a Medicaid provider) your CIN. Ask them to bill Medicaid for covered services." https://nyhealthaccess.org/entry/46/
- NY DOH, paraphrased: "Once you have enough bills to meet your excess income, Medicaid will only pay medical bills from a doctor, pharmacist, or other provider who is in the New York State Medicaid program." https://www.health.ny.gov/health_care/medicaid/excess_income.htm

### 5. The part of a bill used for the spend-down is not covered by Medicaid

- Medicare Rights Center NY handout, quote: "Medicaid will pay second for qualifying costs, such as Medicare cost-sharing (excluding the amount you spent out of pocket to get Medicaid)." https://www.medicareinteractive.org/wp-content/uploads/Medicaid-Spend-Down-NY.pdf
- NY Health Access, quote: "Bills for services 3 or more months prior to your Medicaid activation and that your provider is still seeking payment of are called Viable Bills. While you can submit these bills to Medicaid to satisfy your spenddown, Medicaid will not pay these bills and you still owe the money to your provider." https://nyhealthaccess.org/entry/246/
- Missouri, quote: "You remain responsible for paying the providers for the bills you submit." https://mydss.mo.gov/spend-down
- Washington DSHS, paraphrased: the bills you submit go to DSHS, which does not pay them. https://www.dshs.wa.gov/esa/community-services-offices/spenddown
- Massachusetts regulation (130 CMR 520.000), quote: "the bills submitted to meet the deductible are the responsibility of the individual and cannot be submitted for MassHealth agency payment." https://www.mass.gov/doc/130-cmr-520000-masshealth-financial-eligibility-0/download
- Kansas, paraphrased: once the spenddown is met, providers can bill KanCare, but the bills used to meet it are still yours to pay.

### Federal backstop

- 42 CFR 435.831, search-tool summary. The agency "must deduct from income medical expenses incurred by the individual or family or financially responsible relatives that are not subject to payment by a third party". Required deductions include "Medicare and other health insurance premiums, and deductibles or coinsurance charges". Unpaid expenses from before the current budget period can be deducted if they were "not previously deducted" and "remain unpaid". CMS guidance (https://www.medicaid.gov/resources-for-states/downloads/macpro-ig-handling-excess-income-spenddown.pdf), paraphrased: an expense must be carried over for as long as it is still owed and has not been used. https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-435/subpart-I
