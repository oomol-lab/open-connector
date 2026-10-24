import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { cnbActions } from "./actions.ts";

const baseUrl = "https://api.cnb.cool";
const defaultHeaders = { accept: "application/vnd.cnb.api+json" };
interface Route {
  method: string;
  suffix: string;
  list?: boolean;
}
const routes: Record<string, Route> = {
  list_repositories: { method: "GET", suffix: "/user/repos", list: true },
  get_repository: { method: "GET", suffix: "" },
  list_issues: { method: "GET", suffix: "/-/issues", list: true },
  get_issue: { method: "GET", suffix: "/-/issues/{number}" },
  create_issue: { method: "POST", suffix: "/-/issues" },
  update_issue: { method: "PATCH", suffix: "/-/issues/{number}" },
  list_issue_comments: { method: "GET", suffix: "/-/issues/{number}/comments", list: true },
  create_issue_comment: { method: "POST", suffix: "/-/issues/{number}/comments" },
  list_pull_requests: { method: "GET", suffix: "/-/pulls", list: true },
  get_pull_request: { method: "GET", suffix: "/-/pulls/{number}" },
  create_pull_request: { method: "POST", suffix: "/-/pulls" },
  update_pull_request: { method: "PATCH", suffix: "/-/pulls/{number}" },
  list_builds: { method: "GET", suffix: "/-/build/logs" },
  get_build_status: { method: "GET", suffix: "/-/build/status/{sn}" },
};
function encodeSegment(value: string) {
  if (value === "." || value === ".." || value.includes("\\") || value.length === 0) {
    throw new ProviderRequestError(400, "Invalid CNB path segment", undefined, "invalid_input");
  }
  return encodeURIComponent(value);
}
function encodeRepository(value: string) {
  const segments = value.split("/");
  if (segments.length < 2) {
    throw new ProviderRequestError(
      400,
      "CNB repo must include an organization and repository",
      undefined,
      "invalid_input",
    );
  }
  return segments.map(encodeSegment).join("/");
}
interface CnbRequest {
  pathname: string;
  method: string;
  parameters: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ pathname, method, parameters, apiKey, fetcher, parentSignal }: CnbRequest) {
  return runProviderRequest({ signal: parentSignal, label: "CNB" }, async (signal) => {
    const url = new URL(`${baseUrl}${pathname}`);
    if (method === "GET") {
      for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await fetcher(url.toString(), {
      method,
      signal,
      headers: {
        ...defaultHeaders,
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(parameters),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const error = optionalRecord(payload);
    if (!response.ok || (typeof error?.errcode === "number" && error.errcode !== 0)) {
      const message = optionalRawString(error?.errmsg);
      const code = typeof error?.errcode === "number" ? ` (errcode ${error.errcode})` : "";
      const detail = (message || `HTTP ${response.status}`).split(apiKey).join("[REDACTED]");
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `CNB request failed${code}: ${detail}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}
const handlers = mapProviderActionHandlers(
  "cnb",
  cnbActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const { repo, number, ...parameters } = dataInput;
    if (route.list || action.name === "list_builds") {
      parameters.page ??= 1;
      parameters.page_size ??= action.name === "list_builds" ? 30 : 10;
    }
    if (action.name === "list_repositories") parameters.role ??= "Guest";
    let suffix = route.suffix.replace("{number}", String(number));
    if (action.name === "get_build_status") {
      suffix = suffix.replace("{sn}", encodeSegment(String(parameters.sn)));
      delete parameters.sn;
    }
    if (action.name === "update_issue" && parameters.state !== undefined) {
      const valid =
        parameters.state === "open"
          ? parameters.state_reason === "reopened"
          : parameters.state_reason === "completed" || parameters.state_reason === "not_planned";
      if (!valid) {
        throw new ProviderRequestError(
          400,
          "CNB issue state and state_reason do not match",
          undefined,
          "invalid_input",
        );
      }
    }
    const pathname = repo === undefined ? suffix : `/${encodeRepository(String(repo))}${suffix}`;
    const payload = await request({
      pathname: pathname,
      method: route.method,
      parameters: parameters,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (route.list) {
      if (!Array.isArray(payload)) {
        throw new ProviderRequestError(502, "CNB returned an invalid list response", undefined, "provider_error");
      }
      return { items: payload };
    }
    return requiredResponseRecord(payload, "CNB response");
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("cnb", handlers, { skipDnsValidation: true });
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "CNB Access Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "cnb",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/vnd.cnb.api+json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
