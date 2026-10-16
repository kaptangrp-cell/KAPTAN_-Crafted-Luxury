import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("scheduler stays disabled, dispatches only eligible work and throttles repeats", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
      CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
      CREATE TABLE public.invoices(state text,lease_until timestamptz);
      CREATE TABLE public.invoice_delivery(state text,lease_until timestamptz);
      CREATE TABLE public.finance_validations(state text,lease_until timestamptz);
      CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb);
      CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
      RETURNS bigint LANGUAGE sql AS $$
        INSERT INTO net.requests(url,headers) VALUES(url,headers) RETURNING id;
      $$;
      CREATE TABLE cron.jobs(name text PRIMARY KEY,schedule text,command text);
      CREATE FUNCTION cron.schedule(n text,s text,c text) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO cron.jobs VALUES(n,s,c) ON CONFLICT(name) DO UPDATE
          SET schedule=excluded.schedule,command=excluded.command;
        RETURN 1;
      END $$;
    `);
    const sql = await readFile(
      new URL("../deploy/invoices/supabase-scheduler.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    const dispatch = async (mode) =>
      (await db.query("SELECT public.dispatch_invoice_worker($1) id", [mode])).rows[0].id;
    assert.equal(await dispatch("invoices"), null);
    await db.exec("UPDATE public.invoice_worker_schedule SET enabled=true");
    assert.equal(await dispatch("invoices"), null); // no work, no network
    await db.exec("INSERT INTO public.invoices VALUES('queued',NULL)");
    await assert.rejects(dispatch("invoices"), /Vault secret missing/);
    await db.query("INSERT INTO vault.decrypted_secrets VALUES($1,$2)", [
      "kaptan_invoice_worker_secret",
      "test-only-".repeat(8),
    ]);
    assert.equal(await dispatch("invoices"), 1);
    assert.equal(await dispatch("invoices"), null);
    assert.equal(await dispatch("incoming"), null);
    await db.exec(
      "INSERT INTO public.finance_validations VALUES('processing',now()+interval '1 minute')",
    );
    assert.equal(await dispatch("incoming"), null); // active lease
    await db.exec("UPDATE public.finance_validations SET lease_until=now()-interval '1 minute'");
    assert.equal(await dispatch("incoming"), 2);
    const calls = (await db.query("SELECT url FROM net.requests ORDER BY id")).rows;
    assert.deepEqual(
      calls.map((r) => r.url),
      [
        "https://www.kaptangrp.com/api/invoice-worker?mode=invoices",
        "https://www.kaptangrp.com/api/invoice-worker?mode=incoming",
      ],
    );
    await db.exec("SET ROLE authenticated");
    await assert.rejects(dispatch("invoices"), /permission denied/);
    await assert.rejects(
      db.query("SELECT * FROM public.invoice_worker_schedule"),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    // Reinstall updates named cron jobs without duplicates or changing the enable switch.
    await db.exec(sql);
    assert.equal((await db.query("SELECT count(*)::int n FROM cron.jobs")).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
