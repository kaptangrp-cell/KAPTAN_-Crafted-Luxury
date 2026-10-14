# KAPTAN German invoices — implementation and rollout

Status: implemented locally, 14 October 2026. **Not deployed. No customer invoices have been issued or emailed by this implementation.** Production requires the migrations, application deployment and an online invoice worker. Do not claim full operational GoBD compliance from software validation alone.

## Confirmed merchant configuration

User confirmed: Zoraiz Fazal, trading as Kaptan, sole proprietor (Einzelunternehmen), Bahnhofstraße 36, 35037 Marburg, Germany; VAT ID DE464080693; kaptangrp@gmail.com; 015216164830. Regular VAT at 19% for current products and delivery. Existing catalogue prices are NET. Germany-only billing/delivery; private, business and public-authority customers.

## Delivered

- Checkout buyer classification, optional company VAT ID, legal recipient name, separate billing address, authority buyer reference/Leitweg-ID, purchase order reference and portal instructions; electronic delivery consent is stored with a timestamp.
- Stored catalogue/admin prices remain net. Public catalogue, options, search, assistant and carts use rounded VAT-inclusive unit prices. Delivery is EUR 5.99 net / EUR 7.13 gross, waived when gross goods subtotal exceeds EUR 50. Old stored carts reset once to prevent paying obsolete net prices. Existing paid orders and pending payment attempts retain their historic amounts.
- Payment settlement snapshots billing, tax and order lines in the same database transaction. An immutable invoice source is queued only after verified payment; payment retries cannot duplicate the document.
- Branded PDF using the existing logo, Inter and Playfair Display; matching UBL XRechnung 3.0 XML. Integer-cent net/tax totals, delivery line, explicit payable rounding and zero balance for paid invoices. The readable PDF includes the same tax breakdown as XML.
- Dedicated `KPT-WEB-00000001` numbering series (unique, database sequence; gaps from rolled-back/conflicting transactions are possible). Do not reuse this prefix in another invoice system. Existing invoices are not retroactively fabricated.
- Advance-payment invoice on verified payment. Admin enters the actual tax-relevant supply date to create a final invoice that references and offsets the advance payment. A full cancellation credit is available with an explicit reason and original-invoice reference. Original records cannot be edited or deleted. Partial credits are not implemented; handle partial returns/corrections through the accountant instead of misusing full cancellation.
- `/admin/invoices`: day/week/month/year filters using Berlin calendar dates, products from historical snapshots, document types, PDF/XML/validation downloads, CSV export, email state, retries, and authority portal submission receipts. Warehouse staff have no archive access.
- Reports distinguish invoice totals from matching-product net totals. Advance and final invoices are the SAME sale and must not be added together as revenue. Credit figures are positive amounts to subtract. Invoice register export is not DATEV certification, a VAT return, or a complete general ledger.
- Private database archive retains exact PDF/XML bytes, SHA-256 hashes, canonical model, official validation report and append-only audit history. Issued documents cannot be overwritten by application operations. Email state remains separate; provider acceptance is not a guarantee of inbox delivery.
- A free background worker runs the official local KoSIT validator before issuance; missing validator, errors or warnings block issuance/email. Rejected documents remain visible with the report. XML, PDF and email reuse the same snapshot.
- Existing Resend transport is reused. No additional invoicing subscription. Existing provider free-tier limits still apply. A configured, verified sending domain is required; the confirmed Gmail address is reply-to. Public portal submission is manual and separately recorded; sending an email copy does not count as portal acceptance.

## Deployment sequence (requires coordinated release)

Back up the database and confirm no other system uses `KPT-WEB-`. Test against staging first. Apply in order after the existing payment-first and QR migrations:

1. `supabase/migrations/20261014120000_billing_profiles.sql`
2. `supabase/migrations/20261014130000_german_vat.sql`
3. `supabase/migrations/20261014140000_invoice_archive.sql`
4. Deploy the matching frontend/server code. The billing and tax RPCs must be installed together with the gross-price release. Do not reapply older checkout migrations afterwards.
5. Start the worker on a trusted existing continuously running server (or a computer while powered on). Vercel's current serverless deployment does not contain Java and is not the worker host. Hosting choice is still pending.

The Dockerfile at `deploy/invoices/Dockerfile` pins KoSIT 1.6.3 and the official XRechnung 3.0.2 configuration dated 2026-08-31, verifying both download hashes. Build from the repository root:

```sh
docker build -f deploy/invoices/Dockerfile -t kaptan-invoices .
docker run -d --restart unless-stopped --env-file /secure/path/invoice-worker.env --name kaptan-invoices kaptan-invoices
```

Use `deploy/invoices/worker.env.example` as the template, with real secrets outside Git. The process checks the queue every minute. For an existing Node 24 + Java 11+ host, configure `KOSIT_JAR`, `KOSIT_CONFIG`, optional `JAVA_BIN`, plus the environment above, then run `npm run invoices:worker` for one pass or `node scripts/invoices/loop.mjs` continuously. The worker needs the same repo assets and installed dependencies. No customer data is sent to a third-party validation website.

A retry keeps the invoice number and source. Email retries use the invoice ID as the provider idempotency key. After 23 hours from an ambiguous sending attempt, the worker marks delivery uncertain and stops automatic retry; inspect the provider record before a manual resend. Do not reset this guard without verifying delivery. Missing credentials and failures are never reported as sent.

## Operations and accounting

Maintain backups and retention/access controls for the original structured XML, PDF, validation reports and audit history. Document procedures for migration, corrections, worker monitoring, retention extensions/legal holds and disaster recovery with the tax adviser. The database's technical immutability is not a certified WORM archive or blanket GoBD assurance. Incoming business e-invoices need a receiving/retention process too; this release is the outbound store-invoice workflow.

For every full/partial refund, separately reconcile payment-provider refunds, stock and invoice corrections. The credit-note button does not move money or inventory. This implementation only covers confirmed German 19% domestic sales. Do not enable foreign sales, exemptions, reverse charge, reduced rates or discounts without implementing and validating their tax rules.

## Verification

Automated tests cover gross-price conversion, rounding, safe XML/CSV escaping, Berlin periods, database settlement and duplicate callbacks, queued source snapshots, leases, validation gate, immutable archives and admin/staff permissions. Official KoSIT tests cover advance, final, credit, public-authority and rounding examples plus rejection of an intentionally incorrect tax total. The PDF sample contains fictional buyer/order details, is visibly marked MUSTER, and is not booked or emailed.

`npm test`, `npm run typecheck`, changed-file ESLint and `npm run build` are the application checks. `scripts/invoices/sample.mjs` creates the branded sample; `scripts/invoices/validate-samples.mjs` requires the pinned local validator paths. The Docker image and live email transport need deployment smoke testing on the chosen host.

## Official references

- §14 UStG: https://www.gesetze-im-internet.de/ustg_1980/__14.html
- BMF e-invoice FAQ: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
- Federal recipient requirements: https://www.e-rechnung-bund.de/faq/e-rechnung/
- KoSIT configuration and usage: https://github.com/itplr-kosit/validator-configuration-xrechnung/blob/master/docs/usage.md
- §14b UStG retention: https://www.gesetze-im-internet.de/ustg_1980/__14b.html
- Consumer gross-price display: https://www.gesetze-im-internet.de/pangv_2022/__3.html
