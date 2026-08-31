import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const dropcontactApiBaseUrl = "https://api.dropcontact.com";

const textContactFields = [
  "email",
  "first_name",
  "last_name",
  "full_name",
  "phone",
  "company",
  "website",
  "num_siren",
  "linkedin",
  "siret",
  "country",
  "job",
  "company_linkedin",
];

type RequestMode = "validate" | "execute";
type DropcontactActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dropcontactActionHandlers: ProviderActionHandlers<"dropcontact", DropcontactActionHandler> = {
  async submit_enrichment(input, context): Promise<unknown> {
    const payload = await requestDropcontactJson(
      {
        method: "POST",
        path: "/v1/enrich/all",
        body: {
          data: readContacts(input.data),
          siren: optionalBoolean(input.siren),
          language: optionalString(input.language),
        },
      },
      context,
      "execute",
    );
    return normalizeSubmission(payload);
  },

  async get_enrichment_result(input, context): Promise<unknown> {
    const requestId = requiredString(
      input.request_id,
      "request_id",
      (message) => new ProviderRequestError(400, message),
    );
    const payload = await requestDropcontactJson(
      {
        method: "GET",
        path: `/v1/enrich/all/${encodeURIComponent(requestId)}`,
        query: input.forceResults === true ? [["forceResults", "true"]] : undefined,
      },
      context,
      "execute",
    );
    return normalizeResult(payload);
  },
};

export async function validateDropcontactCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestDropcontactJson({ method: "GET", path: "/v1/enrich/webhook" }, { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "dropcontact:api-key",
      displayName: "Dropcontact API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: dropcontactApiBaseUrl,
      validationEndpoint: "/v1/enrich/webhook",
    },
  };
}

async function requestDropcontactJson(
  input: {
    method: "GET" | "POST";
    path: string;
    query?: Array<[string, string]>;
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: RequestMode,
): Promise<unknown> {
  const url = new URL(input.path, dropcontactApiBaseUrl);
  for (const [name, value] of input.query ?? []) {
    url.searchParams.set(name, value);
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-access-token": context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw mapDropcontactError(response.status, await readErrorPayload(response), mode);
    }
    return await readJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Dropcontact request timed out after 30 seconds");
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Dropcontact request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Dropcontact returned invalid JSON");
  }
}

async function readErrorPayload(response: Response): Promise<unknown> {
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

function mapDropcontactError(status: number, payload: unknown, mode: RequestMode): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Dropcontact request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function normalizeSubmission(payload: unknown): Record<string, unknown> {
  const raw = readResponseObject(payload, "Dropcontact enrichment submission response");
  return {
    error: raw.error === true,
    request_id: optionalString(raw.request_id) ?? null,
    success: raw.success === true,
    credits_left: optionalInteger(raw.credits_left) ?? null,
    raw,
  };
}

function normalizeResult(payload: unknown): Record<string, unknown> {
  const raw = readResponseObject(payload, "Dropcontact enrichment result response");
  const error = raw.error === true;
  const success = raw.success === true;
  return {
    error,
    success,
    status: error ? "failed" : success ? "succeeded" : "running",
    reason: optionalString(raw.reason) ?? null,
    credits_left: optionalInteger(raw.credits_left) ?? null,
    data: Array.isArray(raw.data) ? raw.data.filter((item) => optionalRecord(item)) : [],
    raw,
  };
}

function readContacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "data must be an array");
  }

  return value.map((item, index) => readContact(item, index));
}

function readContact(value: unknown, index: number): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `data.${index} must be an object`);
  }

  const output: Record<string, unknown> = { ...record };
  for (const field of textContactFields) {
    const text = optionalString(record[field]);
    if (text) {
      output[field] = text;
    }
  }

  const hasText = (name: string): boolean => typeof output[name] === "string" && output[name] !== "";
  const hasPersonAndCompany =
    (hasText("company") || hasText("website")) &&
    ((hasText("first_name") && hasText("last_name")) || hasText("full_name"));
  if (hasText("email") || hasText("linkedin") || hasPersonAndCompany) {
    return output;
  }

  throw new ProviderRequestError(400, "email, linkedin, or a name with company or website is required");
}

function readResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not a JSON object`);
  }
  return record;
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  for (const name of ["message", "reason", "error"]) {
    const value = optionalString(object[name]);
    if (value) {
      return value;
    }
  }
  return undefined;
}
