# Finance increment: suppliers, incoming invoices and fixed assets

Implemented locally on 15 October 2026. This is not a claim that the full ERP brief is complete, deployed or legally certified.

## Access and use

- **Finance → Suppliers & years**: maintain supplier details and archive inactive suppliers. Staff may maintain active records; owner/accountant may archive. Saving checks the revision so simultaneous edits cannot silently overwrite each other. Owners can create twelve monthly periods for another calendar year without reopening existing locked periods.
- **Finance → Documents**: open a preserved original and select structured extraction. Supported sources are UBL Invoice/CreditNote XML, CII XML, or recognized embedded XML from a PDF. A plain scanned PDF requires manual review. Extraction supplies editable suggestions, never a posting or a legal-validation claim. The expense form also offers saved supplier names.
- The original remains unchanged. XML extraction rejects DTDs/entities, ambiguous critical fields, malformed amounts, mismatched currencies and invalid dates. Unsupported currencies, credits and foreign suppliers are not copied into the domestic EUR expense form.
- The local KoSIT worker checks extracted XML against its pinned XRechnung configuration and retains the exact report. The screen distinguishes queued, processing, accepted, rejected and infrastructure errors. An error may be retried; a rejected original retains its report. This does not certify every ZUGFeRD profile, PDF/A conformance or tax treatment.
- **Document → Retention & legal hold**: owner/accountant records a reviewed document class, minimum retention date, hold and reason. Prior decisions remain in the audit trail. No deletion endpoint or automatic expiry deletion is provided.

## Fixed assets

**Finance → Assets** provides a management asset register and cumulative straight-line depreciation. First post reviewed capitalization to `FIXED_ASSETS` through the journal, using the preserved original's document UUID as source reference. Register that posted journal, useful-life basis, number of months and in-service date. Registration does not book the purchase twice. One capitalization journal represents one registered asset.

A completed month-end preview shows accumulated depreciation and remaining book value. Posting uses `DEPRECIATION / ACCUM_DEP`, rejects future or non-month-end dates, preserves exact cents over the complete useful life, is idempotent and respects ledger period locks. Finish earlier calendar years separately before proceeding into the next year. Catch-up within a year is posted at the explicitly selected month end; this is not an automatic allocation back into earlier monthly statements.

Registered assets and depreciation entries are immutable. Ordinary reversals of linked journals are blocked until coordinated asset corrections are implemented. Asset disposal, component purchases, extraordinary impairment, GWG, declining-balance methods and official tax AfA/EÜR integration remain outstanding. Payments and cash-based EÜR classifications are separate; acquisition and depreciation must not both be treated as ordinary cash expenses. The workflow does not determine legal useful life or tax eligibility.

## Deployment

Apply migrations in order through:

- `20261015200000_finance_administration.sql`
- `20261015210000_finance_incoming_validation.sql`
- `20261015220000_finance_assets.sql`

Deploy the matching app. Rebuild the existing self-hosted invoice worker and set `FINANCE_VALIDATION_ENABLED=true` only after the validation migration is applied. Its service role claims leased jobs; customer, staff and auditor sessions cannot call worker completion endpoints. The existing pinned Java/KoSIT installation is required. No paid API or subscription is added.

No production migration, deployment, real customer email, financial posting or live KoSIT execution was performed in this increment. Local tests use isolated databases and synthetic documents; production Storage, browser, backup/restore and validator acceptance still require verification.
