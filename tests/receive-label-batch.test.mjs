import test from "node:test";
import assert from "node:assert/strict";
import { receiveLabelBatch } from "../src/lib/receive-label-batch.ts";

test("batch receipt resumes after a lost response without double receiving stock", async () => {
  const states = new Map([
    ["a", "expected"],
    ["b", "expected"],
  ]);
  const calls = [];
  const progress = [];
  const options = {
    ids: ["a", "b"],
    operations: new Map(),
    getState: async (id) => states.get(id),
    receive: async (id) => {
      calls.push(id);
      states.set(id, "available");
      if (calls.length === 1) throw new Error("Response lost");
    },
    progress: (count) => progress.push(count),
    invalidStateMessage: "Inspect item",
  };
  await assert.rejects(receiveLabelBatch(options), /Response lost/);
  assert.equal(await receiveLabelBatch(options), 2);
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(progress.at(-1), 2);
  assert.equal(await receiveLabelBatch(options), 2);
  assert.deepEqual(calls, ["a", "b"]);
});

test("receipt retry retains its operation ID and never receives a sold item", async () => {
  const operations = new Map();
  const calls = [];
  const options = {
    ids: ["a"],
    operations,
    getState: async () => "expected",
    receive: async (_id, operation) => {
      calls.push(operation);
      throw new Error("Offline");
    },
    progress: () => {},
    invalidStateMessage: "Inspect item",
  };
  await assert.rejects(receiveLabelBatch(options), /Offline/);
  await assert.rejects(receiveLabelBatch(options), /Offline/);
  assert.equal(calls[0], calls[1]);
  await assert.rejects(
    receiveLabelBatch({ ...options, getState: async () => "sold" }),
    /Inspect item/,
  );
  assert.equal(calls.length, 2);
});
