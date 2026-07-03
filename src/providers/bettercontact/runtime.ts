import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BettercontactActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const bettercontactApiBaseUrl = "https://app.bettercontact.rocks/api/v2";
const bettercontactDefaultRequestTimeoutMs = 30_000;

type BettercontactMode = "validate" | "execute";
type BettercontactActionHandler = ProviderRuntimeHandler<BettercontactContext>;

export interface BettercontactContext {
  apiKey: string;
  accountEmail?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BettercontactRequestInput {
  method: "GET" | "POST";
  path: string;
  mode: BettercontactMode;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  includeApiKeyQuery?: boolean;
}

interface BettercontactEnrichmentResultRecord {
  enriched: boolean | null;
  emailProvider: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmailAddress: string | null;
  contactEmailAddressStatus: string | null;
  contactGender: string | null;
  contactJobTitle: string | null;
  raw: Record<string, unknown>;
}

export const bettercontactActionHandlers: Record<BettercontactActionName, BettercontactActionHandler> = {
  async get_account_balance(input, context) {
    const email = readNonEmptyString(input.email) ?? context.accountEmail;
    if (!email) {
      throw new ProviderRequestError(400, "accountEmail is required in the connection or action input");
    }

    const payload = await requestBettercontactJson(
      {
        method: "GET",
        path: "/account",
        query: {
          email,
        },
        mode: "execute",
        includeApiKeyQuery: true,
      },
      context,
    );

    return {
      success: readOptionalBoolean(payload.success) ?? true,
      creditsLeft: requireInteger(payload.credits_left, "credits_left"),
      email: requireString(payload.email, "email"),
      raw: payload,
    };
  },
  async submit_enrichment(input, context) {
    const payload = await requestBettercontactJson(
      {
        method: "POST",
        path: "/async",
        body: {
          data: readLeadPayload(input.leads),
          enrich_email_address: readRequiredBoolean(input.enrichEmailAddress, "enrichEmailAddress"),
          enrich_phone_number: readRequiredBoolean(input.enrichPhoneNumber, "enrichPhoneNumber"),
          webhook: readNonEmptyString(input.webhookUrl),
          process_flow: readNonEmptyString(input.processFlowId),
        },
        mode: "execute",
      },
      context,
    );

    return {
      success: readOptionalBoolean(payload.success) ?? true,
      requestId: requireString(payload.id, "id"),
      message: requireString(payload.message, "message"),
    };
  },
  async get_enrichment_result(input, context) {
    const requestId = requireInputString(input.requestId, "requestId");
    const payload = await requestBettercontactJson(
      {
        method: "GET",
        path: `/async/${encodeURIComponent(requestId)}`,
        mode: "execute",
      },
      context,
    );

    return {
      requestId: requireString(payload.id, "id"),
      status: requireString(payload.status, "status"),
      creditsConsumed: readOptionalInteger(payload.credits_consumed),
      creditsLeft: readOptionalInteger(payload.credits_left),
      summary: normalizeSummary(payload.summary),
      results: normalizeResults(payload.data),
      raw: payload,
    };
  },
};

export async function validateBettercontactCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const accountEmail = readAccountEmailFromInput(input.values);
  const payload = await requestBettercontactJson(
    {
      method: "GET",
      path: "/account",
      query: {
        email: accountEmail,
      },
      mode: "validate",
      includeApiKeyQuery: true,
    },
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
  );
  const email = requireString(payload.email, "email");

  return {
    profile: {
      accountId: email,
      displayName: email,
    },
    grantedScopes: [],
    metadata: compactObject({
      accountEmail: email,
      validationEndpoint: "/account",
      creditsLeft: readOptionalInteger(payload.credits_left),
    }),
  };
}

