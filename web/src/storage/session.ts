// Browser side of the session token. The server opens the page at `/#<token>`; the
// fragment never reaches a server or a Referer header. The page keeps the token in
// `sessionStorage` and removes it from the address bar.

const TOKEN_KEY = "drawit.token";
const SESSION_KEY = "drawit.session";

export interface SessionEnv {
  location: { pathname: string; search: string; hash: string };
  history: { replaceState(state: unknown, unused: string, url: string): void };
  storage: Pick<Storage, "getItem" | "setItem">;
}

export class SessionElsewhere extends Error {
  constructor() {
    super("DrawIt is open elsewhere");
    this.name = "SessionElsewhere";
  }
}

const CLAIM_URL = "/api/session";
const HOLD_MS = 2000;

export async function claimSession(token: string, fetchFn: typeof fetch = fetch, held = ""): Promise<string> {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (held !== "") headers.set("X-Session-Id", held);
  const response = await fetchFn(CLAIM_URL, { method: "POST", headers });
  if (response.status === 409) throw new SessionElsewhere();
  if (!response.ok) throw new Error(`claim failed with HTTP ${String(response.status)}`);
  const body = (await response.json()) as { id?: string };
  if (typeof body.id !== "string" || body.id === "") throw new Error("claim returned no id");
  return body.id;
}

/** Claims with the id kept for this tab, then stores whatever id the server returns. */
export async function resumeSession(
  token: string,
  storage: Pick<Storage, "getItem" | "setItem">,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const id = await claimSession(token, fetchFn, storage.getItem(SESSION_KEY) ?? "");
  storage.setItem(SESSION_KEY, id);
  return id;
}

/** Contacts the server before a quiet tab loses the session. Returns the function that stops it. */
export function holdSession(token: string, id: string, fetchFn: typeof fetch = fetch, onLost?: () => void): () => void {
  const timer = setInterval(() => {
    void claimSession(token, fetchFn, id).catch((error: unknown) => {
      clearInterval(timer);
      if (error instanceof SessionElsewhere) onLost?.();
    });
  }, HOLD_MS);
  return () => {
    clearInterval(timer);
  };
}

/** Keeps the id this tab holds, so a later load can claim the same session. */
export function rememberSession(storage: Pick<Storage, "setItem">, id: string): void {
  storage.setItem(SESSION_KEY, id);
}

/**
 * Returns the session token, or null when there is none. A token in the URL fragment is stored
 * (replacing any earlier one) and the fragment is removed; otherwise the stored token is used.
 */
export function startSession(env: SessionEnv): string | null {
  const fromFragment = env.location.hash.replace(/^#/, "");
  if (fromFragment !== "") {
    env.storage.setItem(TOKEN_KEY, fromFragment);
    env.history.replaceState(null, "", env.location.pathname + env.location.search);
    return fromFragment;
  }
  return env.storage.getItem(TOKEN_KEY);
}
