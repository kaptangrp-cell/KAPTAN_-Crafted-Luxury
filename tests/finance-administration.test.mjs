import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("supplier revisions, retention controls and leased incoming validation preserve evidence", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    staff = randomUUID(),
    auditor = randomUUID(),
    customer = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}'),('${staff}'),('${auditor}'),('${customer}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.user',true),'')::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);`,
    );
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015200000_finance_administration.sql",
      "20261015210000_finance_incoming_validation.sql",
      "20261015220000_finance_assets.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id) =>
      db.exec(`RESET ROLE;SELECT set_config('app.user','${id}',false);SET ROLE authenticated;`);
    await login(owner);
    await db.query("SELECT finance_set_member($1,'staff')", [staff]);
    await db.query("SELECT finance_set_member($1,'auditor')", [auditor]);
    const supplier = randomUUID();
    const save = (revision, active = true) =>
      db.query("SELECT finance_supplier_save($1,$2,'Supplier GmbH','DE','','','Berlin',$3)", [
        supplier,
        revision,
        active,
      ]);
    await login(staff);
    await save(0);
    await save(1);
    await assert.rejects(save(1), /changed/);
    await assert.rejects(save(2, false), /archive/);
    await assert.rejects(
      db.query("SELECT finance_create_year(2027,'Reviewed calendar year')"),
      /Forbidden/,
    );
    await login(owner);
    await db.query("SELECT finance_create_year(2027,'Reviewed calendar year')");
    await db.query("SELECT finance_create_year(2027,'Reviewed calendar year')");
    assert.equal(
      (await db.query("SELECT finance_administration() r")).rows[0].r.years.find(
        (y) => y.year === 2027,
      ).months,
      12,
    );
    const hash = "a".repeat(64),
      doc = (
        await db.query("SELECT finance_document_reserve($1,'invoice.xml','application/xml',50) r", [
          hash,
        ])
      ).rows[0].r.id;
    await db.exec("RESET ROLE;SET ROLE service_role");
    await db.query("SELECT finance_document_finish($1,$2)", [doc, owner]);
    const extract = () =>
      db.query("SELECT finance_extraction_save($1,$2,'test-v1',$3,$4) id", [
        owner,
        doc,
        hash,
        { xml: "<Invoice/>", profile: "test" },
      ]);
    const id = (await extract()).rows[0].id;
    assert.equal((await extract()).rows[0].id, id);
    await login(staff);
    await assert.rejects(db.query("SELECT finance_validation_claim()"), /permission denied/);
    await assert.rejects(
      db.query(
        "SELECT finance_retention_save($1,0,'accounting_voucher','2036-12-31',true,'Reviewed retention decision')",
        [doc],
      ),
      /Forbidden/,
    );
    await login(owner);
    await db.query(
      "SELECT finance_retention_save($1,0,'accounting_voucher','2036-12-31',true,'Reviewed retention decision')",
      [doc],
    );
    await assert.rejects(
      db.query(
        "SELECT finance_retention_save($1,0,'accounting_voucher','2036-12-31',true,'Reviewed retention decision')",
        [doc],
      ),
      /changed/,
    );
    await db.exec("RESET ROLE;SET ROLE service_role");
    const job = (await db.query("SELECT finance_validation_claim() r")).rows[0].r;
    assert.equal(job.id, id);
    assert.equal((await db.query("SELECT finance_validation_claim() r")).rows[0].r, null);
    await assert.rejects(
      db.query("SELECT finance_validation_finish($1,$2,$3,NULL)", [
        id,
        randomUUID(),
        { accepted: true },
      ]),
      /lease/,
    );
    await db.query("SELECT finance_validation_finish($1,$2,NULL,'Java unavailable')", [
      id,
      job.lease,
    ]);
    await login(auditor);
    await assert.rejects(db.query("SELECT finance_validation_retry($1)", [id]), /Forbidden/);
    await login(staff);
    await db.query("SELECT finance_validation_retry($1)", [id]);
    await db.exec("RESET ROLE;SET ROLE service_role");
    const retry = (await db.query("SELECT finance_validation_claim() r")).rows[0].r;
    assert.notEqual(retry.lease, job.lease);
    await db.query("SELECT finance_validation_finish($1,$2,$3,NULL)", [
      id,
      retry.lease,
      {
        accepted: false,
        engine: "fixture",
        configuration: "fixture",
        report: "<report>Rejected</report>",
      },
    ]);
    await login(owner);
    const details = (await db.query("SELECT finance_document_details($1) r", [doc])).rows[0].r;
    assert.equal(details.extractions[0].validation.accepted, false);
    assert.equal(details.extractions[0].validation.attempts, 2);
    assert.equal(details.retention.legal_hold, true);
    await assert.rejects(db.query("SELECT finance_validation_retry($1)", [id]), /Only failed/);
    await db.exec("RESET ROLE");
    await assert.rejects(db.query("UPDATE finance_extractions SET result='{}'"), /immutable/);
    await login(owner);
    const capitalization = (
      await db.query(
        "SELECT finance_submit('asset-fixture','2026-01-15','Office equipment',$1,$2) id",
        [
          { reference: doc, kind: "asset_purchase" },
          [
            { account: "FIXED_ASSETS", debit: "10001", credit: "0" },
            { account: "AP", debit: "0", credit: "10001" },
          ],
        ],
      )
    ).rows[0].id;
    await db.query("SELECT finance_post($1)", [capitalization]);
    const asset = randomUUID();
    const register = () =>
      db.query(
        "SELECT finance_asset_register($1,$2,$3,'Office equipment','2026-01-15',12,'Reviewed internal useful life')",
        [asset, doc, capitalization],
      );
    await login(staff);
    await assert.rejects(register(), /Forbidden/);
    await login(owner);
    await register();
    await register();
    const postDep = () => db.query("SELECT finance_asset_depreciate($1,'2026-09-30') id", [asset]);
    const depreciation = (await postDep()).rows[0].id;
    assert.equal((await postDep()).rows[0].id, depreciation);
    const assets = (await db.query("SELECT finance_assets_list('2026-09-30') r")).rows[0].r;
    assert.equal(assets[0].depreciated, "7500");
    assert.equal(assets[0].book_value, "2501");
    assert.equal(assets[0].proposed, "0");
    await assert.rejects(
      db.query("SELECT finance_asset_depreciate($1,'2026-09-15')", [asset]),
      /month end/,
    );
    await assert.rejects(
      db.query("SELECT finance_asset_depreciate($1,'2026-08-31')", [asset]),
      /forwards/,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (await db.query("SELECT finance_asset_amount(10001,'2026-01-15',12,'2026-12-31') n")).rows[0]
        .n,
      10001,
    );
    await assert.rejects(db.query("UPDATE finance_assets SET cost=2"), /immutable/);
    await login(owner);
    await assert.rejects(
      db.query("SELECT finance_reverse($1,'2026-09-30','Asset correction attempt')", [
        capitalization,
      ]),
      /coordinated correction/,
    );
    await login(customer);
    await assert.rejects(db.query("SELECT finance_document_details($1)", [doc]), /Forbidden/);
    assert.equal((await db.query("SELECT * FROM finance_validations")).rows.length, 0);
  } finally {
    await db.close();
  }
});
