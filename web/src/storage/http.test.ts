import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, StorageError } from "./adapter.ts";
import { HttpStorage } from "./http.ts";
import { claimSession, holdSession, resumeSession, type SessionEnv, startSession } from "./session.ts";

interface Seen {
  url: string;
  method: string;
  authorization: string | null;
  session: string | null;
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
      session: new Headers(init?.headers).get("X-Session-Id"),
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
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    expect(await storage.list()).toEqual(files);
    expect(seen).toMatchObject([{ url: "/api/files", method: "GET", authorization: "Bearer tok", session: "tab-1" }]);
  });

  it("reads bytes from GET /api/file with the path encoded", async () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(new Uint8Array([1, 2, 3])));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    expect(await storage.read("my dir/a&b.drawit.kdl")).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen[0]?.url).toBe("/api/file?path=my%20dir%2Fa%26b.drawit.kdl");
    expect(seen[0]?.authorization).toBe("Bearer tok");
  });

  it("writes bytes with PUT /api/file and the bearer token", async () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(null, { status: 204 }));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    await storage.write("a.drawit.kdl", new Uint8Array([9, 8]));
    expect(seen).toMatchObject([
      { url: "/api/file?path=a.drawit.kdl", method: "PUT", authorization: "Bearer tok", body: new Uint8Array([9, 8]) },
    ]);
  });

  it("reads and writes binary bytes unchanged", async () => {
    const all = Uint8Array.from({ length: 512 }, (_, i) => i % 256);
    const { fetchFn, seen } = fakeFetch(() => new Response(all));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    expect(await storage.read("assets/logo.png")).toEqual(all);
    await storage.write("assets/logo.png", all);
    expect(seen[1]?.body).toEqual(all);
  });

  it("does not send a write over the size limit", async () => {
    const { fetchFn, seen } = fakeFetch(() => new Response(null, { status: 204 }));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    await expect(storage.write("big.bin", new Uint8Array(MAX_FILE_BYTES + 1))).rejects.toMatchObject({ name: "StorageError", code: "too-large" });
    expect(seen).toEqual([]);
  });

  it.each([
    [404, "not-found"],
    [400, "invalid-path"],
    [403, "refused"],
    [413, "too-large"],
    [401, "session-lost"],
  ] as const)("maps HTTP %i to StorageError %s", async (status, code) => {
    const { fetchFn } = fakeFetch(() => new Response("no", { status }));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    for (const call of [() => storage.read("a"), () => storage.write("a", new Uint8Array()), () => storage.list()]) {
      await expect(call()).rejects.toMatchObject({ name: "StorageError", code });
      await expect(call()).rejects.toBeInstanceOf(StorageError);
    }
  });

  it("reports a lost session from a request", async () => {
    const { fetchFn } = fakeFetch(() => new Response("session lost\n", { status: 401 }));
    let lost = 0;
    const storage = new HttpStorage({
      token: "tok",
      session: "old",
      fetch: fetchFn,
      onLost: () => {
        lost += 1;
      },
    });
    await expect(storage.list()).rejects.toMatchObject({ code: "session-lost" });
    await expect(storage.read("a.drawit.kdl")).rejects.toMatchObject({ code: "session-lost" });
    expect(lost).toBe(2);
  });

  it("reports a session that is open elsewhere", async () => {
    const { fetchFn } = fakeFetch(() => new Response("DrawIt is open elsewhere\n", { status: 409 }));
    let lost = 0;
    const storage = new HttpStorage({
      token: "tok",
      session: "",
      fetch: fetchFn,
      onLost: () => {
        lost += 1;
      },
    });
    await expect(storage.claimSession()).rejects.toMatchObject({ code: "open-elsewhere" });
    expect(lost).toBe(1);
  });

  it("rejects with a plain Error for any other failure status", async () => {
    const { fetchFn } = fakeFetch(() => new Response("boom", { status: 500 }));
    const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
    const err = await storage.read("a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(StorageError);
    expect((err as Error).message).toContain("500");
  });

  it("polls the open file about once a second and reports a content change", async () => {
    vi.useFakeTimers();
    try {
      let modified = "2026-11-05T00:00:00.000Z";
      let body = "one";
      const { fetchFn, seen } = fakeFetch((entry) => {
        if (entry.url.includes("stat=1")) return Response.json({ path: "a.drawit.kdl", size: body.length, modified });
        return new Response(body);
      });
      const storage = new HttpStorage({ token: "tok", session: "tab-1", fetch: fetchFn });
      let calls = 0;
      const stop = storage.watch(() => {
        calls += 1;
      }, "a.drawit.kdl");
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(calls).toBe(0);
      expect(seen.some((entry) => entry.url.includes("stat=1"))).toBe(true);
      const afterBaseline = seen.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(0);
      expect(seen.slice(afterBaseline).every((entry) => entry.url.includes("stat=1"))).toBe(true);
      modified = "2026-11-05T00:00:01.000Z";
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(0);
      body = "two";
      modified = "2026-11-05T00:00:02.000Z";
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(1);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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

describe("browser session", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims the session with the bearer token and returns its id", async () => {
    const { fetchFn, seen } = fakeFetch(() => Response.json({ id: "tab-1" }));
    await expect(claimSession("tok", fetchFn)).resolves.toBe("tab-1");
    expect(seen).toMatchObject([{ url: "/api/session", method: "POST", authorization: "Bearer tok", session: null }]);
  });

  it("sends the held id when the same tab claims again", async () => {
    const { fetchFn, seen } = fakeFetch(() => Response.json({ id: "tab-1" }));
    await expect(claimSession("tok", fetchFn, "tab-1")).resolves.toBe("tab-1");
    expect(seen[0]?.session).toBe("tab-1");
  });

  it("reports that DrawIt is open elsewhere", async () => {
    const { fetchFn } = fakeFetch(() => new Response("DrawIt is open elsewhere\n", { status: 409 }));
    await expect(claimSession("tok", fetchFn)).rejects.toThrow("DrawIt is open elsewhere");
  });

  it("claims again with the id kept in session storage", async () => {
    const store = new Map([["drawit.session", "tab-1"]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const { fetchFn, seen } = fakeFetch(() => Response.json({ id: "tab-1" }));
    await expect(resumeSession("tok", storage, fetchFn)).resolves.toBe("tab-1");
    expect(seen[0]?.session).toBe("tab-1");
    expect(store.get("drawit.session")).toBe("tab-1");
  });

  it("stores the new id when the previous one has lapsed", async () => {
    const store = new Map([["drawit.session", "old"]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const { fetchFn } = fakeFetch(() => Response.json({ id: "tab-2" }));
    await expect(resumeSession("tok", storage, fetchFn)).resolves.toBe("tab-2");
    expect(store.get("drawit.session")).toBe("tab-2");
  });

  it("contacts the server again before five seconds have passed", async () => {
    vi.useFakeTimers();
    const { fetchFn, seen } = fakeFetch(() => Response.json({ id: "tab-1" }));
    const stop = holdSession("tok", "tab-1", fetchFn);
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    expect(seen).toMatchObject([{ url: "/api/session", method: "POST", authorization: "Bearer tok", session: "tab-1" }]);
  });

  it("reports when the held session is taken by another tab", async () => {
    vi.useFakeTimers();
    const { fetchFn } = fakeFetch(() => new Response("DrawIt is open elsewhere\n", { status: 409 }));
    let lost = 0;
    const stop = holdSession("tok", "tab-1", fetchFn, () => {
      lost += 1;
    });
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    expect(lost).toBe(1);
  });
});

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
