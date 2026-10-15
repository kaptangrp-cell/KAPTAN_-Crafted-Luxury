import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { costShipment } from "../src/lib/finance/costing.ts";
const input = (units, docs) => ({
  id: randomUUID(),
  reference: "Import Pakistan 1",
  supplier: "Leather supplier",
  date: "2026-10-15",
  currency: "PKR",
  rateNumerator: "1",
  rateDenominator: "300",
  rateDate: "2026-10-15",
  rateSource: "Bank rate evidence",
  method: "quantity",
  units: units.map((id) => ({ id, purchase: "300000", weight: "1" })),
  components: [
    {
      kind: "purchase",
      document: docs[0],
      reference: "Invoice 1",
      amount: String(units.length * 1000),
    },
    { kind: "import_vat", document: docs[1], reference: "Customs 1", amount: "501" },
  ],
  confirmed: true,
});
test("landed costs conserve every cent and preserve original FX values with deterministic ordering", () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()],
    v = input(ids, [randomUUID(), randomUUID()]);
  const a = costShipment(v);
  assert.equal(a.total, "3501");
  assert.equal(a.purchaseForeign, "900000");
  assert.equal(
    a.allocations.reduce((n, u) => n + BigInt(u.amount), 0n),
    3501n,
  );
  assert.deepEqual(
    costShipment({ ...v, units: [...v.units].reverse() }).allocations,
    a.allocations,
  );
  assert.throws(
    () =>
      costShipment({ ...v, components: [{ ...v.components[0], amount: "3001" }, v.components[1]] }),
    /converted/,
  );
  assert.throws(() => costShipment({ ...v, units: [v.units[0], v.units[0]] }));
  assert.throws(() => costShipment({ ...v, currency: "EUR" }), /1:1/);
});
test("QR historical costs reconcile purchase, sale, quarantine, inspection return and damage without changing stock", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    staff = randomUUID(),
    customer = randomUUID(),
    pid = randomUUID(),
    vid = randomUUID(),
    units = [randomUUID(), randomUUID()];
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('app.user',true),''))::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;INSERT INTO auth.users VALUES('${owner}'),('${staff}'),('${customer}');CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);
 CREATE TABLE products(id uuid PRIMARY KEY,name text);CREATE TABLE product_variants(id uuid PRIMARY KEY,variant_value text);CREATE TABLE inventory_units(id uuid PRIMARY KEY,product_id uuid,variant_id uuid,batch_id uuid,state text,created_at timestamptz DEFAULT now());CREATE TABLE inventory_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,unit_id uuid,old_state text,new_state text,created_at timestamptz DEFAULT now());INSERT INTO products VALUES('${pid}','Wallet');INSERT INTO product_variants VALUES('${vid}','Black / S');INSERT INTO inventory_units(id,product_id,variant_id,batch_id,state) VALUES('${units[0]}','${pid}','${vid}','${randomUUID()}','available'),('${units[1]}','${pid}','${vid}','${randomUUID()}','available');`);
    for (const f of [
      "20261015100000_finance_foundation.sql",
      "20261015110000_finance_documents_expenses.sql",
      "20261015120000_finance_reports.sql",
      "20261015140000_finance_banking.sql",
      "20261015150000_finance_costing.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const login = async (id) =>
      db.exec(
        `RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('app.user','${id}',false);SET ROLE authenticated;`,
      );
    await login(owner);
    await db.query("SELECT finance_set_member($1,'staff')", [staff]);
    const docs = [];
    for (let n = 1; n <= 2; n++) {
      await login(owner);
      const d = (
        await db.query(
          "SELECT finance_document_reserve($1,'invoice.pdf','application/pdf',100) d",
          [String(n).repeat(64)],
        )
      ).rows[0].d;
      await db.exec("RESET ROLE;SET ROLE service_role");
      await db.query("SELECT finance_document_finish($1,$2)", [d.id, owner]);
      docs.push(d.id);
    }
    const payload = costShipment(input(units, docs));
    const post = () => db.query("SELECT finance_shipment_post($1,$2) id", [owner, payload]);
    const jid = (await post()).rows[0].id;
    assert.equal((await post()).rows[0].id, jid);
    await login(owner);
    await assert.rejects(post(), /permission denied/);
    let snapshot = (await db.query("SELECT finance_cost_list('',0) s")).rows[0].s;
    assert.equal(snapshot.totals.costedValue, "2501");
    assert.equal(snapshot.totals.ledgerValue, "2501");
    assert.equal(snapshot.totals.uncosted, "0");
    await assert.rejects(
      db.query("SELECT finance_reverse($1,'2026-10-16','Wrong costs')", [jid]),
      /coordinated/,
    );
    const ex = randomUUID();
    await db.query(
      "SELECT finance_expense_draft($1,$2,'Supplier','Invoice 1','2026-10-15','Duplicate cost','2000',null)",
      [ex, docs[0]],
    );
    await assert.rejects(db.query("SELECT finance_expense_post($1)", [ex]), /already capitalized/);
    const movement = async (old, state) => {
      await db.exec("RESET ROLE");
      await db.query("UPDATE inventory_units SET state=$1 WHERE id=$2", [state, units[0]]);
      return (
        await db.query(
          "INSERT INTO inventory_events(unit_id,old_state,new_state,created_at) VALUES($1,$2,$3,'2026-10-16 12:00Z') RETURNING id",
          [units[0], old, state],
        )
      ).rows[0].id;
    };
    const dispatch = await movement("packed", "dispatched");
    await login(staff);
    await assert.rejects(db.query("SELECT finance_stock_process($1)", [dispatch]), /Forbidden/);
    await login(owner);
    assert.equal(
      (await db.query("SELECT finance_stock_process($1) r", [dispatch])).rows[0].r.error,
      null,
    );
    await db.query("SELECT finance_stock_process($1)", [dispatch]);
    const cost = BigInt(payload.allocations.find((a) => a.id === units[0]).amount);
    snapshot = (await db.query("SELECT finance_cost_list('',0) s")).rows[0].s;
    assert.equal(snapshot.totals.costedValue, String(2501n - cost));
    assert.equal(snapshot.totals.ledgerValue, snapshot.totals.costedValue);
    const quarantine = await movement("dispatched", "quarantine"),
      returned = await movement("quarantine", "available");
    await login(owner);
    assert.match(
      (await db.query("SELECT finance_stock_process($1) r", [returned])).rows[0].r.error,
      /earlier/,
    );
    await db.query("SELECT finance_stock_process($1)", [quarantine]);
    await db.query("SELECT finance_stock_process($1)", [returned]);
    snapshot = (await db.query("SELECT finance_cost_list('',0) s")).rows[0].s;
    assert.equal(snapshot.totals.costedValue, "2501");
    assert.equal(snapshot.totals.ledgerValue, "2501");
    const damage = await movement("available", "damaged");
    await login(owner);
    await db.query("SELECT finance_stock_process($1)", [damage]);
    snapshot = (await db.query("SELECT finance_cost_list('',0) s")).rows[0].s;
    assert.equal(snapshot.totals.costedValue, snapshot.totals.ledgerValue);
    assert.equal(snapshot.totals.pending, "0");
    const payment = randomUUID();
    await db.query("SELECT finance_import_pay($1,$2,$3,'2026-10-16','1000','BANK')", [
      payment,
      docs[0],
      docs[1],
    ]);
    await db.query("SELECT finance_import_pay($1,$2,$3,'2026-10-16','1000','BANK')", [
      payment,
      docs[0],
      docs[1],
    ]);
    await assert.rejects(
      db.query("SELECT finance_import_pay($1,$2,$3,'2026-10-16','1001','BANK')", [
        randomUUID(),
        docs[0],
        docs[1],
      ]),
      /exceeds/,
    );
    await login(customer);
    await assert.rejects(db.query("SELECT finance_cost_list('',0)"), /Forbidden/);
    assert.equal((await db.query("SELECT * FROM finance_unit_costs")).rows.length, 0);
    await db.exec("RESET ROLE");
    await assert.rejects(db.query("DELETE FROM finance_unit_costs"), /immutable/);
  } finally {
    await db.close();
  }
});
