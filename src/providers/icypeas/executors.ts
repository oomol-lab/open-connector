import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "icypeas";
const icypeasApiBaseUrl = "https://app.icypeas.com/api";
const icypeasRequestTimeoutMs = 30_000;
const icypeasValidationPath = "/bulk-single-searchs/read";

type IcypeasRequestMode = "validate" | "execute";
type IcypeasActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IcypeasActionHandler = (input: Record<string, unknown>, context: IcypeasActionContext) => Promise<unknown>;

export const icypeasActionHandlers: ProviderActionHandlers<"icypeas", IcypeasActionHandler> = {
  async get_subscription_information(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: "/a/actions/subscription-information",
        body: { email: requiredInputString(input.email, "email") },
      },
      context,
      "execute",
    );
    const subscription = readResponseObject(payload, "Icypeas subscription response");
    return { subscription, raw: subscription };
  },

  async submit_email_search(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: "/email-search",
        body: jsonObject({
          firstname: readOptionalString(input.firstname, "firstname"),
          lastname: readOptionalString(input.lastname, "lastname"),
          domainOrCompany: requiredInputString(input.domainOrCompany, "domainOrCompany"),
          custom: readOptionalObject(input.custom, "custom"),
        }),
      },
      context,
      "execute",
    );
    return normalizeSubmitResponse(payload, "Icypeas email search response");
  },

  async submit_email_verification(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: "/email-verification",
        body: jsonObject({
          email: requiredInputString(input.email, "email"),
          custom: readOptionalObject(input.custom, "custom"),
        }),
      },
      context,
      "execute",
    );
    return normalizeSubmitResponse(payload, "Icypeas email verification response");
  },

  async submit_domain_scan(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: "/domain-search",
        body: jsonObject({
          domainOrCompany: requiredInputString(input.domainOrCompany, "domainOrCompany"),
          custom: readOptionalObject(input.custom, "custom"),
        }),
      },
      context,
      "execute",
    );
    return normalizeSubmitResponse(payload, "Icypeas domain scan response");
  },

  async get_search_item(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: icypeasValidationPath,
        body: { id: requiredInputString(input.id, "id") },
      },
      context,
      "execute",
    );
    return normalizeSearchItemsResponse(payload, "Icypeas search item response");
  },

  async reverse_email_lookup(input, context) {
    const payload = await requestIcypeasJson(
      {
        path: "/reverse-email-lookup",
        body: { email: requiredInputString(input.email, "email") },
      },
      context,
      "execute",
    );
    const raw = readResponseObject(payload, "Icypeas reverse email lookup response");
    return {
      success: Boolean(raw.success),
      searchId: optionalString(raw.searchId) ?? null,
      status: optionalString(raw.status) ?? null,
      result: readReverseEmailLookupResult(raw),
      validationErrors: readValidationErrors(raw),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, icypeasActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateIcypeasCredential(input, fetcher, signal);
  },
};

async function validateIcypeasCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestIcypeasJson(
    {
      path: icypeasValidationPath,
      body: { mode: "single", limit: 1 },
    },
    {
      apiKey: requiredInputString(input.apiKey, "apiKey"),
      fetcher,
      signal,
    },
    "validate",
  );
  const response = readResponseObject(payload, "Icypeas validation response");
  const item = readFirstSearchItem(response);
  const upstreamUserId = item ? optionalString(item.user) : undefined;

  return {
    profile: {
      accountId: upstreamUserId ? `icypeas:${upstreamUserId}` : "icypeas-api-key",
      displayName: "Icypeas API Key",
    },
    grantedScopes: [],
    metadata: jsonObject({
      apiBaseUrl: icypeasApiBaseUrl,
      validationEndpoint: icypeasValidationPath,
      userId: upstreamUserId,
    }),
  };
}

async function requestIcypeasJson(
  input: {
    path: string;
    body: Record<string, unknown>;
  },
  context: IcypeasActionContext,
  mode: IcypeasRequestMode,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, icypeasRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildIcypeasUrl(input.path), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    if (!response.ok) {
      const errorPayload = await readIcypeasErrorPayload(response);
      throw mapIcypeasError(response.status, errorPayload, mode);
    }

    return await readIcypeasJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Icypeas request timed out after ${Math.ceil(icypeasRequestTimeoutMs / 1000)} seconds`,
      );
    }

    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Icypeas request failed: ${message}`, error);
  } finally {
    timeout.cleanup();
  }
}

function buildIcypeasUrl(path: string): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, `${icypeasApiBaseUrl}/`);
}

async function readIcypeasJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Icypeas returned invalid JSON");
  }
}

async function readIcypeasErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapIcypeasError(status: number, payload: unknown, mode: IcypeasRequestMode): ProviderRequestError {
  const message = extractIcypeasErrorMessage(payload) ?? `Icypeas request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractIcypeasErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["message", "error"]) {
    const value = optionalString(object[key]);
    if (value) {
      return value;
    }
  }

  const validationErrors = readValidationErrors(object);
  return validationErrors
    .map((item) => optionalString(item.humanReadableMessage) ?? optionalString(item.message))
    .find((item) => Boolean(item));
}

function normalizeSubmitResponse(payload: unknown, label: string): Record<string, unknown> {
  const raw = readResponseObject(payload, label);
  const item = optionalRecord(raw.item);
  return {
    success: Boolean(raw.success),
    searchId: item ? (optionalString(item._id) ?? null) : null,
    status: item ? (optionalString(item.status) ?? null) : null,
    item: item ?? null,
    validationErrors: readValidationErrors(raw),
    raw,
  };
}

function normalizeSearchItemsResponse(payload: unknown, label: string): Record<string, unknown> {
  const raw = readResponseObject(payload, label);
  const items = readSearchItems(raw);
  const item = items[0] ?? null;
  return {
    success: Boolean(raw.success),
    item,
    items,
    status: item ? (optionalString(item.status) ?? null) : null,
    total: typeof raw.total === "number" && Number.isInteger(raw.total) && raw.total >= 0 ? raw.total : null,
    sorts: Array.isArray(raw.sorts) ? raw.sorts : [],
    validationErrors: readValidationErrors(raw),
    raw,
  };
}

function readSearchItems(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(raw.items)) {
    return [];
  }

  return raw.items.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

function readFirstSearchItem(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  return readSearchItems(raw)[0];
}

function readValidationErrors(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(raw.validationErrors)) {
    return [];
  }

  return raw.validationErrors.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

function readReverseEmailLookupResult(raw: Record<string, unknown>): string | null {
  for (const fieldName of ["result", "results", "url"]) {
    const value = optionalString(raw[fieldName]);
    if (value !== undefined) {
      return value;
    }
  }

  return null;
}

function readResponseObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} was not a JSON object`, value);
  }
  return object;
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return requiredInputString(value, fieldName);
}

function readOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value == null) {
    return undefined;
  }
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`, value);
  }
  return object;
}
