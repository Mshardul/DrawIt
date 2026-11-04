import { assertFitsLimit, type FileInfo, type Preferences, type StorageAdapter, StorageError, type StorageErrorCode, type TopListing, type Unsubscribe, type WorkspaceInfo, type WorkspaceTarget } from "./adapter.ts";

export interface HttpStorageOptions {
  /** The session token, sent as `Authorization: Bearer` on every request. */
  token: string;
  /** The id of the tab that holds the server session, sent as `X-Session-Id`. */
  session: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const errorCodes: Record<number, StorageErrorCode> = {
  404: "not-found",
  400: "invalid-path",
  403: "refused",
  413: "too-large",
  401: "session-lost",
};

/** The storage adapter over the local server's API. */
export class HttpStorage implements StorageAdapter {
  readonly #token: string;
  readonly #fetch: typeof fetch;
  #session: string;
  #workspace = "";

  constructor(options: HttpStorageOptions) {
    this.#token = options.token;
    this.#session = options.session;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
  }

  async list(): Promise<FileInfo[]> {
    const response = await this.#request("/api/files");
    const body = (await response.json()) as { files: FileInfo[] };
    return body.files;
  }

  async read(path: string): Promise<Uint8Array> {
    const response = await this.#request(fileUrl(path));
    return new Uint8Array(await response.arrayBuffer());
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    assertFitsLimit(path, data);
    await this.#request(fileUrl(path), { method: "PUT", body: data as BodyInit });
  }

  /**
   * The server has no watch endpoint, so this never calls `listener`. It returns an
   * unsubscribe function that does nothing.
   */
  watch(): Unsubscribe {
    return () => {};
  }

  async currentWorkspace(): Promise<WorkspaceInfo> {
    return this.#workspaceView("/api/workspace");
  }

  async openWorkspace(target: WorkspaceTarget): Promise<WorkspaceInfo> {
    return this.#workspaceView("/api/workspace", { method: "POST", body: JSON.stringify(target) });
  }

  async listTop(): Promise<TopListing> {
    const response = await this.#request("/api/files?top=1");
    return (await response.json()) as TopListing;
  }

  async stat(path: string): Promise<FileInfo> {
    const response = await this.#request(`${fileUrl(path)}&stat=1`);
    return (await response.json()) as FileInfo;
  }

  async claimSession(): Promise<string> {
    return this.#claim(false);
  }

  async takeoverSession(): Promise<string> {
    return this.#claim(true);
  }

  async readPreferences(): Promise<Preferences> {
    const response = await this.#request("/api/preferences");
    return (await response.json()) as Preferences;
  }

  async patchPreferences(patch: Record<string, Record<string, unknown>>): Promise<Preferences> {
    const response = await this.#request("/api/preferences", { method: "PATCH", body: JSON.stringify(patch) });
    return (await response.json()) as Preferences;
  }

  async #workspaceView(url: string, init?: RequestInit): Promise<WorkspaceInfo> {
    const response = await this.#request(url, init);
    const view = (await response.json()) as WorkspaceInfo;
    this.#workspace = view.id;
    return view;
  }

  async #claim(takeover: boolean): Promise<string> {
    const response = await this.#request("/api/session", takeover ? { method: "POST", body: JSON.stringify({ takeover: true }) } : { method: "POST" });
    const body = (await response.json()) as { id?: string };
    if (typeof body.id !== "string" || body.id === "") throw new Error("claim returned no id");
    this.#session = body.id;
    return body.id;
  }

  async #request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.#token}`, "X-Session-Id": this.#session };
    if (this.#workspace !== "") headers["X-Workspace-Id"] = this.#workspace;
    const response = await this.#fetch(url, { ...init, headers });
    if (response.ok) return response;
    const message = (await response.text()).trim();
    const code = response.status === 409 && message.includes("open elsewhere") ? "open-elsewhere" : errorCodes[response.status];
    if (response.status === 409 && code !== "open-elsewhere") throw new StorageError("conflict", message);
    if (code) throw new StorageError(code, message);
    throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${String(response.status)}: ${message}`);
  }
}

function fileUrl(path: string): string {
  return `/api/file?path=${encodeURIComponent(path)}`;
}
