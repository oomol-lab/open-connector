export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementBinding;
}

export interface D1PreparedStatementBinding {
  bind(...values: unknown[]): D1PreparedStatementBinding;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}

export interface R2BucketBinding {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: unknown,
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBinding | null>;
  delete(key: string): Promise<void>;
}

export interface R2ObjectBinding {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}
