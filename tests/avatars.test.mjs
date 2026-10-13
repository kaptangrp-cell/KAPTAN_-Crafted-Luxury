import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { AVATARS, AvatarSelectionSchema } from "../src/lib/avatars.ts";

test("avatar selections only accept bundled portraits or the default", () => {
  assert.equal(AvatarSelectionSchema.parse(null), null);
  for (const avatar of AVATARS) {
    assert.equal(AvatarSelectionSchema.parse(avatar.url), avatar.url);
    assert.ok(existsSync(new URL(`../public${avatar.url}`, import.meta.url)));
  }
  for (const invalid of [
    "https://example.com/tracker.svg",
    "javascript:alert(1)",
    "/avatars/../secret",
    "/avatars/avatar-0.svg",
    "/avatars/avatar-97.svg",
    "",
  ]) {
    assert.equal(AvatarSelectionSchema.safeParse(invalid).success, false);
  }
});
