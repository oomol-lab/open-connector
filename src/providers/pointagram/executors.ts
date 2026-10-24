import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { pointagramActions } from "./actions.ts";
const baseUrl = "https://app.pointagram.com/api/20";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<
  string,
  {
    method: string;
    path: string;
  }
> = {
  list_players: { method: "GET", path: "/players" },
  get_player: { method: "GET", path: "/players/{player_id}" },
  create_player: { method: "POST", path: "/players" },
  update_player: { method: "POST", path: "/players/{player_id}" },
  delete_player: { method: "DELETE", path: "/players/{player_id}" },
  list_teams: { method: "GET", path: "/teams" },
  get_team: { method: "GET", path: "/teams/{team_id}" },
  create_team: { method: "POST", path: "/teams" },
  update_team: { method: "POST", path: "/teams/{team_id}" },
  list_team_players: { method: "GET", path: "/teams/{team_id}/players" },
  add_team_player: { method: "POST", path: "/teams/{team_id}/players" },
  remove_team_player: { method: "DELETE", path: "/teams/{team_id}/{player_id}" },
};
async function request(
  url: URL,
  method: string,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  apiUser: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Pointagram", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method,
      signal,
      headers: { ...defaultHeaders, "Api-Key": apiKey, "Api-User": apiUser },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await readProviderTextBody(response, "pointagram response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const record = optionalRecord(payload);
    const upstreamStatus = optionalRawString(record?.status);
    if (!response.ok || upstreamStatus?.toLowerCase() === "error" || upstreamStatus?.toLowerCase() === "not found") {
      const message =
        optionalRawString(record?.message) || text || `Pointagram request failed with status ${response.status}`;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        message.split(apiKey).join("[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Pointagram response");
  });
}
interface Context extends ApiKeyProviderContext {
  apiUser?: string;
}
const handlers = mapProviderActionHandlers(
  "pointagram",
  pointagramActions,
  (action) => async (values: Record<string, unknown>, context: Context) => {
    const { apiKey, fetcher } = context;
    const route = routes[action.name]!;
    const fields = { ...values };
    let path = route.path;
    for (const key of ["team_id", "player_id"]) {
      if (path.includes(`{${key}}`)) {
        path = path.replace(`{${key}}`, encodeURIComponent(String(fields[key])));
        delete fields[key];
      }
    }
    const url = new URL(`${baseUrl}${path}`);
    if (route.method === "GET") {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return request(
      url,
      route.method,
      route.method === "POST" ? fields : undefined,
      apiKey,
      requiredInputString(context.apiUser, "apiUser"),
      fetcher,
      context.signal,
    );
  },
);
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "pointagram",
  handlers,
  async createContext(context, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, "pointagram");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      apiUser: credential.values?.apiUser,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request(
      new URL(`${baseUrl}/test`),
      "POST",
      undefined,
      requiredInputString(input.apiKey, "API Key"),
      requiredInputString(input.values.apiUser, "apiUser"),
      fetcher,
      signal,
    );
    if (payload.status !== "Ok") {
      throw providerResponseError("Pointagram credential test did not confirm valid credentials");
    }
    return {
      profile: { displayName: optionalRawString(optionalRecord(payload.data)?.organization) || "Pointagram API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pointagram",
  baseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "Api-Key", source: { type: "api_key" } },
      { name: "Api-User", source: { type: "credential_value", name: "apiUser" } },
    ],
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries(defaultHeaders)) if (!headers.has(name)) headers.set(name, value);
  },
});
