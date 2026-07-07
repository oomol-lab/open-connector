import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { arrayPayload, requestJson } from "../http-json-runtime.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "zorus";
const apiBaseUrl = "https://developer.zorustech.com";
const apiVersion = "1.0";
const validationPath = "/api/customers/search";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const paths: Record<string, string> = {
  search_customers: validationPath,
  search_endpoints: "/api/endpoints/search",
  search_groups: "/api/groups/search",
  search_policies: "/api/policies/search",
  search_active_unblock_requests: "/api/unblock-requests/active/search",
};

export const zorusActionHandlers: Record<string, Handler> = {
  search_customers(input, context) {
    return searchZorus(paths.search_customers, input, context);
  },
  search_endpoints(input, context) {
    return searchZorus(paths.search_endpoints, input, context);
  },
  search_groups(input, context) {
    return searchZorus(paths.search_groups, input, context);
  },
  search_policies(input, context) {
    return searchZorus(paths.search_policies, input, context);
  },
  search_active_unblock_requests(input, context) {
    return searchZorus(paths.search_active_unblock_requests, input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zorusActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Impersonation ${credential.apiKey}`);
    headers.set("zorus-api-version", apiVersion);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Zorus request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Zorus request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await zorusRequest(validationPath, { apiKey: input.apiKey, fetcher, signal }, { page: 1, pageSize: 1 }, "validate");
    return {
      profile: {
        accountId: "zorus-api-token",
        displayName: "Zorus API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        apiVersion,
        validationEndpoint: validationPath,
      },
    };
  },
};

function zorusRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  body: unknown,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Zorus",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "POST",
    body,
    phase,
    headers: {
      "Zorus-Api-Version": apiVersion,
      authorization: `Impersonation ${context.apiKey}`,
    },
  });
}

async function searchZorus(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    items: arrayPayload(await zorusRequest(path, context, input), "Zorus search results"),
  };
}
