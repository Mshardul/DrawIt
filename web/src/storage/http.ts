import { type FileInfo, type StorageAdapter, StorageError, type StorageErrorCode, type Unsubscribe } from "./adapter.ts";

export interface HttpStorageOptions {
  /** The session token, sent as `Authorization: Bearer` on every request. */
  token: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const errorCodes: Record<number, StorageErrorCode> = {
  404: "not-found",
  400: "invalid-path",
  403: "refused",
};

/** The storage adapter over the local server's API. */
export class HttpStorage implements StorageAdapter {
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: HttpStorageOptions) {
    this.#token = options.token;
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
    await this.#request(fileUrl(path), { method: "PUT", body: data as BodyInit });
  }

  /**
   * The server has no watch endpoint, so this never calls `listener`. It returns an
   * unsubscribe function that does nothing.
   */
  watch(): Unsubscribe {
    return () => {};
  }

  async #request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.#fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.#token}` },
    });
    if (response.ok) return response;
    const message = (await response.text()).trim();
    const code = errorCodes[response.status];
    if (code) throw new StorageError(code, message);
    throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${String(response.status)}: ${message}`);
  }
}

function fileUrl(path: string): string {
  return `/api/file?path=${encodeURIComponent(path)}`;
}
