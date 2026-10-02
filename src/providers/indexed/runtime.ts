import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const indexedApiBaseUrl = "https://indexed.vc/api/v1";

type IndexedPhase = "validate" | "execute";
type IndexedActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface IndexedRequest {
  context: ApiKeyProviderContext;
  path: string;
  phase?: IndexedPhase;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export const indexedActionHandlers: ProviderActionHandlers<"indexed", IndexedActionHandler> = {
  lookup_company_by_domain(input, context) {
    return requestIndexed({
      context,
      path: "/companies",
      query: { domain: requiredInputString(input.domain, "domain") },
    });
  },
  lookup_companies_by_domains(input, context) {
    return requestIndexed({ context, path: "/companies/lookup", body: { domains: input.domains } });
  },
  search_companies(input, context) {
    return requestIndexed({
      context,
      path: "/companies",
      query: {
        q: optionalString(input.q),
        industries: joinList(input.industries),
        countries: joinList(input.countries),
        employees: joinList(input.employees),
        operatingStatus: joinList(input.operatingStatus),
        minFunding: optionalInteger(input.minFunding),
        maxFunding: optionalInteger(input.maxFunding),
        minCompleteness: optionalInteger(input.minCompleteness),
        updated_since: optionalString(input.updatedSince),
        reveal_status: optionalString(input.revealStatus),
        sort: optionalString(input.sort),
        order: optionalString(input.order),
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      },
    });
  },
  get_company(input, context) {
    return requestIndexed({
      context,
      path: `/companies/${encodePathSegment(requiredInputString(input.slug, "slug"))}`,
      query: { depth: optionalString(input.depth) },
    });
  },
};

/**
 * Validate a key with GET /usage, which the API documents as free of credit charges.
 */
export async function validateIndexedCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestIndexed({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    path: "/usage",
    phase: "validate",
  });
  const usage = optionalRecord(payload.data);
  const tier = optionalString(usage?.tier);
  return {
    profile: {
      displayName: tier ? `Indexed API Key (${tier} plan)` : "Indexed API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: indexedApiBaseUrl,
      validationEndpoint: "/usage",
      tier,
      creditsRemaining: optionalInteger(usage?.credits_remaining),
    }),
  };
}

function joinList(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.join(",") : undefined;
}

async function requestIndexed(input: IndexedRequest): Promise<Record<string, unknown>> {
  const { context } = input;
  const url = new URL(`${indexedApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return runProviderRequest({ signal: context.signal, label: "Indexed" }, async (signal) => {
    const response = await context.fetcher(url, {
      method: input.body ? "POST" : "GET",
      headers: compactObject({
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        "content-type": input.body ? "application/json" : undefined,
      }) as HeadersInit,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    if (!response.ok) {
      throw await readIndexedError(response, input.phase ?? "execute");
    }
    const payload = parseProviderJsonBodyText(await readProviderTextBody(response, "Indexed response"), {
      emptyBody: {},
      invalidJsonMessage: "Indexed returned malformed JSON",
    });
    return requiredResponseRecord(payload, "Indexed response");
  });
}

/**
 * Read an Indexed error response and map it onto the runtime's status conventions.
 * 402 is a billing state (credits exhausted), reported as insufficient_credit.
 * 403 TIER_UPGRADE_REQUIRED is a plan limit rather than a credential failure, so
 * it is reported as invalid input instead of prompting a reconnect. During key
 * validation a 401 or 403 is a field error on the submitted key. Every other
 * status keeps its upstream value, so a 404 stays a not-found result.
 */
export async function readIndexedError(
  response: Response,
  phase: IndexedPhase = "execute",
): Promise<ProviderRequestError> {
  const status = response.status;
  const payload = parseProviderJsonBodyText(await readProviderErrorTextBody(response, "Indexed error response"), {
    emptyBody: {},
    invalidJsonMessage: "Indexed returned malformed JSON",
    invalidJsonFallback: () => ({}),
  });
  const body = optionalRecord(payload);
  const message = optionalString(body?.error) ?? `Indexed request failed with HTTP ${status}`;
  const details = withRetryAfterSeconds(response, payload);
  if (status === 402) {
    return new ProviderRequestError(402, message, details, "insufficient_credit");
  }
  if (
    (status === 401 || status === 403) &&
    (phase === "validate" || optionalString(body?.code) === "TIER_UPGRADE_REQUIRED")
  ) {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status, message, details, status === 429 ? "rate_limited" : "provider_error");
}
