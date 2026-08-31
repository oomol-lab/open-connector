import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { DialMyCallsActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface DialmycallsCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export const dialMyCallsApiBaseUrl = "https://api.dialmycalls.com/2.0";

type DialMyCallsPhase = "validate" | "execute";
type DialMyCallsMethod = "GET" | "POST" | "PUT" | "DELETE";
type DialMyCallsActionHandler = (
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey: string,
) => Promise<unknown>;

export const dialMyCallsActionHandlers: ProviderActionHandlers<"dialmycalls", DialMyCallsActionHandler> = {
  async get_account(_input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: "/account",
      fetcher,
      phase: "execute",
    });
  },
  async create_contact(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: "/contact",
      method: "POST",
      body: buildContactBody(input),
      fetcher,
      phase: "execute",
    });
  },
  async get_contact(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/contact/${encodeIdentifier(input.contact_id, "contact_id")}`,
      fetcher,
      phase: "execute",
    });
  },
  async update_contact(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/contact/${encodeIdentifier(input.contact_id, "contact_id")}`,
      method: "PUT",
      body: buildContactBody(input),
      fetcher,
      phase: "execute",
    });
  },
  async delete_contact(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/contact/${encodeIdentifier(input.contact_id, "contact_id")}`,
      method: "DELETE",
      fetcher,
      phase: "execute",
    });
  },
  async list_contacts(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: "/contacts",
      range: readRange(input),
      fetcher,
      phase: "execute",
    });
  },
  async list_group_contacts(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/contacts/${encodeIdentifier(input.group_id, "group_id")}`,
      range: readRange(input),
      fetcher,
      phase: "execute",
    });
  },
  async create_group(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: "/group",
      method: "POST",
      body: { name: readRequiredString(input.name, "name") },
      fetcher,
      phase: "execute",
    });
  },
  async get_group(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/group/${encodeIdentifier(input.group_id, "group_id")}`,
      fetcher,
      phase: "execute",
    });
  },
  async update_group(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/group/${encodeIdentifier(input.group_id, "group_id")}`,
      method: "PUT",
      body: { name: readRequiredString(input.name, "name") },
      fetcher,
      phase: "execute",
    });
  },
  async delete_group(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: `/group/${encodeIdentifier(input.group_id, "group_id")}`,
      method: "DELETE",
      fetcher,
      phase: "execute",
    });
  },
  async list_groups(input, fetcher, apiKey) {
    return requestDialMyCallsJson({
      apiKey,
      path: "/groups",
      range: readRange(input),
      fetcher,
      phase: "execute",
    });
  },
};

export async function validateDialMyCallsCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<DialmycallsCredentialCheck> {
  const payload = await requestDialMyCallsJson({
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    path: "/account",
    fetcher,
    phase: "validate",
  });
  const envelope = requireObject(payload, "DialMyCalls account response");
  const account = optionalRecord(envelope.results);
  const meta = optionalRecord(envelope.meta);

  return {
    providerAccountId: "dialmycalls",
    accountLabel: "DialMyCalls API Key",
    providerScopes: [],
    providerMetadata: compactObject({
      apiBaseUrl: dialMyCallsApiBaseUrl,
      validationEndpoint: "/account",
      creditsAvailable: typeof account?.credits_available === "number" ? account.credits_available : undefined,
      accountCreatedAt: optionalString(account?.created_at),
      requestId: optionalString(meta?.request_id),
    }),
  };
}

export async function executeDialMyCallsAction(
  input: ApiKeyProviderActionInput & {
    actionName: DialMyCallsActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = dialMyCallsActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(500, `dialmycalls action is not implemented yet: ${input.actionName}`);
  }

  return handler(
    input.input,
    fetcher,
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
  );
}

