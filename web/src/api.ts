export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  adminToken?: string;
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      headers: headersFor(options),
      credentials: "same-origin",
    }),
  );
}

export async function apiPost<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      method: "POST",
      headers: headersFor(options, true),
      credentials: "same-origin",
      body: JSON.stringify(body),
    }),
  );
}

export async function apiPut<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      method: "PUT",
      headers: headersFor(options, true),
      credentials: "same-origin",
      body: JSON.stringify(body),
    }),
  );
}

export async function apiDelete<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      method: "DELETE",
      headers: headersFor(options),
      credentials: "same-origin",
    }),
  );
}

function headersFor(options: RequestOptions, json = false): Headers {
  const headers = new Headers();
  if (json) {
    headers.set("content-type", "application/json");
  }
  const token = options.adminToken?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload) ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

function errorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  if ("errorMessage" in payload && typeof payload.errorMessage === "string") {
    return payload.errorMessage;
  }
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  if ("error" in payload && payload.error && typeof payload.error === "object") {
    const error = payload.error as { message?: unknown };
    return typeof error.message === "string" ? error.message : undefined;
  }
  return undefined;
}
