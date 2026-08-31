export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, bearerToken?: string): Promise<T> {
  const token = bearerToken?.trim();
  return request<T>(path, { headers: token ? { authorization: `Bearer ${token}` } : undefined });
}

export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return send<T>("POST", path, body);
}

export function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return send<T>("PUT", path, body);
}

export function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return send<T>("PATCH", path, body);
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

function send<T>(method: string, path: string, body: unknown): Promise<T> {
  return request<T>(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  return readJson<T>(await fetch(path, { credentials: "same-origin", ...init }));
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
