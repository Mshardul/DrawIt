import { describe, expect, it } from "vitest";
import { type StorageAdapter, StorageError } from "./adapter.ts";
import { HttpStorage } from "./http.ts";
import { type SessionEnv, startSession } from "./session.ts";

interface Seen {
  url: string;
  method: string;
  authorization: string | null;
  body?: Uint8Array;
}

/** A fetch that records requests and answers with `respond`. */
function fakeFetch(respond: (seen: Seen) => Response) {
  const seen: Seen[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const entry: Seen = {
      url: typeof input === "string" ? input : "",
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body instanceof Uint8Array ? init.body : undefined,
    };
    seen.push(entry);
    return Promise.resolve(respond(entry));
  };
  return { fetchFn, seen };
}

describe("HTTP storage adapter", () => {
  it("lists files from GET /api/files with the bearer token", async () => {
    const files = [{ path: "a.drawit.kdl", size: 3, modified: "2026-10-26T00:00:00.000Z" }];
    const { fetchFn, seen } = fakeFetch(() => Response.json({ files }));
    const storage = new HttpStorage({ token: "tok", fetch: fetchFn });
    expect(await storage.list()).toEqual(files);
    expect(seen).toMatchObject([{ url: "/api/files", method: "GET", authorization: "Bearer tok" }]);
  });

  it("reads bytes from GET /api/file with the path encoded", async () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(new Uint8Array([1, 2, 3])));
    const storage = new HttpStorage({ token: "tok", fetch: fetchFn });
    expect(await storage.read("my dir/a&b.drawit.kdl")).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen[0]?.url).toBe("/api/file?path=my%20dir%2Fa%26b.drawit.kdl");
    expect(seen[0]?.authorization).toBe("Bearer tok");
  });

  it("writes bytes with PUT /api/file and the bearer token", async () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(null, { status: 204 }));
    const storage = new HttpStorage({ token: "tok", fetch: fetchFn });
    await storage.write("a.drawit.kdl", new Uint8Array([9, 8]));
    expect(seen).toMatchObject([
      { url: "/api/file?path=a.drawit.kdl", method: "PUT", authorization: "Bearer tok", body: new Uint8Array([9, 8]) },
    ]);
  });

  it.each([
    [404, "not-found"],
    [400, "invalid-path"],
    [403, "refused"],
  ] as const)("maps HTTP %i to StorageError %s", async (status, code) => {
    const { fetchFn } = fakeFetch(() => new Response("no", { status }));
    const storage = new HttpStorage({ token: "tok", fetch: fetchFn });
    for (const call of [() => storage.read("a"), () => storage.write("a", new Uint8Array()), () => storage.list()]) {
      await expect(call()).rejects.toMatchObject({ name: "StorageError", code });
      await expect(call()).rejects.toBeInstanceOf(StorageError);
    }
  });

  it("rejects with a plain Error for any other failure status", async () => {
    const { fetchFn } = fakeFetch(() => new Response("boom", { status: 500 }));
    const storage = new HttpStorage({ token: "tok", fetch: fetchFn });
    const err = await storage.read("a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(StorageError);
    expect((err as Error).message).toContain("500");
  });

  it("watch is a no-op that never calls the listener and returns an unsubscribe function", () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(null, { status: 204 }));
    const storage: StorageAdapter = new HttpStorage({ token: "tok", fetch: fetchFn });
    let calls = 0;
    const unsubscribe = storage.watch(() => {
      calls++;
    });
    expect(typeof unsubscribe).toBe("function");
    expect(() => {
      unsubscribe();
    }).not.toThrow();
    expect(calls).toBe(0);
    expect(seen).toEqual([]);
  });
});

function fakeEnv(hash: string, stored: Record<string, string> = {}) {
  const store = new Map(Object.entries(stored));
  const replaced: string[] = [];
  const env: SessionEnv = {
    location: { pathname: "/app/", search: "?x=1", get hash() { return hash; } },
    history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); hash = ""; } },
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
  };
  return { env, store, replaced };
}

describe("session token", () => {
  it("reads the token from the URL fragment, keeps it in session storage and strips it from the address bar", () => {
    const { env, store, replaced } = fakeEnv("#abc123");
    expect(startSession(env)).toBe("abc123");
    expect(store.get("drawit.token")).toBe("abc123");
    expect(replaced).toEqual(["/app/?x=1"]);
  });

  it("falls back to the token in session storage when the fragment has none", () => {
    const { env, replaced } = fakeEnv("", { "drawit.token": "kept" });
    expect(startSession(env)).toBe("kept");
    expect(replaced).toEqual([]);
  });

  it("returns null when there is no token anywhere", () => {
    expect(startSession(fakeEnv("").env)).toBeNull();
  });

  it("a new fragment token replaces the stored one", () => {
    const { env, store } = fakeEnv("#new", { "drawit.token": "old" });
    expect(startSession(env)).toBe("new");
    expect(store.get("drawit.token")).toBe("new");
  });
});
