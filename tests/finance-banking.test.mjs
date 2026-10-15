import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseCsv, bankAmount, bankPreset, mapBankCsv } from "../src/lib/finance/bank-csv.ts";
import { summarizeReport, ReportSchema } from "../src/lib/finance/reports.ts";

test("Revolut and PayPal presets preserve exact net movement and fees; reject pending, FX and inconsistent net", () => {
  const csv =
    'Date,Name,Status,Currency,Gross,Fee,Net,Transaction ID,Type,Balance Impact\n10/15/2026,"Buyer, GmbH",Completed,EUR,100.00,-3.00,97.00,P1,Payment,Credit';
  const m = bankPreset(parseCsv(csv, ",").headers, "paypal", ",");
  const [r] = mapBankCsv(csv, m);
  assert.equal(r.amount, "9700");
  assert.equal(r.fee, "-300");
  assert.equal(r.date, "2026-10-15");
  assert.equal(r.reference, "Buyer, GmbH");
  for (const bad of [
    csv.replace("Completed", "Pending"),
    csv.replace("EUR", "USD"),
    csv.replace("Payment", "Currency Conversion"),
    csv.replace("97.00", "98.00"),
    csv.replace("Credit", "Memo"),
  ])
    assert.throws(() => mapBankCsv(bad, m));
  const de =
    "Datum;Name;Status;Währung;Brutto;Gebühr;Netto;Transaktionscode;Typ\n15.10.2026;Kunde;Abgeschlossen;EUR;1.234,56;-34,56;1.200,00;D1;Zahlung";
  assert.equal(
    mapBankCsv(de, bankPreset(parseCsv(de, ";").headers, "paypal", ";"))[0].amount,
    "120000",
  );
  const rev =
    "Completed Date,Description,Amount,Fee,Currency,State,Type\n2026-10-15 12:30:10,Transfer,1200.00,0.00,EUR,COMPLETED,TRANSFER";
  assert.equal(
    mapBankCsv(rev, bankPreset(parseCsv(rev, ",").headers, "revolut", ","))[0].amount,
    "120000",
  );
  assert.throws(() =>
    mapBankCsv(
      rev.replace(",0.00,", ",1.00,"),
      bankPreset(parseCsv(rev, ",").headers, "revolut", ","),
    ),
  );
  assert.equal(bankAmount("-1.234,56", "german"), "-123456");
  assert.equal(bankAmount("90000000000.00", "english"), "9000000000000");
  assert.throws(() => bankAmount("1.234", "english"));
  assert.throws(() => parseCsv('a,b\n"broken,b', ","));
  assert.deepEqual(parseCsv('a,b\n"x\ny","a""b"', ",").rows, [["x\ny", 'a"b']]);
  assert.throws(() => mapBankCsv(csv.replace("10/15/2026", "02/30/2026"), m));
});

