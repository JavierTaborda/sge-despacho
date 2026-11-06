/// <reference types="node" />

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AxiosHeaders, create, type AxiosAdapter } from "axios";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "zustand/vanilla";

import { configureApi } from "../src/lib/api-interceptors.ts";
import { startAuthLifecycle, type AuthLifecycleClient } from "../src/services/auth-lifecycle.ts";
import { AuthError, createAuthState, type AuthGateway } from "../src/stores/auth-state.ts";
import { getSupabaseConfiguration } from "../src/utils/auth-config.ts";

function session(userId = "user-a", token = "test-token-a"): Session {
  return {
    access_token: token,
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: { id: userId, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushRefresh() {
  await new Promise<void>((done) => setImmediate(done));
}

function fixture(gateway: Partial<AuthGateway> = {}) {
  let listener: ((event: AuthChangeEvent, value: Session | null) => void) | undefined;
  const restored = deferred<Awaited<ReturnType<AuthLifecycleClient["getSession"]>>>();
  const calls = { unsubscribe: 0, start: 0, stop: 0 };
  const auth = {
    signInWithPassword: async () => ({ data: { session: session() }, error: null }),
    signOut: async () => ({ error: null }),
    ...gateway,
    getSession: () => restored.promise,
    onAuthStateChange: (callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => { calls.unsubscribe++; } } } };
    },
    startAutoRefresh: () => { calls.start++; },
    stopAutoRefresh: () => { calls.stop++; },
  };
  const store = createStore(createAuthState(() => auth));
  return {
    store, auth, restored, calls,
    emit: (event: AuthChangeEvent, value: Session | null) => listener?.(event, value),
  };
}

test("restoration keeps guards loading until session, token and userId are synchronized", async () => {
  const f = fixture();
  const lifecycle = startAuthLifecycle(f.auth, f.store);
  assert.equal(f.store.getState().loading, true);
  f.restored.resolve({ data: { session: session() }, error: null });
  await lifecycle.ready;
  assert.equal(f.store.getState().loading, false);
  assert.equal(f.store.getState().token, "test-token-a");
  assert.equal(f.store.getState().userId, "user-a");
  const epoch = f.store.getState().sessionEpoch;
  f.emit("TOKEN_REFRESHED", session("user-a", "test-token-b"));
  assert.equal(f.store.getState().token, "test-token-b");
  assert.equal(f.store.getState().session?.access_token, "test-token-b");
  assert.equal(f.store.getState().sessionEpoch, epoch);
  lifecycle.dispose();
});

test("a late restored snapshot cannot overwrite TOKEN_REFRESHED or SIGNED_OUT", async () => {
  for (const event of ["TOKEN_REFRESHED", "SIGNED_OUT"] as const) {
    const f = fixture();
    const lifecycle = startAuthLifecycle(f.auth, f.store);
    f.emit(event, event === "SIGNED_OUT" ? null : session("user-b", "test-token-new"));
    f.restored.resolve({ data: { session: session() }, error: null });
    await lifecycle.ready;
    assert.equal(f.store.getState().token, event === "SIGNED_OUT" ? null : "test-token-new");
    assert.equal(f.store.getState().loading, false);
    lifecycle.dispose();
  }
});

test("mobile refresh follows current AppState and cleans up listener/subscription", async () => {
  const f = fixture();
  let stateListener: ((state: string) => void) | undefined;
  let removed = 0;
  const lifecycle = startAuthLifecycle(f.auth, f.store, {
    currentState: "active",
    subscribe: (callback) => {
      stateListener = callback;
      return () => { removed++; };
    },
  });
  await flushRefresh();
  assert.equal(f.calls.start, 1);
  stateListener?.("background");
  await flushRefresh();
  assert.equal(f.calls.stop, 1);
  stateListener?.("active");
  await flushRefresh();
  assert.equal(f.calls.start, 2);
  lifecycle.dispose();
  await flushRefresh();
  assert.equal(f.calls.stop, 2);
  assert.equal(f.calls.unsubscribe, 1);
  assert.equal(removed, 1);
  const revision = f.store.getState().revision;
  f.emit("SIGNED_IN", session());
  f.restored.resolve({ data: { session: session() }, error: null });
  await lifecycle.ready;
  assert.equal(f.store.getState().revision, revision);
});

test("background mount does not start mobile refresh and web leaves refresh to SDK", async () => {
  const mobile = fixture();
  const lifecycle = startAuthLifecycle(mobile.auth, mobile.store, {
    currentState: "background", subscribe: () => () => {},
  });
  await flushRefresh();
  assert.equal(mobile.calls.start, 0);
  assert.equal(mobile.calls.stop, 1);
  lifecycle.dispose();
  await flushRefresh();
  const web = fixture();
  const browserLifecycle = startAuthLifecycle(web.auth, web.store);
  browserLifecycle.dispose();
  assert.equal(web.calls.start, 0);
  assert.equal(web.calls.stop, 0);
});

