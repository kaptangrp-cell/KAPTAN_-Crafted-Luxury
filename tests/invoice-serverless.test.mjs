import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, authorized } from "../scripts/invoices/serverless.mjs";
import { batchSize } from "../scripts/invoices/batch.mjs";

test("worker rejects unauthenticated requests and cannot process while disabled", async () => {
  const secret = "x".repeat(48);
  let calls = 0;
  const handler = createHandler({
    env: { INVOICE_WORKER_SECRET: secret },
    run: async () => {
      calls++;
    },
  });
  const request = async (method, auth, mode) => {
    const result = {
      setHeader() {},
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await handler(
      { method, headers: { authorization: auth }, url: "/api/invoice-worker?mode=" + mode },
      result,
    );
    return result;
  };
  assert.equal((await request("GET", "Bearer " + secret, "health")).statusCode, 405);
  assert.equal((await request("POST", undefined, "health")).statusCode, 401);
  assert.equal((await request("POST", "Bearer wrong", "health")).statusCode, 401);
  assert.equal((await request("POST", "Bearer " + secret, "invoices")).statusCode, 503);
  assert.equal((await request("POST", "Bearer " + secret, "../worker")).statusCode, 400);
  assert.equal(calls, 0);
  assert.equal((await request("POST", "Bearer " + secret, "health")).statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(authorized("Bearer short", "short"), false);
});

test("enabled worker bounds execution and does not disclose errors", async () => {
  const secret = "y".repeat(48);
  let options;
  const handler = createHandler({
    env: { INVOICE_WORKER_SECRET: secret, INVOICE_SERVERLESS_ENABLED: "true" },
    run: async (_bin, _args, opts) => {
      options = opts;
      throw new Error("private invoice and secret");
    },
  });
  const res = {
    setHeader() {},
    end(body) {
      this.body = body;
    },
  };
  await handler(
    { method: "POST", headers: { authorization: "Bearer " + secret }, url: "/?mode=incoming" },
    res,
  );
  assert.equal(options.timeout, 50000);
  assert.equal(options.env.INCOMING_BATCH_SIZE, "1");
  assert.equal(options.env.INVOICE_BATCH_SIZE, "1");
  assert.equal(res.statusCode, 503);
  assert.ok(!res.body.includes("private invoice"));
  assert.equal(batchSize(undefined, 20), 20);
  assert.equal(batchSize("1", 20), 1);
  for (const v of ["0", "-1", "1.5", "21", "NaN"]) assert.throws(() => batchSize(v, 20));
});
