import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { buildBundle } from "../scripts/finance/build-migration-bundle.mjs";
test("initial finance bundle installs all modules atomically and refuses reinstallation", async () => {
  const db = new PGlite(),
    owner = randomUUID(),
    worker = randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}'),('${worker}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('app.user',true),''))::uuid$$;CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='${owner}'::uuid$$;CREATE TABLE profiles(id uuid,role text);INSERT INTO profiles VALUES('${owner}','admin'),('${worker}','customer');CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id text,bucket_id text,name text);CREATE TABLE orders(id uuid PRIMARY KEY,total numeric,payment_status text);CREATE TABLE order_checkouts(order_id uuid,state text,provider_id text,provider_kind text);CREATE TABLE invoices(id uuid PRIMARY KEY,order_id uuid,number text,kind text,state text,model jsonb,source jsonb,pdf_base64 text);CREATE TABLE products(id uuid PRIMARY KEY,name text);CREATE TABLE product_variants(id uuid PRIMARY KEY,variant_value text);CREATE TABLE inventory_units(id uuid PRIMARY KEY,product_id uuid,variant_id uuid,batch_id uuid,state text,created_at timestamptz DEFAULT now());CREATE TABLE inventory_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,unit_id uuid,old_state text,new_state text,created_at timestamptz DEFAULT now());`,
    );

    await db.exec("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text)");
    const sql = await buildBundle();
    await db.exec(sql);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations")).rows[0]
        .n,
      13,
    );
    assert.equal((await db.query("SELECT count(*)::int n FROM finance_journals")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int n FROM finance_periods")).rows[0].n, 12);
    await assert.rejects(db.exec(sql), /Finance already exists/);
    await db.exec("ROLLBACK");
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations")).rows[0]
        .n,
      13,
    );
  } finally {
    await db.close();
  }
});