test("async mobile refresh is serialized across background, cleanup and provider remount", async () => {
  const f = fixture();
  const starting = deferred<void>();
  const operations: string[] = [];
  let first = true;
  const auth = {
    ...f.auth,
    startAutoRefresh: async () => {
      operations.push("start");
      if (first) {
        first = false;
        await starting.promise;
      }
    },
    stopAutoRefresh: async () => { operations.push("stop"); },
  };
  const app = { currentState: "active", subscribe: () => () => {} };
  const previous = startAuthLifecycle(auth, f.store, app);
  await flushRefresh();
  previous.dispose();
  const next = startAuthLifecycle(auth, f.store, app);
  starting.resolve();
  await flushRefresh();
  assert.deepEqual(operations, ["start", "stop", "start"]);
  next.dispose();
  await flushRefresh();
  assert.deepEqual(operations, ["start", "stop", "start", "stop"]);
});

test("restoration/storage failures are explicit and retry can restore a session", async () => {
  const f = fixture();
  const lifecycle = startAuthLifecycle(f.auth, f.store);
  f.restored.resolve({ data: { session: null }, error: { message: "storage unavailable" } });
  await lifecycle.ready;
  assert.equal(f.store.getState().loading, false);
  assert.match(f.store.getState().error!, /restaurar la sesión/);
  lifecycle.dispose();
  const retried = startAuthLifecycle({
    ...f.auth,
    getSession: async () => ({ data: { session: session() }, error: null }),
  }, f.store);
  await retried.ready;
  assert.equal(f.store.getState().error, null);
  assert.equal(f.store.getState().token, "test-token-a");
  retried.dispose();
});

test("login trims email but preserves password and logout clears every session field", async () => {
  const credentials: { email: string; password: string }[] = [];
  const f = fixture({
    signInWithPassword: async (value) => {
      credentials.push(value);
      return { data: { session: session() }, error: null };
    },
  });
  f.store.getState().finishRestoration();
  await f.store.getState().signIn(" worker@example.test ", " pass ");
  assert.deepEqual(credentials, [{ email: "worker@example.test", password: " pass " }]);
  assert.equal(f.store.getState().busy, false);
  assert.equal(f.store.getState().token, "test-token-a");
  const epoch = f.store.getState().sessionEpoch;
  await f.store.getState().signOut();
  const state = f.store.getState();
  assert.equal(state.session, null);
  assert.equal(state.token, null);
  assert.equal(state.userId, null);
  assert.equal(state.sessionEpoch, epoch + 1);
  assert.equal(state.busy, false);
});

test("login errors are explicit, configuration errors are safe and failed logout does not fake success", async () => {
  const f = fixture({
    signInWithPassword: async () => ({
      data: { session: null }, error: { message: "Invalid login credentials", code: "invalid_credentials" },
    }),
    signOut: async () => ({ error: { message: "offline" } }),
  });
  f.store.getState().finishRestoration();
  await assert.rejects(f.store.getState().signIn("", ""), /correo y contraseña/);
  await assert.rejects(f.store.getState().signIn("a@example.test", "wrong"), /Correo o contraseña incorrectos/);
  assert.equal(f.store.getState().token, null);
  assert.equal(f.store.getState().busy, false);
  f.store.getState().setSession(session());
  await assert.rejects(f.store.getState().signOut(), /No pudimos cerrar/);
  assert.equal(f.store.getState().token, "test-token-a");
  assert.equal(f.store.getState().busy, false);
  const unconfigured = createStore(createAuthState(() => { throw new AuthError("Configura Supabase."); }));
  unconfigured.getState().finishRestoration();
  await assert.rejects(unconfigured.getState().signIn("a@example.test", "pass"), /Configura Supabase/);
});

test("shared Axios interceptor reads current token per request, including refresh and logout", async () => {
  const f = fixture();
  const requests: (string | undefined)[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config.headers.get("Authorization") as string | undefined);
    assert.equal(config.baseURL, "http://localhost:9000/mobile");
    return { data: [], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const api = create({ adapter });
  const dispose = configureApi(api, () => f.store.getState().token, () => "http://localhost:9000/mobile/api/");
  f.store.getState().setSession(session());
  await api.get("/api/dispatch/orders");
  f.store.getState().setSession(session("user-a", "test-token-b"));
  await api.get("/api/dispatch/orders");
  f.store.getState().setSession(null);
  await api.get("/api/dispatch/orders", { headers: { Authorization: "Bearer stale-test-token" } });
  assert.deepEqual(requests, ["Bearer test-token-a", "Bearer test-token-b", undefined]);
  dispose();
});

test("missing/invalid API config is rejected before transport", async () => {
  for (const url of ["", "ftp://example.test", "https://example.test?key=invalid"]) {
    let called = false;
    const api = create({ adapter: async () => { called = true; throw new Error("transport"); } });
    configureApi(api, () => null, () => url);
    await assert.rejects(api.get("/api/dispatch/orders"), /EXPO_PUBLIC_API_URL/);
    assert.equal(called, false);
  }
});

test("Supabase config reports names only, accepts localhost and does not require credentials in tests", () => {
  assert.match(getSupabaseConfiguration(undefined, undefined).error!, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(getSupabaseConfiguration("not-a-url", "public-placeholder").error!, /URL HTTP o HTTPS/);
  assert.match(getSupabaseConfiguration("ftp://example.test", "public-placeholder").error!, /URL HTTP o HTTPS/);
  assert.equal(getSupabaseConfiguration("http://localhost:9000", "public-placeholder").error, null);
});
