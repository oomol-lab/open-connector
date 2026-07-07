export function adminHeaders(headers: HeadersInit = {}): HeadersInit {
  return bearerHeaders(process.env.OOMOL_CONNECT_ADMIN_TOKEN, headers);
}

export function runtimeHeaders(headers: HeadersInit = {}): HeadersInit {
  return bearerHeaders(process.env.OOMOL_CONNECT_RUNTIME_TOKEN, headers);
}

function bearerHeaders(token: string | undefined, headers: HeadersInit): HeadersInit {
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    authorization: `Bearer ${token}`,
  };
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}
