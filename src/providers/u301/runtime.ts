import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

const u301ApiBaseUrl = "https://api.u301.com";
const u301DomainsPath = "/v3/shorten/domains";
const u301ShortenBulkPath = "/v3/shorten/bulk";

type U301RequestPhase = "validate" | "execute";
type U301ActionHandler = (input: Record<string, unknown>, context: U301ActionContext) => Promise<unknown>;

interface U301ActionContext {
  apiKey: string;
  workspaceId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface U301RequestInput {
  path: string;
  method: "GET" | "POST" | "DELETE";
  apiKey: string;
  workspaceId?: string;
  body?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: U301RequestPhase;
}

export const u301ActionHandlers: ProviderActionHandlers<"u301", U301ActionHandler> = {
  async shorten_link(input, context) {
    const payload = compactObject({
      url: readRequiredInputString(input.url, "url"),
      domain: optionalString(input.domain),
      slug: optionalString(input.slug),
      reuseExisting: optionalBoolean(input.reuseExisting),
      password: optionalString(input.password),
      comment: optionalString(input.comment),
    });

    const responsePayload = await u301Request({
      path: u301ShortenBulkPath,
      method: "POST",
      apiKey: context.apiKey,
      workspaceId: requireWorkspaceId(context.workspaceId),
      body: [payload],
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return normalizeShortenLinkResult(responsePayload);
  },

  async delete_link(input, context) {
    const responsePayload = await u301Request({
      path: `/v3/shorten/${encodeShortlink(readRequiredInputString(input.shortlink, "shortlink"))}`,
      method: "DELETE",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    const record = optionalRecord(responsePayload);
    return {
      success: true,
      message: nullableString(record?.message),
    };
  },

  async list_domains(_input, context) {
    const responsePayload = await u301Request({
      path: u301DomainsPath,
      method: "GET",
      apiKey: context.apiKey,
      workspaceId: requireWorkspaceId(context.workspaceId),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      domains: normalizeDomainList(responsePayload),
    };
  },
};

export async function validateU301Credential(
  input: { apiKey: string; workspaceId?: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const domains = await u301Request({
    path: u301DomainsPath,
    method: "GET",
    apiKey: input.apiKey,
    workspaceId,
    fetcher,
    signal,
    phase: "validate",
  });
  const normalizedDomains = normalizeDomainList(domains);

  return {
    profile: {
      accountId: workspaceId,
      displayName: "U301 API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      workspaceId,
      validationEndpoint: u301DomainsPath,
      domainCount: normalizedDomains.length,
      firstDomain: normalizedDomains[0]?.domain,
    }),
  };
}

async function u301Request(input: U301RequestInput): Promise<unknown> {
  const url = new URL(input.path, u301ApiBaseUrl);
  if (input.workspaceId) {
    url.searchParams.set("workspaceId", input.workspaceId);
  }

  return runProviderRequest({ signal: input.signal, label: "U301" }, async (signal) => {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: compactObject({
        Authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
        "content-type": input.body === undefined ? undefined : "application/json",
      }) as HeadersInit,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw createU301Error(response, payload, input.phase);
    }
    return payload;
  });
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createU301Error(response: Response, payload: unknown, phase: U301RequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "U301 request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    optionalString(record?.title)
  );
}

function normalizeShortenLinkResult(payload: unknown): Record<string, unknown> {
  const candidates = Array.isArray(payload) ? payload : [payload];
  const record = requireObject(candidates[0], "U301 shorten response must be an object");
  return {
    id: readRequiredResponseString(record.id, "id"),
    url: readRequiredResponseString(record.url, "url"),
    slug: readRequiredResponseString(record.slug, "slug"),
    isCustomSlug: readRequiredBoolean(record.isCustomSlug, "isCustomSlug"),
    domain: readRequiredResponseString(record.domain, "domain"),
    isReused: readRequiredBoolean(record.isReused, "isReused"),
    shortLink: readRequiredResponseString(record.shortLink, "shortLink"),
    comment: nullableString(record.comment),
  };
}

function normalizeDomainList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "U301 domains response must be an array", payload);
  }

  return payload.map((item) => {
    const record = requireObject(item, "U301 domain response must be an object");
    return {
      domain: readRequiredResponseString(record.domain, "domain"),
      randomCodeLength: readRequiredNumber(record.randomCodeLength, "randomCodeLength"),
      isPrimary: readRequiredBoolean(record.isPrimary, "isPrimary"),
      isGlobal: readRequiredBoolean(record.isGlobal, "isGlobal"),
    };
  });
}

function encodeShortlink(shortlink: string): string {
  const [domain, ...slugParts] = shortlink.split("/");
  const slug = slugParts.join("/");
  if (!domain || !slug) {
    throw new ProviderRequestError(400, "shortlink must be in the form domain/slug");
  }

  return `${encodeURIComponent(domain)}/${encodeURIComponent(safelyDecodeURIComponent(slug))}`;
}

function safelyDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function requireWorkspaceId(value: unknown): string {
  return readRequiredInputString(value, "workspaceId");
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `U301 response missing ${fieldName}`, value);
  }
  return text;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `U301 response missing ${fieldName}`, value);
  }
  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `U301 response missing ${fieldName}`, value);
  }
  return value;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : readRequiredResponseString(value, "string");
}
