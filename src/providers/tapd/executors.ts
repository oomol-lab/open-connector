import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
  isAbortLikeError,
  basicAuthorizationHeader,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { tapdActions, tapdFamilies } from "./actions.ts";

interface CredentialContext extends ApiKeyProviderContext {
  values: Record<string, string>;
}
const baseUrl = "https://api.tapd.cn";
const reservedFilters = new Set(["workspace_id", "page", "limit", "fields", "order", "format"]);
function authorization(input: { apiKey?: string; values?: Record<string, string> }) {
  const username = requiredInputString(input.values?.apiUser, "apiUser");
  if (username.includes(":"))
    throw new ProviderRequestError(400, "apiUser must not contain a colon", undefined, "invalid_input");
  return basicAuthorizationHeader(`${username}:${requiredInputString(input.apiKey, "API Key")}`);
}
function unwrap(value: unknown, wrapper: string) {
  const record = requiredResponseRecord(value, "TAPD record wrapper");
  return requiredResponseRecord(record[wrapper], `TAPD ${wrapper}`);
}
interface TapdRequest {
  path: string;
  query: URLSearchParams;
  auth: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ path, query, auth, fetcher, parentSignal }: TapdRequest) {
  return runProviderRequest({ signal: parentSignal, label: "TAPD" }, async (signal) => {
    const url = new URL(path, baseUrl);
    url.search = query.toString();
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        authorization: auth,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    let payload: Record<string, unknown>;
    try {
      payload = requiredResponseRecord(await response.json(), "TAPD response");
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "TAPD returned an invalid JSON response",
        undefined,
        "provider_error",
      );
    }
    if (!response.ok || payload.status !== 1) {
      const detail = path === "/quickstart/testauth" ? undefined : optionalRawString(payload.info);
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `TAPD request failed${detail ? `: ${detail}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return payload;
  });
}
const handlers = mapProviderActionHandlers(
  "tapd",
  tapdActions,
  (action) => async (dataInput: Record<string, unknown>, context: CredentialContext) => {
    const values = dataInput;
    const query = new URLSearchParams();
    const filters = optionalRecord(values.filters) ?? {};
    for (const [key, value] of Object.entries(filters)) {
      if (reservedFilters.has(key))
        throw new ProviderRequestError(400, `filters must not contain ${key}`, undefined, "invalid_input");
      query.set(key, String(value));
    }
    for (const [key, value] of Object.entries(values)) {
      if (key !== "filters" && value != null) query.set(key, String(value));
    }
    let path: string;
    let wrapper: string;
    const count = action.name.startsWith("count_");
    if (action.name === "list_projects") {
      path = "/workspaces/projects";
      wrapper = "Workspace";
    } else if (action.name === "get_project") {
      path = "/workspaces/get_workspace_info";
      wrapper = "Workspace";
    } else {
      const family = tapdFamilies.find(
        (item) => action.name === `list_${item.name}` || action.name === `count_${item.name}`,
      )!;
      path = `/${family.path}${count ? "/count" : ""}`;
      wrapper = family.wrapper;
      if (!count) {
        query.set("page", String(values.page ?? 1));
        query.set("limit", String(values.limit ?? 30));
      }
    }
    const payload = await request({
      path: path,
      query: query,
      auth: authorization(context),
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (count) {
      const result = requiredResponseRecord(payload.data, "TAPD count");
      const countValue =
        typeof result.count === "string" && result.count.trim() !== "" ? Number(result.count) : result.count;
      if (typeof countValue !== "number" || !Number.isInteger(countValue) || countValue < 0)
        throw new ProviderRequestError(502, "TAPD returned an invalid count", undefined, "provider_error");
      return { count: countValue };
    }
    if (action.name === "get_project") return { project: unwrap(payload.data, wrapper) };
    if (!Array.isArray(payload.data))
      throw new ProviderRequestError(502, "TAPD returned an invalid record list", undefined, "provider_error");
    return { items: payload.data.map((item) => unwrap(item, wrapper)) };
  },
);
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "tapd",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CredentialContext> {
    const credential = await requireApiKeyCredential(context, "tapd");
    return { apiKey: credential.apiKey, values: credential.values, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      path: "/quickstart/testauth",
      query: new URLSearchParams(),
      auth: authorization({ apiKey: input.apiKey, values: input.values }),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return {
      profile: { displayName: "TAPD API Account" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/quickstart/testauth" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "tapd",
  baseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "tapd");
    headers.set("authorization", authorization(credential));
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "TAPD request failed"),
      withRetryAfterSeconds(response),
      "provider_error",
    );
  },
});
