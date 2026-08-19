import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const shortMenuApiBaseUrl = "https://api.shortmenu.com";
const shortMenuValidationPath = "/links";

type ShortMenuPhase = "validate" | "execute";
type ShortMenuActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

interface ShortMenuRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: ShortMenuPhase;
  method?: "POST" | "PUT" | "DELETE";
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const shortMenuActionHandlers: ProviderActionHandlers<"short_menu", ShortMenuActionHandler> = {
  create_link(input, context) {
    return createLink(input, context);
  },
  update_link(input, context) {
    return updateLink(input, context);
  },
  delete_link(input, context) {
    return deleteLink(input, context);
  },
};

export async function validateShortMenuCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const response = await shortMenuFetch({
    apiKey,
    path: shortMenuValidationPath,
    method: "POST",
    body: {},
    fetcher,
    phase: "validate",
  });

  if (response.status === 401) {
    throw await toShortMenuError(response, "validate", false);
  }

  if (!response.ok && response.status !== 400 && response.status !== 404) {
    throw await toShortMenuError(response, "validate", true);
  }

  return {
    profile: {
      accountId: "short-menu-api-key",
      displayName: "Short Menu API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: shortMenuApiBaseUrl,
      validationEndpoint: shortMenuValidationPath,
      validationStatus: response.status,
    }),
  };
}

async function createLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestShortMenuJson({
    apiKey: context.apiKey,
    path: "/links",
    method: "POST",
    body: {
      destinationUrl: requireString(input.destinationUrl, "destinationUrl"),
      domain: requireString(input.domain, "domain"),
      slug: optionalString(input.slug),
      tags: readTagInputArray(input.tags, "tags"),
    },
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return normalizeLink(payload);
}

async function updateLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const linkId = encodeURIComponent(requireString(input.id, "id"));
  const payload = await requestShortMenuJson({
    apiKey: context.apiKey,
    path: `/links/${linkId}`,
    method: "PUT",
    body: compactObject({
      destinationUrl: optionalString(input.destinationUrl),
      tags: input.tags === undefined ? undefined : readTagInputArray(input.tags, "tags"),
    }),
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return normalizeLink(payload);
}

async function deleteLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const linkId = requireString(input.id, "id");
  const response = await shortMenuFetch({
    apiKey: context.apiKey,
    path: `/links/${encodeURIComponent(linkId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    phase: "execute",
  });

  if (!response.ok) {
    throw await toShortMenuError(response, "execute", true);
  }

  const payload = await readJsonPayload(response);
  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, "Short Menu returned invalid JSON");
  }

  return {
    id: linkId,
    deleted: true,
  };
}

async function requestShortMenuJson(input: ShortMenuRequestOptions) {
  const response = await shortMenuFetch(input);
  if (!response.ok) {
    throw await toShortMenuError(response, input.phase, input.notFoundAsInvalidInput === true);
  }

  const payload = await readJsonPayload(response);
  if (payload.kind === "empty") {
    throw new ProviderRequestError(502, "Short Menu returned an empty response body");
  }
  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, "Short Menu returned invalid JSON");
  }

  return payload.value;
}

async function shortMenuFetch(input: ShortMenuRequestOptions) {
  const url = new URL(input.path, shortMenuApiBaseUrl);

  try {
    return await input.fetcher(url, {
      method: input.method ?? "POST",
      headers: shortMenuHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transport error";
    const normalizedMessage = message.toLowerCase();
    const isTimeout =
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
      normalizedMessage.includes("timeout") ||
      normalizedMessage.includes("timed out");

    throw new ProviderRequestError(isTimeout ? 504 : 502, `Short Menu request failed: ${message}`);
  }
}

function shortMenuHeaders(apiKey: string, hasBody: boolean) {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function toShortMenuError(response: Response, phase: ShortMenuPhase, notFoundAsInvalidInput: boolean) {
  const payload = await readJsonPayload(response);
  const errorCode = readErrorCode(payload);
  const message = readErrorDescription(payload) ?? `Short Menu request failed with status ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }

  if (response.status === 400 && errorCode === "LINK_LIMIT_REACHED") {
    return new ProviderRequestError(429, message);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 502, message);
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const text = await response.text();
  if (!text) {
    return { kind: "empty" };
  }

  try {
    return { kind: "json", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "invalid_json", raw: text };
  }
}

function normalizeLink(value: unknown) {
  const payload = optionalRecord(value);
  if (!payload) {
    throw new ProviderRequestError(502, "Short Menu returned an invalid link object");
  }

  return compactObject({
    id: requireString(payload.id, "id"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    destinationUrl: requireString(payload.destinationUrl, "destinationUrl"),
    title: optionalString(payload.title),
    slug: requireString(payload.slug, "slug"),
    domain: normalizeDomain(payload.domain),
    shortUrl: requireString(payload.shortUrl, "shortUrl"),
    clickCount: readOptionalNumber(payload.clickCount),
    tags: normalizeTagArray(payload.tags),
  });
}

function normalizeDomain(value: unknown) {
  const payload = optionalRecord(value);
  if (!payload) {
    throw new ProviderRequestError(502, "Short Menu returned an invalid domain object");
  }

  return {
    id: requireString(payload.id, "domain.id"),
    name: requireString(payload.name, "domain.name"),
  };
}

function normalizeTagArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Short Menu returned invalid tags");
  }

  return value.map((item, index) => {
    const payload = optionalRecord(item);
    if (!payload) {
      throw new ProviderRequestError(502, `Short Menu returned invalid tag at index ${index}`);
    }

    return compactObject({
      id: optionalString(payload.id),
      name: requireString(payload.name, `tags[${index}].name`),
    });
  });
}

function readTagInputArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item, index) => {
    const payload = optionalRecord(item);
    if (!payload) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must be an object`);
    }

    return compactObject({
      id: optionalString(payload.id),
      name: requireString(payload.name, `${fieldName}[${index}].name`),
    });
  });
}

function requireString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return parsed;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readErrorCode(payload: JsonPayloadReadResult) {
  if (payload.kind !== "json") {
    return undefined;
  }

  return optionalString(optionalRecord(payload.value)?.code);
}

function readErrorDescription(payload: JsonPayloadReadResult) {
  if (payload.kind !== "json") {
    return undefined;
  }

  return optionalString(optionalRecord(payload.value)?.errorDescription);
}
