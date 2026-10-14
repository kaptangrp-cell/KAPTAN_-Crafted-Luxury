# KAPTAN Finance: architecture review and implementation contract

Reviewed 15 October 2026, before finance production code. Owner confirmed no previous records/mapping, EÜR and calendar financial year 2026. Single German sole proprietorship; EUR functional currency; §19 status as supplied by owner. Not a certified accounting system.

## Existing integration points and risks

- React/TanStack Start, Supabase Auth/PostgreSQL and Vercel remain. Finance uses the existing bearer-auth middleware and a separate `/finance` workspace. No Lovable backend is introduced. Existing Lovable build/auth packages must be reviewed separately before removal to avoid breaking login.
- `payments/checkout.server.ts`, `stripe-webhook.server.ts` and the settlement RPC verify provider bindings/amounts before paid-order creation. Legacy payments use another path. An order status alone does not prove a refund, fee or bank settlement. These need distinct verified provider events.
- `invoices` archives immutable source snapshots, generated XML/PDF and validation. Advance/final/credit are different documents for one economic sale: never sum their totals as revenue. Existing invoice worker requires Java/KoSIT and has no confirmed production host.
- `inventory_units` and `inventory_events` preserve serialized variant movement but have no historical landed costs. Current `products.cost_price` is not historical COGS. Opening inventory and cash balances require verified source documents even if there are no old bookkeeping records.
- `admin-analytics.ts` uses current product costs and order totals. It remains operational analytics, not financial statements. Existing number arithmetic is not reused for ledger calculations.
- Existing admin-only routes would exclude accountants or give them too much store access. Finance membership is separate from profile/store and warehouse roles. Existing admin is the owner authority.
- Cancellation does not necessarily mean refund. Dispatch is not necessarily the contractual revenue recognition point. Returns require inspection and cost restoration, distinct from cash refunds.
- Existing service-role credentials must never reach the browser. Migration credentials are not present in this workspace. New migrations can be tested locally but production application requires an authorized database deployment.

## Data model

Foundation: `finance_members`, `finance_settings`, `finance_accounts`, `finance_periods`, `finance_journals`, `finance_lines`, `finance_audit`. Values are integer EUR cents (`bigint`), returned to JavaScript as decimal strings. Journals have unique external keys and immutable source JSON; balanced posting occurs atomically through a guarded RPC. Drafts are append-only submissions: corrections create a new draft, not edits to posted history. Reversal references the original and swaps every debit/credit. Period posting/closing uses the same row lock. Owner/accountant can post; finance staff submit drafts; auditors read. Only owner manages membership and reopens periods, with a reason.

Next migrations: private `finance-documents` bucket plus document metadata/hashes and extraction versions; outbox events with immutable payload and unique provider event IDs, retry attempts and review status; invoice/payment allocations; suppliers/customers/cost centers; cash-basis tax facts linked to journal/source and actual payment; bank imports/statement lines/matches; import shipments/FX/components/allocations; serial-unit cost layers; tax rules/effective periods and closing checks. Do not silently default unknown amounts, tax classifications or costs to zero.

Internal accounts use descriptive codes, not purported SKR codes. Verified accountant mappings will be versioned separately. Management inventory uses specific identified serial-unit landed costs where available; nonserialized valuation method remains a documented owner/accountant choice.

## Posting contract (debit → credit)

| Event | Management ledger | EÜR handling |
|---|---|---|
| Cart/unpaid order | No posting | None |
| Verified customer prepayment | Provider clearing → customer advances | Receipt fact with statutory category/review |
| Supply recognized, §19 | Advances/receivable → goods and shipping revenue | No second receipt |
| Provider payout | Bank + separately evidenced fees → clearing | Gross receipt/fee facts, no duplicate income |
| Supplier goods invoice | Inventory → payable; nonrecoverable tax included in cost | Payment tracked separately; no duplicate COGS deduction |
| Costed goods dispatched/sold | COGS → inventory at immutable unit cost | Management-only adjustment |
| Supplier payment | Payable → bank | Expense/capital asset category subject to EÜR rules |
| Refund | Linked correction plus actual cash/clearing movement | Actual repayment fact; not mere status change |
| Inspected saleable return | Inventory → COGS at original unit cost | No invented cash movement |
| Owner contribution/draw | Bank → capital / drawings → bank | Neither turnover nor operating expense |
| Correction | Exact reversal + reviewed replacement | Linked dated correction, no history rewrite |

Regular VAT requires an effective-dated rule and evidence; qualifying §19 sales are exempt, not zero-rated. Non-deductible input/import VAT belongs to cost/asset as applicable. Import allocation uses integer largest-remainder apportionment with stable tie-breaking; foreign-currency conversion stores original units and rational rate/date/source. Missing evidence queues review rather than automated posting. Recognition and cash-tax categorization require accountant signoff before automated posting is enabled.

## Delivery sequence and gates

1. Foundation: schema, roles/RLS, exact money helpers, balanced/idempotent posting, reversal, period locks, audit, integration tests, secure workspace. No historical auto-backfill.
2. Documents/expenses + transactional event capture, verified payment/supply processors and exception queue; basic dashboard using ledger only. Test real provider sandbox lifecycle before enabling automatic posting.
3. Cost layers/import allocation, bank CSV then CAMT, reconciliations, statements derived from ledger. Missing opening balances make statements provisional.
4. EÜR schedules, effective-dated tax thresholds, structured invoice receiving/validation, retention classifications, closing and evidence exports. No automatic ELSTER filing.
5. Reporting/export packages, budgets/forecasts, optional authorized-data assistant. DATEV mapping only after test import and verification.

## Official references and review boundaries

- [§19 UStG](https://www.gesetze-im-internet.de/ustg_1980/__19.html): exemption and turnover rules; annual turnover is not simply all bank credits.
- [BMF 18 March 2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-03-18-sonderregelung-kleinunternehmer.pdf): revised Kleinunternehmer application; first-year threshold must be distinguished from subsequent-year thresholds.
- [§4 EStG](https://www.gesetze-im-internet.de/estg/__4.html): EÜR eligibility and special treatment; EÜR is not the accrual GuV.
- [§147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html): retention differs by record type (10/8/6 years), with extensions and audit/legal holds. No automated deletion in initial release.
- [§34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html) and [BMF E-Rechnung FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html): invoice rules; B2G routing/acceptance separately verified.
- [GoBD amendment 14 July 2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf): original data and machine-readable access remain part of operational procedures.

Professional review still required: opening assets/liabilities, eligibility/turnover exclusions, payment receipt timing, supply recognition, asset depreciation, EU/reverse-charge/import obligations, statutory reporting applicability, retention/restore procedures. No estimated personal income tax without personal assumptions and validated rates. No GoBD certification or successful tax submission is asserted.
