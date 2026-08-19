import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "coresignal";
const coresignalApiBaseUrl = "https://api.coresignal.com/cdapi/v2";

interface CoresignalContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CoresignalActionHandler = (input: Record<string, unknown>, context: CoresignalContext) => Promise<unknown>;

const coresignalActionHandlers: ProviderActionHandlers<"coresignal", CoresignalActionHandler> = {
  search_base_companies(input, context) {
    return searchBaseCompanies(input, context);
  },
  preview_base_companies(input, context) {
    return previewBaseCompanies(input, context);
  },
  collect_base_company(input, context) {
    return collectBaseCompany(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, coresignalActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) {
      throw new ProviderRequestError(400, "coresignal api key is required");
    }
    return {
      profile: {
        accountId: "api_key",
        displayName: "Coresignal API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: coresignalApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

async function searchBaseCompanies(input: Record<string, unknown>, context: CoresignalContext): Promise<unknown> {
  const payload = await requestCoresignal("/company_base/search/filter", {
    method: "POST",
    body: input,
    context,
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "coresignal search returned an invalid payload", payload);
  }

  return {
    ids: payload.map((item) => readCompanyId(item)),
  };
}

async function previewBaseCompanies(input: Record<string, unknown>, context: CoresignalContext): Promise<unknown> {
  const url = new URL(`${coresignalApiBaseUrl}/company_base/search/filter/preview`);
  const { page, ...filters } = input;
  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }

  const payload = await requestCoresignal(url, {
    method: "POST",
    body: filters,
    context,
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "coresignal preview returned an invalid payload", payload);
  }

  return { records: payload };
}

async function collectBaseCompany(input: Record<string, unknown>, context: CoresignalContext): Promise<unknown> {
  const identifier = encodeURIComponent(String(input.companyIdentifier));
  const url = new URL(`${coresignalApiBaseUrl}/company_base/collect/${identifier}`);
  const fields = input.fields;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      url.searchParams.append("fields", String(field));
    }
  }

  const payload = await requestCoresignal(url, {
    method: "GET",
    context,
  });
  const company = optionalRecord(payload);
  if (!company) {
    throw new ProviderRequestError(502, "coresignal collect returned an invalid payload", payload);
  }

  return { company };
}

async function requestCoresignal(
  pathOrUrl: string | URL,
  input: { method: "GET" | "POST"; body?: Record<string, unknown>; context: CoresignalContext },
): Promise<unknown> {
  const url = pathOrUrl instanceof URL ? pathOrUrl.toString() : `${coresignalApiBaseUrl}${pathOrUrl}`;
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `coresignal request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readCoresignalPayload(response);
  if (!response.ok) {
    throw mapCoresignalError(response.status, readCoresignalMessage(payload), payload);
  }

  return payload;
}

async function readCoresignalPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "coresignal returned malformed JSON");
    }
    return { message: text };
  }
}

function readCompanyId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new ProviderRequestError(502, "coresignal search returned an invalid company ID", value);
}

function readCoresignalMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return "coresignal request failed";
  }
  const errors = Array.isArray(record.errors) ? record.errors : [];
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(errors[0]) ??
    "coresignal request failed"
  );
}

function mapCoresignalError(status: number, message: string, payload: unknown): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}
