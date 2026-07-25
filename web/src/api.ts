export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  bearerToken?: string;
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
  const token = options.bearerToken?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = parseJson(await response.text());
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload) ?? `Request failed with ${response.status}`);
  }
  // A successful response whose body is not JSON means something rewrote it in
  // transit. Returning the failed parse as T would hand the caller a null typed
  // as the payload, and the first property read off it crashes far from the
  // cause; a compressing proxy did exactly that to the whole dashboard once.
  if (payload === undefined) {
    throw new ApiError(response.status, `Request succeeded with ${response.status} but the response body was not JSON`);
  }
  return payload as T;
}

/** Returns `undefined` for a body that is not JSON. `JSON.parse` never does. */
function parseJson(body: string): unknown {
  if (body === "") {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
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
