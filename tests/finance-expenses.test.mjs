import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { inspectDocument } from "../src/lib/finance/documents.server.ts";

test("original upload identifies bytes, rejects active HTML/entities and preserves exact fingerprints", () => {
  const b = Buffer.from("%PDF-1.7\noriginal bytes");
  const a = inspectDocument(b.toString("base64"));
  assert.equal(a.mime, "application/pdf");
  assert.deepEqual(a.bytes, b);
  assert.equal(a.hash.length, 64);
  assert.equal(
    inspectDocument(Buffer.from("<Invoice><ID>123</ID></Invoice>").toString("base64")).mime,
    "application/xml",
  );
  for (const s of [
    "<html>bad</html>",
    '<!DOCTYPE Invoice [<!ENTITY e SYSTEM "file:///secret">]><Invoice/>',
    "hello",
  ])
    assert.throws(() => inspectDocument(Buffer.from(s).toString("base64")));
  assert.throws(() => inspectDocument("YQ="));
  assert.throws(() => inspectDocument(Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")));
  const large = Buffer.alloc(3 * 1024 * 1024, 32);
  large.write("%PDF-1.7");
  assert.equal(inspectDocument(large.toString("base64")).bytes.length, large.length);
});

test("private evidence, immutable reviews, duplicates, partial payments and role restrictions", async () => {
  const db = new PGlite();
  const owner = randomUUID(),
    staff = randomUUID(),
    auditor = randomUUID(),
    customer = randomUUID();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$; INSERT INTO auth.users VALUES('${owner}'),('${staff}'),('${auditor}'),('${customer}');
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id text,bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT ALL ON storage.objects TO anon,authenticated; CREATE POLICY existing_broad_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);`);
    for (const migration of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261020120000_finance_invoice_intake.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"),
      );
    const login = async (id) =>
      db.exec(`RESET ROLE; SELECT set_config('app.user','${id}',false); SET ROLE authenticated;`);
    await login(owner);
    await db.query("SELECT finance_set_member($1,$2)", [staff, "staff"]);
    await db.query("SELECT finance_set_member($1,$2)", [auditor, "auditor"]);
    const reserve = async (hash) =>
      (
        await db.query("SELECT finance_document_reserve($1,'invoice.pdf','application/pdf',50) d", [
          hash,
        ])
      ).rows[0].d;
    const document = await reserve("a".repeat(64));
    assert.equal((await reserve("a".repeat(64))).id, document.id);
    await assert.rejects(
      db.query("SELECT finance_document_finish($1,$2)", [document.id, owner]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("INSERT INTO storage.objects VALUES('x','finance-originals','x')"),
      /row-level security/,
    );
    await db.exec(
      `RESET ROLE; INSERT INTO storage.objects VALUES('protected','finance-originals','a'); SET ROLE anon;`,
    );
    assert.equal((await db.query("SELECT * FROM storage.objects")).rows.length, 0);
    await db.exec("RESET ROLE; SET ROLE service_role");
    await db.query("SELECT finance_document_finish($1,$2)", [document.id, owner]);
    await login(staff);
    const expense = randomUUID();
    const draft = async (id = expense, number = "INV-1", replace = null) =>
      db.query(
        "SELECT finance_expense_draft($1,$2,'Supplier GmbH',$3,'2026-10-15','Office supplies','11900',$4)",
        [id, document.id, number, replace],
      );
    await draft();
    await draft();
    await assert.rejects(db.query("SELECT finance_expense_post($1)", [expense]), /Forbidden/);
    const replacement = randomUUID();
    await draft(replacement, "INV-1", expense);
    await login(owner);
    await assert.rejects(db.query("SELECT finance_expense_post($1)", [expense]), /superseded/);
    const journal = (await db.query("SELECT finance_expense_post($1) id", [replacement])).rows[0]
      .id;
    assert.equal(
      (await db.query("SELECT finance_expense_post($1) id", [replacement])).rows[0].id,
      journal,
    );
    await assert.rejects(draft(randomUUID(), "INV-1", replacement), /Only an unposted/);
    const duplicate = randomUUID();
    await draft(duplicate);
    await assert.rejects(db.query("SELECT finance_expense_post($1)", [duplicate]), /duplicate key/);
    assert.equal((await db.query("SELECT * FROM finance_journals")).rows.length, 1);
    const paymentDoc = await reserve("b".repeat(64));
    await db.exec("RESET ROLE; SET ROLE service_role");
    await db.query("SELECT finance_document_finish($1,$2)", [paymentDoc.id, owner]);
    await login(owner);
    const payment = randomUUID();
    const pay = async (id = payment, amount = "5000") =>
      db.query("SELECT finance_expense_pay($1,$2,$3,'2026-10-16',$4,'BANK') id", [
        id,
        replacement,
        paymentDoc.id,
        amount,
      ]);
    const pj = (await pay()).rows[0].id;
    assert.equal((await pay()).rows[0].id, pj);
    await assert.rejects(pay(payment, "5001"), /Retry content differs/);
    await assert.rejects(pay(randomUUID(), "6901"), /exceeds/);
    let result = (await db.query("SELECT finance_documents_list('',0) d")).rows[0].d;
    assert.equal(result.expenses.find((e) => e.id === replacement).paid, "5000");
    await pay(randomUUID(), "6900");
    await assert.rejects(pay(randomUUID(), "1"), /exceeds/);
    let trial = (await db.query("SELECT finance_snapshot('2026-01-01','2026-12-31') d")).rows[0].d
      .trial;
    assert.equal(trial.find((a) => a.account === "EXPENSE").debit, "11900");
    assert.equal(trial.find((a) => a.account === "BANK").credit, "11900");
    assert.equal(
      trial.find((a) => a.account === "AP").debit,
      trial.find((a) => a.account === "AP").credit,
    );
    await db.query("SELECT finance_reverse($1,'2026-10-17','Payment correction')", [pj]);
    result = (await db.query("SELECT finance_documents_list('',0) d")).rows[0].d;
    assert.equal(result.expenses.find((e) => e.id === replacement).paid, "6900");
    const inbox = (
      await db.query("SELECT finance_invoice_intake($1) d", [[document.id, paymentDoc.id]])
    ).rows[0].d;
    assert.equal(inbox.documents.find((d) => d.document_id === document.id).expense.paid, "6900");
    assert.equal(inbox.unassigned, 0); // payment evidence is not an unrecorded invoice
    const failedId = randomUUID();
    await assert.rejects(
      db.query(
        "SELECT finance_expense_record($1,$2,'Supplier GmbH','INV-1','2026-10-15','Duplicate','11900',null)",
        [failedId, document.id],
      ),
      /duplicate key/,
    );
    assert.equal(
      (await db.query("SELECT id FROM finance_expenses WHERE id=$1", [failedId])).rows.length,
      0,
    );
    const newId = randomUUID();
    const record = () =>
      db.query(
        "SELECT finance_expense_record($1,$2,'Other Supplier','INV-2','2026-10-15','Permit fee','2000',null)",
        [newId, paymentDoc.id],
      );
    await record();
    await record();
    assert.equal(
      (
        await db.query("SELECT id FROM finance_expenses WHERE id=$1 AND journal_id IS NOT NULL", [
          newId,
        ])
      ).rows.length,
      1,
    );
    await login(staff);
    await assert.rejects(record(), /Forbidden/);
    await login(auditor);
    await db.query("SELECT finance_document_access($1)", [document.id]);
    await assert.rejects(reserve("c".repeat(64)), /Forbidden/);
    await login(customer);
    assert.equal((await db.query("SELECT * FROM finance_documents")).rows.length, 0);
    await assert.rejects(db.query("SELECT finance_invoice_intake()"), /Forbidden/);
    await assert.rejects(
      db.query("SELECT finance_document_access($1)", [document.id]),
      /Forbidden/,
    );
    await db.exec("RESET ROLE");
    await assert.rejects(
      db.query("UPDATE finance_expenses SET gross=1 WHERE id=$1", [replacement]),
      /immutable/,
    );
    await assert.rejects(
      db.query("DELETE FROM finance_documents WHERE id=$1", [document.id]),
      /cannot be deleted/,
    );
  } finally {
    await db.close();
  }
});
