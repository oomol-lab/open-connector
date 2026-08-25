import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { SignalbaseActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const signalbaseApiBaseUrl = "https://www.trysignalbase.com/api/v2";

type SignalbaseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const signalbaseActionPathByName: Record<SignalbaseActionName, string> = {
  list_companies: "/companies",
  list_funding_signals: "/signals/funding",
  list_acquisition_signals: "/signals/acquisitions",
  list_hiring_signals: "/signals/hiring",
  list_job_change_signals: "/signals/job-changes",
  list_investors: "/signals/investors",
};

export const signalbaseActionHandlers: ProviderActionHandlers<"signalbase", SignalbaseActionHandler> = {
  list_companies(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_companies, input, "execute");
  },
  list_funding_signals(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_funding_signals, input, "execute");
  },
  list_acquisition_signals(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_acquisition_signals, input, "execute");
  },
  list_hiring_signals(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_hiring_signals, input, "execute");
  },
  list_job_change_signals(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_job_change_signals, input, "execute");
  },
  list_investors(input, context) {
    return requestSignalbase(context, signalbaseActionPathByName.list_investors, input, "execute");
  },
};

export async function validateSignalbaseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestSignalbase(
    { apiKey, fetcher, signal },
    "/signals/funding",
    {
      count: "true",
      limit: 1,
    },
    "validate",
  );
  const metadata = optionalRecord(payload.meta) ?? {};

  return {
    profile: {
      accountId: "signalbase-api-key",
      displayName: "Signalbase API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: signalbaseApiBaseUrl,
      validationEndpoint: "/signals/funding",
      creditsRemaining: optionalNumber(metadata.creditsRemaining),
    },
  };
}

async function requestSignalbase(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  query: Record<string, unknown>,
  mode: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = buildSignalbaseUrl(path);
  appendQuery(url, query);

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: signalbaseHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Signalbase request failed: ${error.message}` : "Signalbase request failed",
    );
  }

  const payload = await readSignalbaseJson(response);
  assertSignalbaseResponse(response, payload, mode);
  return payload;
}

function appendQuery(url: URL, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      url.searchParams.set(key, String(value));
    }
  }
}

function buildSignalbaseUrl(path: string): URL {
  return new URL(`${signalbaseApiBaseUrl}${path}`);
}

function signalbaseHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  };
}

async function readSignalbaseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError(502, "invalid Signalbase response");
  }
}

function assertSignalbaseResponse(
  response: Response,
  payload: Record<string, unknown>,
  mode: "validate" | "execute",
): void {
  if (response.ok) {
    return;
  }

  const message = readSignalbaseErrorMessage(payload) ?? `Signalbase request failed with status ${response.status}`;

  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 402 || response.status === 404) {
    throw new ProviderRequestError(response.status, message);
  }

  throw new ProviderRequestError(response.status || 502, message);
}

function readSignalbaseErrorMessage(payload: Record<string, unknown>): string | undefined {
  return optionalString(payload.error) ?? optionalString(payload.message);
}
