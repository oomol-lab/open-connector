import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const snipcartApiBaseUrl = "https://app.snipcart.com/api";

type RequestPhase = "validate" | "execute";

export async function validateSnipcartCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  await requestSnipcartJson({
    apiKey,
    path: "/orders",
    query: { limit: "1" },
    fetcher,
    phase: "validate",
  });

  return {
    accountLabel: "Snipcart API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: snipcartApiBaseUrl,
      validationEndpoint: "/orders?limit=1",
    },
  };
}

export async function executeSnipcartAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  switch (actionName) {
    case "list_orders":
      return requestSnipcartJson({
        apiKey,
        path: "/orders",
        query: buildListQuery(input),
        fetcher,
        phase: "execute",
      });
    case "get_order":
      return {
        order: await requestSnipcartJson({
          apiKey,
          path: `/orders/${encodeURIComponent(readRequiredString(input, "token"))}`,
          query: buildBooleanQuery(input, ["includeTestOrders"]),
          fetcher,
          phase: "execute",
        }),
      };
    case "list_customers":
      return requestSnipcartJson({
        apiKey,
        path: "/customers",
        query: buildListQuery(input),
        fetcher,
        phase: "execute",
      });
    case "get_customer":
      return {
        customer: await requestSnipcartJson({
          apiKey,
          path: `/customers/${encodeURIComponent(readRequiredString(input, "customerId"))}`,
          fetcher,
          phase: "execute",
        }),
      };
  }
}

function buildListQuery(input: Record<string, unknown>) {
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = String(value);
    }
  }
  return query;
}

function buildBooleanQuery(input: Record<string, unknown>, keys: string[]) {
  const query: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = input[key];
    query[key] = typeof value === "boolean" ? String(value) : undefined;
  }
  return query;
}

function readRequiredString(input: Record<string, unknown>, key: string) {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

async function requestSnipcartJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: RequestPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined);
  const url = new URL(`${snipcartApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${input.apiKey}:`).toString("base64")}`,
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readPayload(response, response.ok);
    if (!response.ok) {
      throw createSnipcartError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Snipcart request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Snipcart request failed: ${error.message}` : "Snipcart request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readPayload(response: Response, requireJson: boolean) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!requireJson) {
      return null;
    }
    throw new ProviderRequestError(502, "Snipcart returned invalid JSON");
  }
}

function createSnipcartError(response: Response, payload: unknown, phase: RequestPhase) {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Snipcart request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status, message);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
