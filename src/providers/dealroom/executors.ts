import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  basicAuthorizationHeader,
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "dealroom";
const baseUrl = "https://api.dealroom.co/api/v1/";

const handlers: ProviderActionHandlers<"dealroom", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  search_companies(input, context) {
    return search("companies", input, context);
  },
  search_investors(input, context) {
    return search("investors", input, context);
  },
  search_transactions(input, context) {
    const limit = typeof input.limit === "number" ? input.limit : 10;
    const offset = typeof input.offset === "number" ? input.offset : 0;
    if (limit + offset > 100)
      throw new ProviderRequestError(400, "dealroom transactions limit plus offset cannot exceed 100");
    return search("transactions", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request("companies", { limit: 1 }, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { accountId: "dealroom", displayName: "Dealroom API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/companies" },
    };
  },
};

async function search(
  family: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const formData =
    input.formData && typeof input.formData === "object" && !Array.isArray(input.formData)
      ? (input.formData as Record<string, unknown>)
      : undefined;
  const body = compact({
    keyword: input.keyword,
    keyword_type: input.keywordType,
    keyword_match_type: input.keywordMatchType,
    form_data: formData && compact({ must: formData.must, should: formData.should, must_not: formData.mustNot }),
    fields: input.fields,
    sort: input.sort,
    limit: input.limit,
    offset: input.offset,
  });
  validateKeywords(input);
  const payload = await request(family, body, context);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ProviderRequestError(502, "Dealroom returned invalid search response");
  return payload;
}

async function request(path: string, body: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await context.fetcher(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      authorization: basicAuthorizationHeader(`${context.apiKey}:`),
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "Dealroom returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status === 401 || response.status === 403 ? 401 : response.status === 429 ? 429 : 502,
      "Dealroom request failed",
      payload,
    );
  return payload;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}
function validateKeywords(input: Record<string, unknown>): void {
  if (Array.isArray(input.keyword) && input.keywordType !== "default_next")
    throw new ProviderRequestError(400, "dealroom keyword arrays require keywordType default_next");
  if ((input.keywordMatchType === "all" || input.keywordMatchType === "any") && input.keywordType !== "default_next")
    throw new ProviderRequestError(
      400,
      `dealroom keywordMatchType ${input.keywordMatchType} requires keywordType default_next`,
    );
}
