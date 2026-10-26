import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { securityscorecardActions } from "./actions.ts";

const baseUrl = "https://api.securityscorecard.io";
function segment(value: unknown, field: string) {
  const text = requiredInputString(value, field);
  if (text === "." || text === "..") throw providerInputError(`${field} must not be a dot path segment`);
  return encodeURIComponent(text);
}

async function request(
  fetcher: typeof fetch,
  apiKey: string,
  path: string,
  method = "GET",
  fields: Record<string, unknown> = {},
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "SecurityScorecard" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
    if (method === "GET") {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const hasBody = method !== "GET" && method !== "DELETE" && Object.keys(fields).length > 0;
    const headers = new Headers({
      authorization: `Token ${apiKey}`,
      accept: "application/json",
      "user-agent": providerUserAgent,
    });
    if (hasBody) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(fields) : undefined,
      signal,
    });
    if (response.ok && method === "DELETE") return { success: true };
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `SecurityScorecard returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const nested = optionalRecord(error?.error);
      const message =
        optionalString(error?.message) ??
        optionalString(error?.error) ??
        optionalString(nested?.message) ??
        `HTTP ${response.status}`;
      const code = optionalString(error?.code) ?? optionalString(nested?.code);
      throw new ProviderRequestError(
        response.status,
        `SecurityScorecard: ${code ? `${code}: ` : ""}${message}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "SecurityScorecard response");
  });
}

async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const apiKey = context.apiKey;
  const fetcher = context.fetcher;
  const { portfolio_id, domain, scorecard_identifier, ...fields } = values;
  switch (actionName) {
    case "list_portfolios":
      return request(fetcher, apiKey, "/portfolios", undefined, undefined, context.signal);
    case "create_portfolio":
      return request(fetcher, apiKey, "/portfolios", "POST", fields, context.signal);
    case "update_portfolio":
      return request(
        fetcher,
        apiKey,
        `/portfolios/${segment(portfolio_id, "portfolio_id")}`,
        "PUT",
        fields,
        context.signal,
      );
    case "delete_portfolio":
      return request(
        fetcher,
        apiKey,
        `/portfolios/${segment(portfolio_id, "portfolio_id")}`,
        "DELETE",
        undefined,
        context.signal,
      );
    case "list_portfolio_companies":
      return request(
        fetcher,
        apiKey,
        `/portfolios/${segment(portfolio_id, "portfolio_id")}/companies`,
        "GET",
        fields,
        context.signal,
      );
    case "add_portfolio_company":
    case "remove_portfolio_company":
      return request(
        fetcher,
        apiKey,
        `/portfolios/${segment(portfolio_id, "portfolio_id")}/companies/${segment(requiredInputString(domain, "domain").toLowerCase(), "domain")}`,
        actionName === "add_portfolio_company" ? "PUT" : "DELETE",
        undefined,
        context.signal,
      );
    case "get_company":
      return request(
        fetcher,
        apiKey,
        `/companies/${segment(scorecard_identifier, "scorecard_identifier")}`,
        undefined,
        undefined,
        context.signal,
      );
    case "get_company_factors":
      return request(
        fetcher,
        apiKey,
        `/companies/${segment(scorecard_identifier, "scorecard_identifier")}/factors`,
        "GET",
        fields,
        context.signal,
      );
    case "get_company_score_history":
      return request(
        fetcher,
        apiKey,
        `/companies/${segment(scorecard_identifier, "scorecard_identifier")}/history/score`,
        "GET",
        fields,
        context.signal,
      );
    default:
      throw providerInputError("Unknown SecurityScorecard action");
  }
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "securityscorecard",
  Object.fromEntries(
    securityscorecardActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(fetcher, input.apiKey, "/portfolios", undefined, undefined, signal);
    return {
      profile: { displayName: "SecurityScorecard API Token" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/portfolios" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "securityscorecard",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "user-agent": providerUserAgent }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
