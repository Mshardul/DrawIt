// Browser side of the session token (spec 6.2). The server opens the page at `/#<token>`; the
// fragment never reaches a server or a Referer header. The page keeps the token in
// `sessionStorage` and removes it from the address bar.

const TOKEN_KEY = "drawit.token";

export interface SessionEnv {
  location: { pathname: string; search: string; hash: string };
  history: { replaceState(state: unknown, unused: string, url: string): void };
  storage: Pick<Storage, "getItem" | "setItem">;
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