async function requestDialMyCallsJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: DialMyCallsPhase;
  method?: DialMyCallsMethod;
  body?: Record<string, unknown>;
  range?: string;
}) {
  const timeoutHandle = createProviderTimeout(undefined);

  try {
    const response = await input.fetcher(buildDialMyCallsUrl(input.path), {
      method: input.method ?? "GET",
      headers: buildDialMyCallsHeaders(input.apiKey, {
        hasBody: input.body !== undefined,
        range: input.range,
      }),
      signal: timeoutHandle.signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = await readDialMyCallsPayload(response);

    if (!response.ok || isFailureEnvelope(payload)) {
      throw createDialMyCallsError(response.status, payload, input.phase);
    }

    return requireEnvelope(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DialMyCalls request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DialMyCalls request failed: ${error.message}` : "DialMyCalls request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildDialMyCallsUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${dialMyCallsApiBaseUrl}/`);
}

function buildDialMyCallsHeaders(apiKey: string, options: { hasBody: boolean; range?: string }) {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`,
    "user-agent": providerUserAgent,
    ...(options.hasBody ? { "content-type": "application/json" } : {}),
    ...(options.range ? { range: options.range } : {}),
  };
}

async function readDialMyCallsPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    throw new ProviderRequestError(502, "DialMyCalls returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DialMyCalls returned invalid JSON");
  }
}

function createDialMyCallsError(status: number, payload: unknown, phase: DialMyCallsPhase) {
  const envelope = optionalRecord(payload);
  const meta = optionalRecord(envelope?.meta);
  const upstreamStatus = typeof meta?.status === "number" && Number.isInteger(meta.status) ? meta.status : status;
  const message = extractDialMyCallsErrorMessage(payload) ?? `DialMyCalls request failed with status ${upstreamStatus}`;

  if (upstreamStatus === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && upstreamStatus >= 400 && upstreamStatus < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (upstreamStatus === 401 || upstreamStatus === 403)) {
    return new ProviderRequestError(upstreamStatus, message);
  }

  if (phase === "execute" && upstreamStatus >= 400 && upstreamStatus < 500) {
    return new ProviderRequestError(upstreamStatus, message);
  }

  return new ProviderRequestError(upstreamStatus || 500, message);
}

function extractDialMyCallsErrorMessage(payload: unknown) {
  const envelope = optionalRecord(payload);
  const results = optionalRecord(envelope?.results);
  const error = optionalRecord(results?.error);
  return optionalString(error?.message)?.trim();
}

function isFailureEnvelope(payload: unknown) {
  const envelope = optionalRecord(payload);
  const meta = optionalRecord(envelope?.meta);
  return meta?.result === "failure";
}

function requireEnvelope(payload: unknown) {
  const envelope = requireObject(payload, "DialMyCalls response");
  if (!("results" in envelope) || !optionalRecord(envelope.meta)) {
    throw new ProviderRequestError(502, "DialMyCalls returned an invalid response envelope");
  }
  return envelope;
}

function buildContactBody(input: Record<string, unknown>) {
  return compactObject({
    firstname: readOptionalString(input.firstname),
    lastname: readOptionalString(input.lastname),
    phone: readRequiredString(input.phone, "phone"),
    extension: readOptionalString(input.extension),
    email: readOptionalString(input.email),
    extra1: readOptionalString(input.extra1),
    groups: readOptionalStringArray(input.groups, "groups"),
  });
}

function readRange(input: Record<string, unknown>) {
  const start = input.range_start === undefined ? 1 : readRequiredInteger(input.range_start, "range_start");
  const end = input.range_end === undefined ? 100 : readRequiredInteger(input.range_end, "range_end");
  if (end < start) {
    throw new ProviderRequestError(400, "range_end must be greater than or equal to range_start");
  }
  if (end - start >= 100) {
    throw new ProviderRequestError(400, "DialMyCalls allows at most 100 records per request");
  }
  return `records=${start}-${end}`;
}

function encodeIdentifier(value: unknown, fieldName: string) {
  return encodeURIComponent(readRequiredString(value, fieldName));
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of strings`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value as number;
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${context} must be an object`);
  }
  return object;
}
