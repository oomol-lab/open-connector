const defaultFetchTimeoutMs = 15_000;

export function adminHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return bearerHeaders(process.env.OOMOL_CONNECT_ADMIN_TOKEN, headers);
}

export function runtimeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return bearerHeaders(process.env.OOMOL_CONNECT_RUNTIME_TOKEN, headers);
}

function bearerHeaders(token: string | undefined, headers: Record<string, string>): Record<string, string> {
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    authorization: `Bearer ${token}`,
  };
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = defaultFetchTimeoutMs,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = (): void => controller.abort();
  if (init.signal?.aborted) {
    controller.abort();
  }
  init.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${text}`);
    }

    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}
