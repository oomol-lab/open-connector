import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const lexofficeApiBaseUrl = "https://api.lexware.io";
const lexofficeValidationPath = "/v1/profile";

type LexofficeRequestPhase = "validate" | "execute";
type LexofficeActionContext = ApiKeyProviderContext;
type LexofficeActionHandler = (input: Record<string, unknown>, context: LexofficeActionContext) => Promise<unknown>;

interface LexofficeRequestOptions {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: typeof fetch;
  phase: LexofficeRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const lexofficeActionHandlers: ProviderActionHandlers<"lexoffice", LexofficeActionHandler> = {
  get_profile(_input, context) {
    return requestLexofficeJson({
      path: lexofficeValidationPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
  },
  list_contacts(input, context) {
    return requestLexofficeJson({
      path: "/v1/contacts",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: pickQuery(input, ["email", "name", "number", "customer", "vendor", "page", "size"]),
    });
  },
  async get_contact(input, context) {
    return {
      contact: await requestLexofficeJson({
        path: `/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "GET",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
      }),
    };
  },
  async create_contact(input, context) {
    return {
      result: await requestLexofficeJson({
        path: "/v1/contacts",
        method: "POST",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
        body: requiredRecord(input.data, "data", providerInputError),
      }),
    };
  },
  async update_contact(input, context) {
    return {
      result: await requestLexofficeJson({
        path: `/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "PUT",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
        body: requiredRecord(input.data, "data", providerInputError),
      }),
    };
  },
  list_articles(input, context) {
    return requestLexofficeJson({
      path: "/v1/articles",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: pickQuery(input, ["articleNumber", "gtin", "type", "page", "size"]),
    });
  },
  async get_article(input, context) {
    return {
      article: await requestLexofficeJson({
        path: `/v1/articles/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "GET",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
      }),
    };
  },
  async create_article(input, context) {
    return {
      result: await requestLexofficeJson({
        path: "/v1/articles",
        method: "POST",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
        body: requiredRecord(input.data, "data", providerInputError),
      }),
    };
  },
  async update_article(input, context) {
    return {
      result: await requestLexofficeJson({
        path: `/v1/articles/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "PUT",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
        body: requiredRecord(input.data, "data", providerInputError),
      }),
    };
  },
  list_voucherlist(input, context) {
    return requestLexofficeJson({
      path: "/v1/voucherlist",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
      query: pickQuery(input, [
        "voucherType",
        "voucherStatus",
        "archived",
        "contactId",
        "voucherDateFrom",
        "voucherDateTo",
        "createdDateFrom",
        "createdDateTo",
        "updatedDateFrom",
        "updatedDateTo",
        "voucherNumber",
        "size",
        "page",
        "sort",
      ]),
    });
  },
};

export async function validateLexofficeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = await requestLexofficeJson({
    path: lexofficeValidationPath,
    method: "GET",
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });

  const profileRecord = requiredRecord(profile, "Lexoffice profile", lexofficeResponseError);
  const organizationId = requiredString(profileRecord.organizationId, "organizationId", lexofficeResponseError);
  const companyName = requiredString(profileRecord.companyName, "companyName", lexofficeResponseError);
  const connectionId = optionalString(profileRecord.connectionId);
  const created = optionalRecord(profileRecord.created);
  const userId = optionalString(created?.userId);
  const userEmail = optionalString(created?.userEmail);

  return {
    profile: {
      accountId: organizationId,
      displayName: companyName,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      organizationId,
      companyName,
      connectionId,
      userId,
      userEmail,
      validationEndpoint: lexofficeValidationPath,
    }),
  };
}

async function requestLexofficeJson(input: LexofficeRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildLexofficeUrl(input.path, input.query), {
      method: input.method,
      headers: buildLexofficeHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readLexofficePayload(response);
    if (!response.ok) {
      throw createLexofficeError(response.status, payload, input.phase);
    }
    if (payload === null) {
      throw new ProviderRequestError(502, "Lexoffice returned an empty response");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Lexoffice request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lexoffice request failed: ${error.message}` : "Lexoffice request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLexofficeUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${lexofficeApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function buildLexofficeHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readLexofficePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Lexoffice returned invalid JSON");
  }
}

function createLexofficeError(status: number, payload: unknown, phase: LexofficeRequestPhase): ProviderRequestError {
  const message = extractLexofficeErrorMessage(payload) ?? `Lexoffice request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractLexofficeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  const directMessage = optionalString(record?.message);
  if (directMessage) {
    return directMessage;
  }
  const details = Array.isArray(record?.details) ? record.details : undefined;
  const firstDetail = details?.find((detail): detail is Record<string, unknown> => optionalRecord(detail) != null);
  return optionalString(firstDetail?.message);
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = input[key];
      if (typeof value === "boolean" || typeof value === "number") {
        return [key, String(value)];
      }
      if (typeof value === "string") {
        const normalized = value.trim();
        return [key, normalized === "" ? undefined : normalized];
      }
      return [key, undefined];
    }),
  );
}

function lexofficeResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Lexoffice ${message}`);
}
