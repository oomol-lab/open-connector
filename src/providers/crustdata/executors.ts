import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { crustdataApiVersion } from "./actions.ts";

const service = "crustdata";
const crustdataApiBaseUrl = "https://api.crustdata.com";
const validatePath = "/company/identify";

type CrustdataPhase = "validate" | "execute";
type CrustdataActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const crustdataActionHandlers: ProviderActionHandlers<"crustdata", CrustdataActionHandler> = {
  identify_companies(input, context) {
    return executeIdentifyLikeAction("/company/identify", input, context);
  },
  enrich_companies(input, context) {
    return executeIdentifyLikeAction("/company/enrich", input, context);
  },
  async search_companies(input, context) {
    const payload = await requestCrustdataJson({
      context,
      path: "/company/search",
      phase: "execute",
      body: compactObject({
        filters: optionalRecord(input.filters),
        fields: optionalStringArray(input.fields),
        sorts: Array.isArray(input.sorts) ? objectArray(input.sorts, "sort", providerResponseError) : undefined,
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      }),
    });
    return normalizeSearchResponse(payload);
  },
  async autocomplete_companies(input, context) {
    const payload = await requestCrustdataJson({
      context,
      path: "/company/search/autocomplete",
      phase: "execute",
      body: compactObject({
        field: requiredString(input.field, "field", providerInputError),
        query: readStringPreservingEmpty(input.query, "query"),
        limit: optionalInteger(input.limit),
        filters: optionalRecord(input.filters),
      }),
    });
    return normalizeAutocompleteResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, crustdataActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestCrustdataJson({
      context,
      path: validatePath,
      phase: "validate",
      body: {
        domains: ["openai.com"],
        exact_match: true,
      },
    });
    const results = normalizeCompanyResults(payload);
    const firstMatch = results[0]?.matches[0];
    const companyData = optionalRecord(firstMatch?.companyData);
    const basicInfo = optionalRecord(companyData?.basic_info);
    const matchedCompanyId = optionalInteger(companyData?.crustdata_company_id);
    return {
      profile: {
        accountId: matchedCompanyId === undefined ? "crustdata" : String(matchedCompanyId),
        displayName: optionalString(basicInfo?.name) ?? "Crustdata API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: crustdataApiBaseUrl,
        validationEndpoint: validatePath,
        matchedDomain: optionalString(basicInfo?.primary_domain),
        matchedCompanyName: optionalString(basicInfo?.name),
        matchedCompanyId,
      }),
    };
  },
};

async function executeIdentifyLikeAction(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestCrustdataJson({
    context,
    path,
    phase: "execute",
    body: buildIdentifierBody(input),
  });
  return { results: normalizeCompanyResults(payload) };
}

function buildIdentifierBody(input: Record<string, unknown>): Record<string, unknown> {
  const identifierKeys = ["domains", "professionalNetworkProfileUrls", "names", "crustdataCompanyIds"];
  if (identifierKeys.filter((key) => input[key] !== undefined).length !== 1) {
    throw new ProviderRequestError(400, "exactly one identifier array must be provided");
  }
  return compactObject({
    domains: optionalStringArray(input.domains),
    professional_network_profile_urls: optionalStringArray(input.professionalNetworkProfileUrls),
    names: optionalStringArray(input.names),
    crustdata_company_ids: optionalIntegerArray(input.crustdataCompanyIds),
    fields: optionalStringArray(input.fields),
    exact_match: optionalBoolean(input.exactMatch),
  });
}

async function requestCrustdataJson(input: {
  context: ApiKeyProviderContext;
  path: string;
  phase: CrustdataPhase;
  body: Record<string, unknown>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, crustdataApiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-version": crustdataApiVersion,
      },
      body: JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readCrustdataPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `crustdata request failed: ${error.message}` : "crustdata request failed",
    );
  }

  if (!response.ok) {
    throw createCrustdataError(response.status, payload, input.phase);
  }
  return payload;
}

async function readCrustdataPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCrustdataError(status: number, payload: unknown, phase: CrustdataPhase): ProviderRequestError {
  const message = readCrustdataErrorMessage(payload, status);
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 400 || status === 404) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status === 401 || status === 403 ? 401 : status, message, payload);
}

function readCrustdataErrorMessage(payload: unknown, status: number): string {
  const objectPayload = optionalRecord(payload);
  return (
    optionalString(objectPayload?.reason) ??
    optionalString(objectPayload?.error) ??
    optionalString(objectPayload?.message) ??
    (typeof payload === "string" && payload.trim() ? payload.trim() : `crustdata request failed with ${status}`)
  );
}

function normalizeCompanyResults(
  payload: unknown,
): Array<{ matchedOn: string; matchType: string; matches: Array<Record<string, unknown>> }> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "crustdata response must be an array");
  }
  return payload.map((item) => {
    const result = requireProviderObject(item, "crustdata result");
    if (!Array.isArray(result.matches)) {
      throw new ProviderRequestError(502, "crustdata matches must be an array");
    }
    return {
      matchedOn: normalizeMatchedOn(result.matched_on),
      matchType: requiredString(result.match_type, "match_type", providerResponseError),
      matches: result.matches.map((match) => normalizeMatch(match)),
    };
  });
}

function normalizeMatch(value: unknown): Record<string, unknown> {
  const match = requireProviderObject(value, "crustdata match");
  if (typeof match.confidence_score !== "number")
    throw new ProviderRequestError(502, "confidence_score must be a number");
  return {
    confidenceScore: match.confidence_score,
    companyData: requireProviderObject(match.company_data, "company_data"),
  };
}

function normalizeSearchResponse(payload: unknown): unknown {
  const response = requireProviderObject(payload, "crustdata search response");
  if (!Array.isArray(response.companies)) throw new ProviderRequestError(502, "crustdata companies must be an array");
  return {
    companies: response.companies.map((company) => requireProviderObject(company, "company")),
    nextCursor: nullableString(response.next_cursor),
    totalCount: nullableInteger(response.total_count),
  };
}

function normalizeAutocompleteResponse(payload: unknown): unknown {
  const response = requireProviderObject(payload, "crustdata autocomplete response");
  if (!Array.isArray(response.suggestions))
    throw new ProviderRequestError(502, "crustdata suggestions must be an array");
  return {
    suggestions: response.suggestions.map((suggestion) => {
      const entry = requireProviderObject(suggestion, "suggestion");
      return { value: requiredString(entry.value, "value", providerResponseError) };
    }),
  };
}

function requireProviderObject(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, () => new ProviderRequestError(502, `${label} must be an object`));
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? stringArray(value, "array item", providerResponseError) : undefined;
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    if (!Number.isInteger(item)) throw new ProviderRequestError(502, "company id array item must be an integer");
    return item as number;
  });
}

function readStringPreservingEmpty(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new ProviderRequestError(400, `${fieldName} must be a string`);
  return value;
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  if (Number.isInteger(value)) return value as number;
  throw new ProviderRequestError(502, "integer response value is invalid");
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  const result = optionalString(value);
  if (result) return result;
  throw new ProviderRequestError(502, "string response value is invalid");
}

function normalizeMatchedOn(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new ProviderRequestError(502, "matched_on must be a string-compatible value");
}
