import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("privacy migration removes implicit marketing and public collection without deleting records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE profiles (id int, email_marketing boolean DEFAULT true);
      INSERT INTO profiles VALUES (1,true),(2,false),(3,null);
      CREATE TABLE site_visits (id int); INSERT INTO site_visits VALUES(1);
      CREATE TABLE newsletter_subscribers (id int); INSERT INTO newsletter_subscribers VALUES(1);
      GRANT INSERT ON site_visits, newsletter_subscribers TO anon, authenticated;`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261018090000_privacy_defaults.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec("INSERT INTO profiles(id) VALUES (4)");
    const { rows } = await db.query("SELECT email_marketing FROM profiles");
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => row.email_marketing === false));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.exec("INSERT INTO site_visits VALUES (2)"), /permission denied/);
      await assert.rejects(
        db.exec("INSERT INTO newsletter_subscribers VALUES (2)"),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    for (const table of ["site_visits", "newsletter_subscribers"]) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 1);
    }
  } finally {
    await db.close();
  }
});
