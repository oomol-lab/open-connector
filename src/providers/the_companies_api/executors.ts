import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { theCompaniesApiActions, theCompaniesApiEndpointByName } from "./actions.ts";
const baseUrl = "https://api.thecompaniesapi.com";
async function request(
  apiKey: string,
  path: string,
  method: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "The Companies API" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = new Headers({ authorization: `Basic ${apiKey}`, accept: "application/json" });
    if (method === "POST") {
      headers.set("content-type", "application/json");
    } else {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await fetcher(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(input) : undefined,
      signal,
    });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const error = optionalRecord(body);
      const message = optionalString(error?.message) ?? optionalString(error?.messages);
      throw new ProviderRequestError(
        response.status,
        `The Companies API request failed (${response.status})${message ? `: ${message}` : ""}`,
        undefined,
        message === "tokenNotFound" ? "authorization_failed" : "provider_error",
      );
    }
    return requiredResponseRecord(body, "The Companies API response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const endpoint = theCompaniesApiEndpointByName.get(actionName);
  if (!endpoint) {
    throw providerInputError(`Unknown The Companies API action: ${actionName}`);
  }
  const parameters = { ...values };
  let path = endpoint.path;
  if (path.includes("{domain}")) {
    path = path.replace("{domain}", encodeURIComponent(String(parameters.domain)));
    delete parameters.domain;
  }
  return request(context.apiKey, path, endpoint.method, parameters, context.fetcher, context.signal);
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "the_companies_api",
  Object.fromEntries(
    theCompaniesApiActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await request(input.apiKey, "/v2/user", "GET", {}, fetcher, signal);
    return {
      profile: {
        displayName: optionalString(user.fullName) || optionalString(user.email) || "The Companies API Account",
      },
      grantedScopes: [],
      metadata: {},
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "the_companies_api",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Basic " },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/json" }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
