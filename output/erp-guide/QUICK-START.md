# KAPTAN ERP — quick start

Prepared 17 October 2026.

## What is ready?

The finance database and admin screens are deployed. Automatic invoice generation, invoice email and incoming XML validation are **not yet activated**. The wider ERP still has limitations; reports are internal drafts, not submitted tax returns.

## Your everyday workflow

1. **Sign in as admin.** Open https://www.kaptangrp.com/finance (or Admin → Finance). Use the language button to select German if preferred.
2. **Add purchase receipts.** Open **Documents & expenses**, upload the original receipt/invoice, and review the supplier, date and amount. The ordinary-expense form is for supported domestic EUR expenses. Use the dedicated inventory/assets workflows for those purchases.
3. **Import bank statements.** Open **Bank & PayPal**. Create separate **Revolut EUR** and **PayPal EUR** accounts once. Select the correct account, upload its CSV and check the dates, column mapping and opening/closing balances. Importing alone does not book the transactions.
4. **Review and book.** Review expense drafts, bank matches and **Store accounting inbox** entries. Only post genuine, verified transactions. Do not import old test orders into the accounts or record the same sale twice.
5. **Check results.** Use **Financial overview** for dates and totals, **Inventory & costs** for recorded unit costs, and **Tax review** for draft payment classifications. Empty/zero reports can mean transactions have not been booked.
6. **At month end.** Reconcile bank statements with the ledger, resolve outstanding items, and export accountant data from **Financial overview**. Close the month under **Periods** only after review. Keep original evidence.

**Staff access:** In **Access**, enter the employee's existing Supabase user ID. Choose **Finance staff** (drafts), **Accountant** (posting), or **Auditor** (read-only). Finance access does not grant store-admin or warehouse permissions.

**Corrections:** Posted entries are reversed with a reason; they are not edited. Ask your accountant before reversing or closing periods if unsure.

## Activate automatic invoices later — one-time technical setup

You do not need to repeat these steps every day.

1. Upgrade to hosting that permits commercial use. The Vercel account was last verified as Hobby; no upgrade has been purchased.
2. Have the deployment operator publish the prepared worker and configure the server-only credentials using the detailed guide below. Keep processing disabled at first.
3. Run the worker health check. It must accept the valid sample and reject the invalid sample.
4. Review queued orders, excluding historical tests. Enable worker processing and the prepared Supabase scheduler.
5. Verify a genuine invoice, its stored validation report, the admin archive and delivery to the intended email address. Only then treat automatic invoices as live.

Detailed operator instructions: [Serverless worker activation](../../docs/finance/SERVERLESS-WORKER.md).

Never paste passwords or secret keys into chat. Enabling the **Automation** tab controls bookkeeping rules; it does not install or activate the invoice/email worker.

## Quick video

The accompanying 64-second MP4 is a silent, captioned overview. It uses illustrated slides rather than live customer transactions. Pause any slide to read it.
