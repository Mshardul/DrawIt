import { assertFitsLimit, type BrowseListing, type FileInfo, type ImportedFile, type Preferences, type StorageAdapter, StorageError, type StorageErrorCode, type TopListing, type Unsubscribe, type WatchEvent, type WorkspaceInfo, type WorkspaceTarget } from "./adapter.ts";
import { pollFile } from "./poll.ts";

export interface HttpStorageOptions {
  /** The session token, sent as `Authorization: Bearer` on every request. */
  token: string;
  /** The id of the tab that holds the server session, sent as `X-Session-Id`. */
  session: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Called when a request finds the session lost or held by another tab. */
  onLost?: () => void;
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
  readonly #onLost: (() => void) | undefined;
  #session: string;
  #workspace = "";

  constructor(options: HttpStorageOptions) {
    this.#token = options.token;
    this.#session = options.session;
    this.#onLost = options.onLost;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
  }

  useSession(id: string): void {
    this.#session = id;
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

  /** There is no watch endpoint, so `path` is polled. With no path there is no file to check. */
  watch(listener: (event: WatchEvent) => void, path?: string): Unsubscribe {
    if (path === undefined) return () => {};
    return pollFile(this, path, () => {
      listener({ type: "changed", path });
    });
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

  async createProject(name: string): Promise<string> {
    return this.#library({ project: name });
  }

  async createDraft(): Promise<string> {
    return this.#library({ draft: true });
  }

  async createDiagram(project: string, name: string): Promise<string> {
    return this.#library({ project, diagram: name });
  }

  async renameItem(from: string, to: string): Promise<string> {
    return this.#library({ from, to });
  }

  async deleteItem(path: string, noTrash = false): Promise<string> {
    return this.#library(noTrash ? { delete: path, noTrash: true } : { delete: path });
  }

  async copyFile(from: string, dir: string): Promise<string> {
    return this.#library({ copy: from, into: dir });
  }

  async importFiles(project: string, files: readonly ImportedFile[]): Promise<string[]> {
    for (const file of files) assertFitsLimit(file.path, file.data);
    const response = await this.#request("/api/library/import", {
      method: "POST",
      body: JSON.stringify({ project, files: files.map((file) => ({ path: file.path, data: bytesToBase64(file.data) })) }),
    });
    const body = (await response.json()) as { paths: string[] };
    return body.paths;
  }

  async readLibrary(path: string): Promise<Uint8Array> {
    const response = await this.#request(libraryFileUrl(path));
    return new Uint8Array(await response.arrayBuffer());
  }

  async replaceLibrary(path: string, data: Uint8Array): Promise<void> {
    assertFitsLimit(path, data);
    await this.#request(libraryFileUrl(path), { method: "PUT", body: data as BodyInit });
  }

  async browse(path?: string): Promise<BrowseListing> {
    const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
    const response = await this.#request(url);
    return (await response.json()) as BrowseListing;
  }

  async createFolder(path: string, name: string): Promise<string> {
    const response = await this.#request("/api/browse", { method: "POST", body: JSON.stringify({ path, name }) });
    const body = (await response.json()) as { path: string };
    return body.path;
  }

  async #library(body: Record<string, unknown>): Promise<string> {
    const response = await this.#request("/api/library", { method: "POST", body: JSON.stringify(body) });
    const view = (await response.json()) as { path: string };
    return view.path;
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
    if (code === "session-lost" || code === "open-elsewhere") this.#onLost?.();
    if (response.status === 409 && code !== "open-elsewhere") throw new StorageError("conflict", message);
    if (code) throw new StorageError(code, message);
    throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${String(response.status)}: ${message}`);
  }
}

function fileUrl(path: string): string {
  return `/api/file?path=${encodeURIComponent(path)}`;
}

function libraryFileUrl(path: string): string {
  return `/api/library/file?path=${encodeURIComponent(path)}`;
}

function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
