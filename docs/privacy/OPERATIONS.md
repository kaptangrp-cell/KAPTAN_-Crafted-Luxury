# Kaptan privacy release — 18 October 2026

## Implementation and release status

Local changes, not confirmation of production deployment or legal certification.

- German/English Article 13 notices before signup (including Google) and billing/express checkout, repeated before the order button.
- Full privacy page, controller contact and rights-request email in profile and policy. This opens the customer's email application; it does not submit an in-app ticket.
- Contract processing is not bundled into compulsory consent. Electronic invoice agreement remains separate.
- Removed Vercel Analytics, Speed Insights, visitor tracking and root error forwarding to Lovable. Retired tracking API is inert, old browser visitor IDs are removed. Historical visit data has NOT been deleted.
- Fonts locally served. Catalogue images may still originate from external hosts supplied in product records: audit those URLs and move images into approved storage.
- Migration `20261018090000_privacy_defaults.sql` turns off implicit marketing, resets legacy preferences (previous schema default was true), and revokes public inserts to visits/newsletter. Customer/order/invoice data is preserved. Review and apply to production before release. Never use old newsletter rows or legacy profile flags as proof of consent.
- Newsletter endpoint disabled pending a verified consent workflow. The profile marketing preference alone is not sufficient evidence for a campaign; do not send campaigns until double opt-in, versioned evidence and unsubscribe handling are implemented.

## Owner steps before claiming compliance

1. Check and sign/retain processing agreements with Vercel, Supabase and Resend; review Stripe/PayPal/Google controller/processor roles and terms. Record exact legal entities, hosting regions, subprocessors and transfer safeguards. Update the public policy with those verified details. No EU-only residency or signed agreements were verified in this change.
2. Set documented retention periods for auth logs, failed checkouts, support records, inactive accounts, backups, invoices and bookkeeping. Configure deletion jobs and verify them. Finance retention is not a blanket right to keep every profile/address forever. This release does not implement automated erasure or certify backups/restore procedures.
3. Keep a processing register: purposes, data categories, lawful bases, recipients, transfers, retention, security and responsible person. Review least-privilege admin/warehouse/finance permissions, MFA for operators, private file buckets and cross-account RLS tests. Do not give employees the Supabase service key.
4. Monitor kaptangrp@gmail.com for access/correction/deletion/portability/objection requests. Record date, request, verification, action and response. Respond within one month; document and communicate any lawful extension in time. Verify identity proportionately, never request passwords. Include data held in account, orders, addresses, reviews, payment and email providers as applicable. Redact other people's data. Use secure delivery for exports, not publicly accessible links.
5. For erasure: identify data first, restrict retained fiscal evidence, delete non-required account data and coordinate processors/backups. Do not delete an auth user blindly: inspect foreign-key cascades and invoice/order preservation first. Record any refusal/retention reason and communicate it.
6. Prepare breach response: restrict exposure, preserve evidence, assess risks and the Article 33 72-hour authority notification obligation; notify affected people where Article 34 requires it.
7. Apply the migration, deploy the website on the authorised hosting plan, then check `/auth`, `/checkout`, `/privacy` and `/profile` in DE/EN. Confirm the network panel shows no Google Font, Vercel Analytics, Speed Insights or visit logging requests. Verify the checkout notice before both express and regular payments. Do not place real test orders.

## Authoritative references

- GDPR Articles 5, 6, 12–22, 28, 32–34, 44 onwards: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Browser storage: https://www.gesetze-im-internet.de/ttdsg/__25.html
- Hesse complaints: https://datenschutz.hessen.de/service/beschwerde-uebermitteln
