import test from "node:test";
import assert from "node:assert/strict";
import { startGoogleSignIn, completeGoogleSignIn } from "../src/lib/google-auth.ts";

test("Google login uses Supabase with the store's dedicated callback", async () => {
  let request;
  await startGoogleSignIn(
    {
      async signInWithOAuth(options) {
        request = options;
        return { data: { url: "https://project.supabase.co/auth/v1/authorize" }, error: null };
      },
    },
    "https://shop.example",
  );
  assert.deepEqual(request, {
    provider: "google",
    options: { redirectTo: "https://shop.example/auth/callback" },
  });
});

test("Google initiation surfaces provider failures and missing redirects", async () => {
  for (const result of [
    { data: {}, error: new Error("Provider disabled") },
    { data: { url: null }, error: null },
  ]) {
    await assert.rejects(
      startGoogleSignIn({ signInWithOAuth: async () => result }, "https://shop.example"),
    );
  }
});

test("callback waits for session initialization and rejects absent or failed sessions", async () => {
  await completeGoogleSignIn(
    {
      getSession: async () => ({ data: { session: { user: { id: "google-user" } } }, error: null }),
    },
    "https://shop.example/auth/callback",
  );
  for (const result of [
    { data: { session: null }, error: null },
    { data: { session: null }, error: new Error("Expired token") },
  ]) {
    await assert.rejects(
      completeGoogleSignIn(
        { getSession: async () => result },
        "https://shop.example/auth/callback",
      ),
    );
  }
});

test("provider cancellation is not mistaken for success even with an old session", async () => {
  for (const suffix of [
    "?error=access_denied",
    "#error=access_denied",
    "?error_description=cancelled",
  ]) {
    await assert.rejects(
      completeGoogleSignIn(
        {
          getSession: async () => {
            assert.fail("Must reject provider error first");
          },
        },
        `https://shop.example/auth/callback${suffix}`,
      ),
      /cancelled/,
    );
  }
});
