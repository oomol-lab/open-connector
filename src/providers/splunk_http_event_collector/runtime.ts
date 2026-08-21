import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { SplunkHttpEventCollectorActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

import { createHash, randomUUID } from "node:crypto";

export interface SplunkHttpEventCollectorCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface SplunkHecCredential {
  readonly token: string;
  readonly baseUrl: string;
}

interface SplunkHecExpectedResponse {
  readonly status: number;
  readonly code: number;
}

interface SplunkHecActionInput extends ApiKeyProviderActionInput {
  readonly actionName: SplunkHttpEventCollectorActionName;
  readonly input: Record<string, unknown>;
}

interface SplunkHecRequestInput {
  readonly credential: SplunkHecCredential;
  readonly path: string;
  readonly body?: string;
  readonly contentType?: string;
  readonly channel?: string;
  readonly query?: Record<string, unknown>;
  readonly expectedResponse?: SplunkHecExpectedResponse;
  readonly phase: "validate" | "execute";
  readonly fetcher: typeof fetch;
}

type SplunkHecActionHandler = (input: SplunkHecActionInput, fetcher: typeof fetch) => Promise<unknown>;

const splunkHecRequestTimeoutMs = 30_000;

export const splunkHttpEventCollectorActionHandlers: ProviderActionHandlers<
  "splunk_http_event_collector",
  SplunkHecActionHandler
> = {
  send_event(input, fetcher) {
    const channel = optionalString(input.input.channel);
    return requestSplunkHec({
      credential: resolveActionCredential(input),
      path: "/services/collector/event",
      body: JSON.stringify(
        compactObject({
          event: input.input.event,
          time: input.input.time,
          host: input.input.host,
          source: input.input.source,
          sourcetype: input.input.sourcetype,
          index: input.input.index,
          fields: input.input.fields,
        }),
      ),
      contentType: "application/json",
      channel,
      phase: "execute",
      fetcher,
    });
  },
  send_raw_event(input, fetcher) {
    const channel = optionalString(input.input.channel) ?? randomUUID();
    return requestSplunkHec({
      credential: resolveActionCredential(input),
      path: "/services/collector/raw",
      body: optionalString(input.input.event) ?? "",
      contentType: "text/plain; charset=utf-8",
      channel,
      query: {
        time: input.input.time,
        host: input.input.host,
        source: input.input.source,
        sourcetype: input.input.sourcetype,
        index: input.input.index,
      },
      phase: "execute",
      fetcher,
    });
  },
};

export async function validateSplunkHttpEventCollectorCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<SplunkHttpEventCollectorCredentialCheck> {
  const credential = resolveCredential(
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    input.baseUrl,
  );
  await requestSplunkHec({
    credential,
    path: "/services/collector/event",
    body: "",
    contentType: "application/json",
    expectedResponse: {
      status: 400,
      code: 5,
    },
    phase: "validate",
    fetcher,
  });
  const host = new URL(credential.baseUrl).host;
  const tokenHash = createHash("sha256").update(credential.token).digest("hex");

  return {
    providerAccountId: `splunk-hec:${host}:${tokenHash.slice(0, 16)}`,
    accountLabel: `Splunk HEC ${host}`,
    providerScopes: [],
    providerMetadata: {
      baseUrl: credential.baseUrl,
      validationEndpoint: "/services/collector/event",
    },
  };
}

export async function executeSplunkHttpEventCollectorAction(
  input: SplunkHecActionInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = splunkHttpEventCollectorActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown splunk_http_event_collector action: ${input.actionName}`);
  }

  return handler(input, fetcher);
}

async function requestSplunkHec(input: SplunkHecRequestInput) {
  const timeout = createProviderTimeout(undefined, splunkHecRequestTimeoutMs);
  const url = buildSplunkHecUrl(input.credential.baseUrl, input.path, input.query);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Splunk ${input.credential.token}`,
      "user-agent": providerUserAgent,
    };
    if (input.contentType) {
      headers["content-type"] = input.contentType;
    }
    if (input.channel) {
      headers["x-splunk-request-channel"] = input.channel;
    }

    const response = await input.fetcher(url, {
      method: input.body == null ? "GET" : "POST",
      headers,
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readSplunkHecPayload(response);
    const code = optionalInteger(optionalRecord(payload)?.code);
    if (
      input.expectedResponse &&
      response.status === input.expectedResponse.status &&
      code === input.expectedResponse.code
    ) {
      return normalizeSplunkHecResponse(payload);
    }
    if (input.expectedResponse && response.ok) {
      throw new ProviderRequestError(400, "Splunk HEC credential validation returned an unexpected response");
    }
    if (!response.ok) {
      throw mapSplunkHecError(response.status, code, readSplunkHecMessage(payload), input.phase);
    }
    return normalizeSplunkHecResponse(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `Splunk HEC request timed out after ${Math.ceil(splunkHecRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Splunk HEC request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

function resolveActionCredential(input: SplunkHecActionInput) {
  return resolveCredential(input.apiKey, optionalString(input.providerMetadata?.baseUrl));
}

function resolveCredential(apiKey: string, baseUrlInput: unknown): SplunkHecCredential {
  const token = apiKey.trim();
  if (!token) {
    throw new ProviderRequestError(400, "Splunk HEC token is required");
  }
  return {
    token,
    baseUrl: normalizeSplunkHecBaseUrl(baseUrlInput),
  };
}

export function normalizeSplunkHecBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const rawValue = optionalString(value)?.trim();
  if (!rawValue) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must be an HTTPS URL");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }

  url.search = "";
  url.hash = "";
  url.pathname = "/";
  return url.toString().replace(/\/$/, "");
}

function buildSplunkHecUrl(baseUrl: string, path: string, query: Record<string, unknown> = {}) {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readSplunkHecPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function normalizeSplunkHecResponse(payload: unknown) {
  const object = optionalRecord(payload);
  const text = optionalString(object?.text);
  const code = optionalInteger(object?.code);
  if (text == null || code == null) {
    throw new ProviderRequestError(502, "Splunk HEC returned an invalid response");
  }
  return compactObject({
    text,
    code,
    ackID: optionalInteger(object?.ackID),
  });
}

function readSplunkHecMessage(payload: unknown) {
  const object = optionalRecord(payload);
  return optionalString(object?.text) ?? "Splunk HEC request failed";
}

function mapSplunkHecError(status: number, code: number | undefined, message: string, phase: "validate" | "execute") {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403 || code === 4 || code === 21 || code === 22)) {
    return new ProviderRequestError(409, message);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