test("bank evidence, multi-account matching, atomic imports, role boundaries, reversals and cash reports", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    staff = randomUUID(),
    auditor = randomUUID(),
    customer = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$;CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;INSERT INTO auth.users VALUES('${owner}'),('${staff}'),('${auditor}'),('${customer}');CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015120000_finance_reports.sql",
      "20261015140000_finance_banking.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id) =>
      db.exec(`RESET ROLE;SELECT set_config('app.user','${id}',false);SET ROLE authenticated;`);
    await login(owner);
    await db.query("SELECT finance_set_member($1,'staff')", [staff]);
    await db.query("SELECT finance_set_member($1,'auditor')", [auditor]);
    const account = (await db.query("SELECT finance_bank_account('Revolut EUR') id")).rows[0].id;
    const paypal = (await db.query("SELECT finance_bank_account('PayPal EUR') id")).rows[0].id;
    const accounts = (await db.query("SELECT * FROM finance_bank_accounts")).rows;
    const code = accounts.find((a) => a.id === account).ledger_account,
      pcode = accounts.find((a) => a.id === paypal).ledger_account;
    let n = 0;
    const doc = async () => {
      await login(owner);
      const d = (
        await db.query("SELECT finance_document_reserve($1,'statement.csv','text/csv',100) d", [
          (++n).toString(16).padStart(64, "0"),
        ])
      ).rows[0].d;
      await db.exec("RESET ROLE;SET ROLE service_role");
      await db.query("SELECT finance_document_finish($1,$2)", [d.id, owner]);
      return d.id;
    };
    const d = await doc();
    const data = {
      rows: [
        { date: "2026-10-15", amount: "10000", reference: "Capital", transactionId: "r1" },
        { date: "2026-10-16", amount: "-2000", reference: "To PayPal", transactionId: "r2" },
      ],
    };
    const imp = async (
      document = d,
      acc = account,
      opening = "0",
      closing = "8000",
      rows = data,
      start = "2026-10-01",
      end = "2026-10-31",
    ) =>
      db.query("SELECT finance_bank_import($1,$2,$3,$4,$5,$6,$7,$8) id", [
        owner,
        acc,
        document,
        start,
        end,
        opening,
        closing,
        rows,
      ]);
    await assert.rejects(imp(d, account, "0", "8001"), /does not equal/);
    const sid = (await imp()).rows[0].id;
    assert.equal((await imp()).rows[0].id, sid);
    await assert.rejects(imp(d, account, "1", "8001"), /different settings/);
    const d2 = await doc();
    await assert.rejects(imp(d2), /overlap/);
    await assert.rejects(
      imp(
        d2,
        account,
        "8000",
        "8100",
        { rows: [{ date: "2026-11-01", amount: "100", reference: "dup", transactionId: "r1" }] },
        "2026-11-01",
        "2026-11-30",
      ),
      /duplicate key/,
    );
    await login(owner);
    assert.equal((await db.query("SELECT * FROM finance_bank_statements")).rows.length, 1);
    await assert.rejects(imp(), /permission denied/);
    let snap = (await db.query("SELECT finance_bank_list($1,$2,0) s", [account, sid])).rows[0].s;
    assert.equal(snap.lines.length, 2);
    assert.equal(snap.statements[0].matched_count, 0);
    const line = snap.lines[0].id,
      transfer = snap.lines[1].id;
    await login(staff);
    await assert.rejects(
      db.query("SELECT finance_bank_classify($1,'contribution','Owner funds')", [line]),
      /Forbidden/,
    );
    await login(owner);
    const classify = () =>
      db.query("SELECT finance_bank_classify($1,'contribution','Owner funds') id", [line]);
    const jid = (await classify()).rows[0].id;
    assert.equal((await classify()).rows[0].id, jid);
    await assert.rejects(
      db.query("SELECT finance_bank_classify($1,'payout','Owner funds')", [line]),
      /different content/,
    );
    await assert.rejects(
      db.query("SELECT finance_reverse($1,'2026-10-17','Correction needed')", [jid]),
      /Release the bank match/,
    );
    const pdoc = await doc();
    const psid = (
      await imp(pdoc, paypal, "0", "2000", {
        rows: [
          {
            date: "2026-10-16",
            amount: "2000",
            reference: "From Revolut",
            transactionId: "p1",
            fee: "0",
            gross: "2000",
          },
        ],
      })
    ).rows[0].id;
    await login(owner);
    const post = async (lines) => {
      const j = (
        await db.query("SELECT finance_submit($1,'2026-10-16','Bank transfer',$2,$3) id", [
          randomUUID(),
          { reference: "bank statement" },
          lines,
        ])
      ).rows[0].id;
      await db.query("SELECT finance_post($1)", [j]);
      return j;
    };
    const tj = await post([
      { account: pcode, debit: "2000", credit: "0" },
      { account: code, debit: "0", credit: "2000" },
    ]);
    await db.query("SELECT finance_bank_match($1,$2,'Transfer verified')", [transfer, tj]);
    const psnap = (await db.query("SELECT finance_bank_list($1,$2,0) s", [paypal, psid])).rows[0].s;
    assert.equal(psnap.lines[0].candidates[0].id, tj);
    await db.query("SELECT finance_bank_match($1,$2,'Transfer verified')", [psnap.lines[0].id, tj]);
    await assert.rejects(
      db.query("SELECT finance_bank_match($1,$2,'Wrong amount check')", [line, tj]),
      /differs/,
    );
    const report = ReportSchema.parse(
      (await db.query("SELECT finance_report('2026-01-01','2026-12-31') r")).rows[0].r,
    );
    const totals = summarizeReport(report);
    assert.equal(totals.bank, "10000");
    assert.equal(totals.cashClosing, "10000");
    assert.equal(report.cash.inflow, "10000");
    assert.equal(report.cash.outflow, "0");
    assert.equal(totals.cashGap, "0");
    snap = (await db.query("SELECT finance_bank_list($1,$2,0) s", [account, sid])).rows[0].s;
    assert.equal(snap.statements[0].matched_count, 2);
    assert.equal(snap.statements[0].book_closing, "8000");
    await db.query("SELECT finance_bank_release($1,'Correction required')", [
      snap.lines[0].match_id,
    ]);
    await db.query("SELECT finance_reverse($1,'2026-10-17','Correction required')", [jid]);
    await assert.rejects(classify(), /was reversed/);
    // Supplier payment supports newly created cash accounts, but cannot credit an income account.
    const expense = randomUUID();
    await db.query(
      "SELECT finance_expense_draft($1,$2,'Supplier','S1','2026-10-15','Office expense','1000',null)",
      [expense, d],
    );
    await db.query("SELECT finance_expense_post($1)", [expense]);
    await assert.rejects(
      db.query("SELECT finance_expense_pay($1,$2,$3,'2026-10-16','1000','SALES')", [
        randomUUID(),
        expense,
        d,
      ]),
      /Invalid payment/,
    );
    await db.query("SELECT finance_expense_pay($1,$2,$3,'2026-10-16','1000',$4)", [
      randomUUID(),
      expense,
      d,
      code,
    ]);
    await login(auditor);
    await db.query("SELECT finance_bank_list($1,$2,0)", [account, sid]);
    await assert.rejects(db.query("SELECT finance_bank_account('Unauthorized')"), /Forbidden/);
    await login(customer);
    await assert.rejects(
      db.query("SELECT finance_bank_list($1,$2,0)", [account, sid]),
      /Forbidden/,
    );
    assert.equal((await db.query("SELECT * FROM finance_bank_lines")).rows.length, 0);
    await db.exec("RESET ROLE");
    await assert.rejects(
      db.query("DELETE FROM finance_bank_lines WHERE id=$1", [line]),
      /immutable/,
    );
  } finally {
    await db.close();
  }
});
