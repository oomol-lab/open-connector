import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const peopledatalabsApiBaseUrl = "https://api.peopledatalabs.com";
const validationSearchPath = "/v5/person/search";
const validationSql = "SELECT * FROM person WHERE job_company_name='__oomol_connector_validation__'";

type PdlPhase = "validate" | "execute";
type PdlActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface PdlRequestInput {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase: PdlPhase;
}

export const peopledatalabsActionHandlers: ProviderActionHandlers<"peopledatalabs", PdlActionHandler> = {
  enrich_person(input, context) {
    validatePersonEnrichInput(input);
    return enrichPdlRecord("/v5/person/enrich", input, context);
  },
  search_people(input, context) {
    validateSearchInput(input);
    return searchPdlRecords("/v5/person/search", input, context);
  },
  enrich_company(input, context) {
    validateCompanyEnrichInput(input);
    return enrichPdlRecord("/v5/company/enrich", input, context);
  },
  search_companies(input, context) {
    validateSearchInput(input);
    return searchPdlRecords("/v5/company/search", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "peopledatalabs",
  peopledatalabsActionHandlers,
);

export async function validatePeopledatalabsCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = requiredResponseRecord(
    await requestPdl({
      path: validationSearchPath,
      method: "POST",
      apiKey: input.apiKey,
      fetcher,
      body: {
        sql: validationSql,
        size: 1,
      },
      phase: "validate",
    }),
    "People Data Labs validation response",
  );

  return {
    profile: {
      accountId: "peopledatalabs-api-key",
      displayName: "People Data Labs API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: peopledatalabsApiBaseUrl,
      validationEndpoint: validationSearchPath,
      validationSql,
      validationStatus: optionalInteger(payload.status),
      validationTotal: optionalInteger(payload.total),
    }),
  };
}

async function enrichPdlRecord(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = requiredResponseRecord(
    await requestPdl({
      path,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: input,
      phase: "execute",
    }),
    "People Data Labs enrichment response",
  );

  const data = optionalRecord(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, "People Data Labs enrichment response missing data");
  }

  return compactObject({
    status: readRequiredInteger(payload.status, "status"),
    likelihood: optionalInteger(payload.likelihood),
    data,
    matched: optionalRecord(payload.matched),
  });
}

async function searchPdlRecords(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = requiredResponseRecord(
    await requestPdl({
      path,
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: input,
      phase: "execute",
    }),
    "People Data Labs search response",
  );

  const data = payload.data;
  if (!Array.isArray(data) || data.some((item) => optionalRecord(item) === undefined)) {
    throw new ProviderRequestError(502, "People Data Labs search response data must be an array of objects");
  }

  return compactObject({
    status: readRequiredInteger(payload.status, "status"),
    total: readRequiredInteger(payload.total, "total"),
    data: data as Array<Record<string, unknown>>,
    scroll_token: optionalString(payload.scroll_token) ?? null,
  });
}

async function requestPdl(input: PdlRequestInput): Promise<unknown> {
  const url = new URL(input.path, peopledatalabsApiBaseUrl);
  if (input.query) {
    for (const [key, value] of Object.entries(input.query)) {
      appendQueryValue(url, key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `People Data Labs request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readPdlPayload(response);
  if (!response.ok) {
    throw mapPdlError(response.status, payload, input.phase);
  }

  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "boolean") {
    url.searchParams.set(key, value ? "true" : "false");
    return;
  }

  const text = optionalString(value);
  if (text !== undefined || typeof value === "number") {
    url.searchParams.set(key, String(text ?? value));
  }
}

async function readPdlPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "People Data Labs returned invalid JSON");
    }
    return { error: text };
  }
}

function mapPdlError(status: number, payload: unknown, phase: PdlPhase): ProviderRequestError {
  const message = readPdlErrorMessage(payload, status);
  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readPdlErrorMessage(payload: unknown, status: number): string {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    `People Data Labs request failed with ${status}`
  );
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(502, `People Data Labs response field ${fieldName} must be an integer`);
  }
  return integer;
}

function validatePersonEnrichInput(input: Record<string, unknown>): void {
  if (hasAnyString(input, "pdl_id", "profile", "email", "phone", "email_hash", "lid")) {
    return;
  }

  const hasName =
    hasAnyString(input, "name") || (hasAnyString(input, "first_name") && hasAnyString(input, "last_name"));
  const hasSecondaryIdentifier = hasAnyString(
    input,
    "locality",
    "region",
    "company",
    "school",
    "location",
    "postal_code",
  );
  if (!hasName || !hasSecondaryIdentifier) {
    throw new ProviderRequestError(
      400,
      "Provide pdl_id, profile, email, phone, email_hash, lid, or a name plus locality, region, company, school, location, or postal_code.",
    );
  }
}

function validateCompanyEnrichInput(input: Record<string, unknown>): void {
  if (!hasAnyString(input, "pdl_id", "name", "profile", "ticker", "website")) {
    throw new ProviderRequestError(400, "pdl_id, name, profile, ticker, or website is required.");
  }
}

function validateSearchInput(input: Record<string, unknown>): void {
  const hasQuery = hasAnyString(input, "query");
  const hasSql = hasAnyString(input, "sql");
  if (hasQuery === hasSql) {
    throw new ProviderRequestError(400, "Exactly one of query or sql is required.");
  }
  if (typeof input.from === "number" && hasAnyString(input, "scroll_token")) {
    throw new ProviderRequestError(400, "from and scroll_token cannot be used together.");
  }
}

function hasAnyString(input: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => optionalString(input[key]) !== undefined);
}
