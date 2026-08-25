import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "companyenrich";
const companyenrichApiBaseUrl = "https://api.companyenrich.com";

type CompanyenrichContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CompanyenrichActionHandler = (input: Record<string, unknown>, context: CompanyenrichContext) => Promise<unknown>;

interface CompanyenrichRequest {
  path: string;
  context: CompanyenrichContext;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const companyenrichActionHandlers: ProviderActionHandlers<"companyenrich", CompanyenrichActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: asProviderObject(await requestCompanyenrich({ path: "/me", context }), "current user"),
    };
  },
  async enrich_company_by_domain(input, context) {
    return {
      company: asProviderObject(
        await requestCompanyenrich({
          path: "/companies/enrich",
          context,
          query: {
            domain: input.domain,
            expand: input.expand,
          },
        }),
        "company enrichment",
      ),
    };
  },
  async enrich_company_by_properties(input, context) {
    assertCompanyPropertiesInput(input);
    const { expand, ...body } = input;
    return {
      company: asProviderObject(
        await requestCompanyenrich({
          path: "/companies/enrich",
          method: "POST",
          context,
          query: { expand },
          body,
        }),
        "company enrichment",
      ),
    };
  },
  async search_companies(input, context) {
    const { expand, ...body } = input;
    return normalizePaginatedCompanyList(
      await requestCompanyenrich({
        path: "/companies/search",
        method: "POST",
        context,
        query: { expand },
        body,
      }),
      false,
    );
  },
  async count_companies(input, context) {
    const payload = await requestCompanyenrich({
      path: "/companies/search/count",
      method: "POST",
      context,
      body: input,
    });
    if (typeof payload !== "number" || !Number.isInteger(payload)) {
      throw new ProviderRequestError(502, "companyenrich count response must be an integer", payload);
    }
    return { count: payload };
  },
  async find_similar_companies(input, context) {
    const { expand, ...body } = input;
    return normalizePaginatedCompanyList(
      await requestCompanyenrich({
        path: "/companies/similar",
        method: "POST",
        context,
        query: { expand },
        body,
      }),
      true,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, companyenrichActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const user = asProviderObject(await requestCompanyenrich({ path: "/me", context }), "current user");

    return {
      profile: {
        accountId: optionalString(user.userId) ?? "api_key",
        displayName: "CompanyEnrich API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: companyenrichApiBaseUrl,
        validationEndpoint: "/me",
        userId: optionalString(user.userId),
        credits: optionalRecord(user.credits),
        capabilities: optionalRecord(user.capabilities),
      }),
    };
  },
};

async function requestCompanyenrich(input: CompanyenrichRequest): Promise<unknown> {
  const url = new URL(input.path, companyenrichApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const response = await input.context.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    signal: input.context.signal,
  });
  const payload = await readCompanyenrichPayload(response);
  if (!response.ok) {
    throw mapCompanyenrichError(response.status, payload);
  }

  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      if (child !== undefined && child !== null && child !== "") {
        url.searchParams.append(key, String(child));
      }
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

async function readCompanyenrichPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "companyenrich returned invalid JSON");
    }
    return { detail: text };
  }
}

function mapCompanyenrichError(status: number, payload: unknown): ProviderRequestError {
  const message = readCompanyenrichErrorMessage(payload, status);
  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readCompanyenrichErrorMessage(payload: unknown, status: number): string {
  const objectPayload = optionalRecord(payload);
  if (objectPayload) {
    const direct =
      optionalString(objectPayload.detail) ??
      optionalString(objectPayload.title) ??
      optionalString(objectPayload.message);
    if (direct) return direct;
    const errors = optionalRecord(objectPayload.errors);
    if (errors) {
      for (const value of Object.values(errors)) {
        if (Array.isArray(value)) {
          const firstMessage = value.find((item) => typeof item === "string");
          if (typeof firstMessage === "string") return firstMessage;
        }
      }
    }
  }
  return `companyenrich request failed with ${status}`;
}

function normalizePaginatedCompanyList(payload: unknown, includeMetadata: boolean): Record<string, unknown> {
  const objectPayload = asProviderObject(payload, "paginated company list");
  const items = objectPayload.items;
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, "companyenrich items must be an array", payload);
  }

  const companies = items.map((item) => asProviderObject(item, "company list item"));
  const pagination = {
    page: requireIntegerField(objectPayload.page, "page"),
    totalPages: requireIntegerField(objectPayload.totalPages, "totalPages"),
    totalItems: requireIntegerField(objectPayload.totalItems, "totalItems"),
  };

  if (!includeMetadata) {
    return { companies, pagination };
  }

  return {
    companies,
    metadata: normalizeSimilarMetadata(objectPayload.metadata),
    pagination,
  };
}

function requireIntegerField(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `companyenrich response is missing ${fieldName}`, value);
  }
  return value;
}

function asProviderObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `companyenrich ${label} must be an object`, value);
  }
  return record;
}

function normalizeSimilarMetadata(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  const metadata = asProviderObject(value, "similarity metadata");
  const scores = optionalRecord(metadata.scores);
  if (!scores) {
    throw new ProviderRequestError(502, "companyenrich similarity metadata is missing scores", value);
  }
  const normalizedScores = Object.fromEntries(Object.entries(scores).filter(([, score]) => typeof score === "number"));
  if (Object.keys(normalizedScores).length !== Object.keys(scores).length) {
    throw new ProviderRequestError(502, "companyenrich similarity metadata scores must be numeric", value);
  }
  return { scores: normalizedScores };
}

function assertCompanyPropertiesInput(input: Record<string, unknown>): void {
  if (
    !optionalString(input.name) &&
    !optionalString(input.linkedinUrl) &&
    !optionalString(input.linkedinId) &&
    !optionalString(input.twitterUrl) &&
    !optionalString(input.facebookUrl) &&
    !optionalString(input.instagramUrl) &&
    !optionalString(input.youTubeUrl)
  ) {
    throw new ProviderRequestError(
      400,
      "name, linkedinUrl, linkedinId, twitterUrl, facebookUrl, instagramUrl, or youTubeUrl must be provided",
    );
  }
}
