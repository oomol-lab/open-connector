import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { thesportsdbActions } from "./actions.ts";
const baseUrl = "https://www.thesportsdb.com/api/v2/json";
function encodePathSegment(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new ProviderRequestError(
      400,
      "TheSportsDB path value must not be empty or a dot segment",
      undefined,
      "invalid_input",
    );
  }
  return encodeURIComponent(trimmed);
}
async function request(
  endpoint: string,
  envelope: string,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "TheSportsDB" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${endpoint}`, {
      signal,
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
    let payload: unknown;
    try {
      payload = await JSON.parse(await readProviderTextBody(response, "thesportsdb response", undefined, signal));
    } catch (error) {
      if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
      if (response.ok) {
        throw new ProviderRequestError(502, "TheSportsDB returned malformed JSON", undefined, "provider_error");
      }
    }
    if (!response.ok) {
      const body = optionalRecord(payload);
      const message =
        optionalRawString(body?.Message) ?? optionalRawString(body?.message) ?? `TheSportsDB HTTP ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        message.replaceAll(apiKey, "[REDACTED]"),
        withRetryAfterSeconds(response),
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    const body = requiredResponseRecord(payload, "TheSportsDB response");
    const items = body[envelope];
    if (items === null) return { items: [] };
    if (!Array.isArray(items)) {
      throw new ProviderRequestError(
        502,
        `TheSportsDB response is missing the ${envelope} collection`,
        undefined,
        "provider_error",
      );
    }
    return { items };
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "thesportsdb",
  mapProviderActionHandlers(
    "thesportsdb",
    thesportsdbActions,
    (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = input;
      const segment = (name: string) => encodePathSegment(requiredInputString(data[name], name));
      let endpoint: string;
      let envelope: string;
      switch (action.name) {
        case "search_entities":
          endpoint = `/search/${data.entity}/${encodePathSegment(requiredInputString(data.query, "query").replaceAll(" ", "_"))}`;
          envelope = "search";
          break;
        case "lookup_entity":
          endpoint = `/lookup/${data.entity}/${segment("id")}`;
          envelope = "lookup";
          break;
        case "list_catalog":
          endpoint = `/all/${data.catalog}`;
          envelope = "all";
          break;
        case "list_related":
          endpoint = `/list/${data.collection}/${segment("id")}`;
          envelope = "list";
          break;
        case "get_schedule":
          endpoint = `/schedule/${data.direction}/${data.entity}/${segment("id")}`;
          envelope = "schedule";
          break;
        case "get_team_season_schedule":
          endpoint = `/schedule/full/team/${segment("id")}`;
          envelope = "schedule";
          break;
        case "get_league_season_schedule":
          endpoint = `/schedule/league/${segment("id")}/${segment("season")}`;
          envelope = "schedule";
          break;
        case "get_livescores":
          endpoint = `/livescore/${encodePathSegment(optionalRawString(data.filter) ?? "all")}`;
          envelope = "livescore";
          break;
        default:
          throw new ProviderRequestError(400, "Unknown TheSportsDB action", undefined, "invalid_input");
      }
      return request(endpoint, envelope, context.apiKey, context.fetcher, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("/all/sports", "all", requiredInputString(input.apiKey, "API Key"), fetcher);
    return {
      profile: { displayName: "TheSportsDB Premium API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/all/sports" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "thesportsdb",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