async function requestBettercontactJson(
  input: BettercontactRequestInput,
  context: BettercontactContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, bettercontactDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildBettercontactUrl(input, context.apiKey), {
      method: input.method,
      headers: buildBettercontactHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(compactObject(input.body)),
      signal: timeout.signal,
    });
    const payload = await readBettercontactPayload(response);

    if (!response.ok) {
      throw createBettercontactError(response.status, payload, input.mode);
    }

    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "BetterContact returned an invalid payload");
    }

    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error) || isTimeoutLikeError(error)) {
      throw new ProviderRequestError(504, "BetterContact request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BetterContact request failed: ${error.message}` : "BetterContact request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBettercontactUrl(input: BettercontactRequestInput, apiKey: string): URL {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${bettercontactApiBaseUrl}/`);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  if (input.includeApiKeyQuery) {
    url.searchParams.set("api_key", apiKey);
  }

  return url;
}

function buildBettercontactHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readBettercontactPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBettercontactError(status: number, payload: unknown, mode: BettercontactMode): ProviderRequestError {
  const message = extractBettercontactErrorMessage(payload) ?? `BetterContact request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (mode === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (mode === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (mode === "execute" && [400, 404, 406, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBettercontactErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return readNonEmptyString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return readNonEmptyString(record.error) ?? readNonEmptyString(record.message) ?? readNonEmptyString(record.detail);
}

function readAccountEmailFromInput(input: Record<string, string>): string {
  const accountEmail = readNonEmptyString(input.accountEmail) ?? readNonEmptyString(input.email);
  if (!accountEmail) {
    throw new ProviderRequestError(400, "accountEmail is required");
  }
  return accountEmail;
}

function readLeadPayload(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "leads must be an array");
  }

  return value.map((item) => {
    const lead = optionalRecord(item);
    if (!lead) {
      throw new ProviderRequestError(400, "each lead must be an object");
    }

    return compactObject({
      first_name: readNonEmptyString(lead.firstName),
      last_name: readNonEmptyString(lead.lastName),
      company: readNonEmptyString(lead.company),
      company_domain: readNonEmptyString(lead.companyDomain),
      linkedin_url: readNonEmptyString(lead.linkedinUrl),
      custom_fields: optionalRecord(lead.customFields),
    });
  });
}

function normalizeSummary(value: unknown): Record<string, number | null> | null {
  const summary = optionalRecord(value);
  if (!summary) {
    return null;
  }

  return {
    total: readOptionalInteger(summary.total),
    valid: readOptionalInteger(summary.valid),
    catchAll: readOptionalInteger(summary.catch_all),
    catchAllSafe: readOptionalInteger(summary.catch_all_safe),
    catchAllNotSafe: readOptionalInteger(summary.catch_all_not_safe),
    undeliverable: readOptionalInteger(summary.undeliverable),
    notFound: readOptionalInteger(summary.not_found),
  };
}

function normalizeResults(value: unknown): BettercontactEnrichmentResultRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = optionalRecord(item);
    if (!record) {
      return [];
    }

    return [
      {
        enriched: readOptionalBoolean(record.enriched),
        emailProvider: readNullableString(record.email_provider),
        contactFirstName: readNullableString(record.contact_first_name),
        contactLastName: readNullableString(record.contact_last_name),
        contactEmailAddress: readNullableString(record.contact_email_address),
        contactEmailAddressStatus: readNullableString(record.contact_email_address_status),
        contactGender: readNullableString(record.contact_gender),
        contactJobTitle: readNullableString(record.contact_job_title),
        raw: record,
      },
    ];
  });
}

function requireString(value: unknown, fieldName: string): string {
  const resolved = readNonEmptyString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `BetterContact returned invalid ${fieldName}`);
  }
  return resolved;
}

function requireInteger(value: unknown, fieldName: string): number {
  const resolved = readOptionalInteger(value);
  if (resolved == null) {
    throw new ProviderRequestError(502, `BetterContact returned invalid ${fieldName}`);
  }
  return resolved;
}

function readOptionalInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readNonEmptyString(value: unknown): string | undefined {
  const resolved = optionalString(value);
  return resolved && resolved.trim() !== "" ? resolved.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return readNonEmptyString(value) ?? null;
}

function readOptionalBoolean(value: unknown): boolean | null {
  const resolved = optionalBoolean(value);
  return resolved === undefined ? null : resolved;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  const resolved = optionalBoolean(value);
  if (resolved === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a boolean`);
  }
  return resolved;
}

function requireInputString(value: unknown, fieldName: string): string {
  const resolved = readNonEmptyString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
