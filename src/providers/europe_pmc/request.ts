import { optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

export const europePmcApiBaseUrl = "https://www.ebi.ac.uk/europepmc/webservices/rest";
export const europePmcAnnotationsApiBaseUrl = "https://www.ebi.ac.uk/europepmc/annotations_api";
export const europePmcGrantsApiBaseUrl = "https://www.ebi.ac.uk/europepmc/GristAPI/rest";

const requestTimeoutMs = 45_000;

type QueryParameter = string | readonly string[] | undefined;

export async function requestEuropePmcJson(input: {
  baseUrl?: string;
  path: string;
  params?: Record<string, QueryParameter>;
  method?: "GET" | "POST";
  jsonBody?: unknown;
  accept?: string;
  fetcher: typeof fetch;
}): Promise<unknown> {
  const response = await requestEuropePmcText({
    baseUrl: input.baseUrl,
    path: input.path,
    params: input.params,
    method: input.method,
    jsonBody: input.jsonBody,
    accept: input.accept ?? "application/json",
    fetcher: input.fetcher,
  });

  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Europe PMC returned invalid JSON");
  }
}

export async function requestEuropePmcObject(input: {
  baseUrl?: string;
  path: string;
  params?: Record<string, QueryParameter>;
  method?: "GET" | "POST";
  jsonBody?: unknown;
  accept?: string;
  fetcher: typeof fetch;
}): Promise<Record<string, unknown>> {
  const payload = await requestEuropePmcJson(input);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Europe PMC returned an invalid payload");
  }
  return record;
}

export async function requestEuropePmcText(input: {
  baseUrl?: string;
  path: string;
  params?: Record<string, QueryParameter>;
  method?: "GET" | "POST";
  jsonBody?: unknown;
  accept: string;
  fetcher: typeof fetch;
}): Promise<{ body: string; contentType: string | null }> {
  return runProviderRequest({ timeoutMs: requestTimeoutMs, label: "Europe PMC" }, async (signal) => {
    const headers = new Headers({
      accept: input.accept,
      "user-agent": providerUserAgent,
    });
    if (input.jsonBody !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await input.fetcher(
      buildEuropePmcUrl(input.baseUrl ?? europePmcApiBaseUrl, input.path, input.params),
      {
        method: input.method ?? "GET",
        headers,
        ...(input.jsonBody === undefined ? {} : { body: JSON.stringify(input.jsonBody) }),
        signal,
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw createEuropePmcError(response.status, body);
    }

    return {
      body,
      contentType: response.headers.get("content-type"),
    };
  });
}

function buildEuropePmcUrl(baseUrl: string, path: string, params: Record<string, QueryParameter> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${baseUrl}/`);

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      url.searchParams.set(key, value);
    } else if (value !== undefined) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    }
  }

  return url;
}

function createEuropePmcError(status: number, body: string) {
  const message = extractErrorMessage(body) ?? `Europe PMC request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(500, message, status);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractErrorMessage(body: string) {
  const trimmed = body.trim();
  if (trimmed === "") {
    return undefined;
  }

  try {
    const payload = optionalRecord(JSON.parse(trimmed));
    return (
      readOptionalString(payload?.message) ??
      readOptionalString(payload?.error) ??
      readOptionalString(payload?.errormsg)
    );
  } catch {
    return trimmed.length <= 500 ? trimmed : `${trimmed.slice(0)}…`;
  }
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}
