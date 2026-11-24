import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function setup(seedAge = 0) {
  let now = 1_000_000;
  let nextTimer = 0;
  let cleanup;
  const timers = new Map();
  const listeners = new Map();
  const storage = new Map();
  const calls = { signOut: 0, cleared: 0, navigated: 0 };
  const user = { id: "customer-a", last_sign_in_at: "2026-11-23" };
  const key = `kaptan-activity:${user.id}:${user.last_sign_in_at}`;
  storage.set(key, String(now - seedAge));
  const store = {
    user,
    logout() {
      this.user = null;
    },
  };
  const useAuthStore = Object.assign((selector) => selector(store), { getState: () => store });
  const target = {
    hidden: false,
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  const shared = {
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    window: target,
    document: target,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const load = (file, dependencies = {}) => {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(code, {
      ...shared,
      exports,
      require: (name) => {
        if (!(name in dependencies)) throw Error(`Unexpected import ${name}`);
        return dependencies[name];
      },
    });
    return exports;
  };
  const idle = load("../src/lib/session-idle.ts");
  const hook = load("../src/hooks/useIdleSignOut.ts", {
    react: {
      useEffect: (fn) => {
        cleanup = fn();
      },
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        cancelQueries() {},
        clear() {
          calls.cleared++;
        },
      }),
    },
    "@tanstack/react-router": {
      useNavigate: () => () => {
        calls.navigated++;
      },
    },
    sonner: { toast: { info() {} } },
    "@/integrations/supabase/client": {
      supabase: {
        auth: {
          signOut({ scope }) {
            assert.equal(scope, "local");
            calls.signOut++;
            return Promise.resolve({ error: null });
          },
        },
      },
    },
    "@/stores/authStore": { useAuthStore },
    "@/lib/i18n": { t: (key) => key },
    "@/lib/session-idle": idle,
  });
  hook.useIdleSignOut();
  return {
    calls,
    store,
    cleanup,
    event(name) {
      listeners.get(name)?.({ isTrusted: true, key });
    },
    otherTabActivity() {
      storage.set(key, String(now));
      this.event("storage");
    },
    advance(ms, suspended = false) {
      now += ms;
      if (!suspended)
        for (const [id, timer] of [...timers])
          if (timer.at <= now) {
            timers.delete(id);
            timer.fn();
          }
    },
  };
}

test("idle session signs out at 60 seconds, clears account data and navigates to sign-in", () => {
  const app = setup();
  app.advance(59_999);
  assert.equal(app.calls.signOut, 0);
  app.advance(1);
  assert.equal(app.calls.signOut, 1);
  assert.equal(app.store.user, null);
  assert.equal(app.calls.cleared, 1);
  assert.equal(app.calls.navigated, 1);
  app.advance(60_000);
  assert.equal(app.calls.signOut, 1);
});
test("real activity extends the deadline and another tab shares that activity", () => {
  const app = setup();
  app.advance(45_000);
  app.event("keydown");
  app.advance(45_000);
  assert.equal(app.calls.signOut, 0);
  app.otherTabActivity();
  app.advance(59_999);
  assert.equal(app.calls.signOut, 0);
  app.advance(1);
  assert.equal(app.calls.signOut, 1);
});
test("a sleeping tab cannot revive an expired session through a new click", () => {
  const app = setup();
  app.advance(65_000, true);
  app.event("pointerdown");
  assert.equal(app.calls.signOut, 1);
});
test("reload does not renew an expired deadline and cleanup cancels timers", () => {
  assert.equal(setup(60_000).calls.signOut, 1);
  const app = setup();
  app.cleanup();
  app.advance(60_000);
  assert.equal(app.calls.signOut, 0);
});
