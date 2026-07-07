import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ringover";
const regions = {
  eu: "https://public-api.ringover.com/v2",
  us: "https://public-api-us.ringover.com/v2",
};

interface RingoverContext {
  apiKey: string;
  baseUrl: string;
  region: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type Handler = ProviderRuntimeHandler<RingoverContext>;

export const ringoverActionHandlers: Record<string, Handler> = {
  async get_team(_input, context) {
    const raw = await ringoverRequest("/teams", context);
    return { team: objectPayload(raw, "team"), raw };
  },
  async list_groups(input, context) {
    return listOutput(await ringoverRequest("/groups", context, paginationQuery(input)), "groups");
  },
  async get_group(input, context) {
    const raw = await ringoverRequest(
      `/groups/${pathValue(input.groupId, "groupId")}`,
      context,
      paginationQuery(input),
    );
    return { group: objectPayload(raw, "group"), raw };
  },
  async list_users(_input, context) {
    return listOutput(await ringoverRequest("/users", context), "users");
  },
  async get_user(input, context) {
    const raw = await ringoverRequest(`/users/${pathValue(input.userId, "userId")}`, context);
    return { user: objectPayload(raw, "user"), raw };
  },
  async list_numbers(input, context) {
    return listOutput(
      await ringoverRequest("/numbers", context, compactObject({ type: optionalString(input.type) })),
      "numbers",
    );
  },
  async get_number(input, context) {
    const raw = await ringoverRequest(`/numbers/${pathValue(input.number, "number")}`, context);
    return { number: objectPayload(raw, "number"), raw };
  },
  async list_ivrs(_input, context) {
    return listOutput(await ringoverRequest("/ivrs", context), "ivrs");
  },
  async get_ivr(input, context) {
    const raw = await ringoverRequest(`/ivrs/${pathValue(input.ivrId, "ivrId")}`, context);
    return { ivr: objectPayload(raw, "ivr"), raw };
  },
  async list_tags(_input, context) {
    return listOutput(await ringoverRequest("/tags", context), "tags");
  },
  async get_tag(input, context) {
    const raw = await ringoverRequest(`/tags/${pathValue(input.tagId, "tagId")}`, context);
    return { tag: objectPayload(raw, "tag"), raw };
  },
  async list_calls(input, context) {
    return listOutput(
      await ringoverRequest(
        "/calls",
        context,
        compactObject({
          start_date: optionalString(input.startDate),
          end_date: optionalString(input.endDate),
          limit_count: optionalInteger(input.limitCount),
          limit_offset: optionalInteger(input.limitOffset),
          last_id_returned: optionalString(input.lastIdReturned),
          call_type: optionalString(input.callType),
        }),
      ),
      "calls",
    );
  },
  async get_call(input, context) {
    return listOutput(await ringoverRequest(`/calls/${pathValue(input.callId, "callId")}`, context), "calls");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<RingoverContext>({
  service,
  handlers: ringoverActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    const region = normalizeRegion(credential.values.region);
    return {
      apiKey: credential.apiKey,
      region,
      baseUrl: regions[region],
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ringoverProxyBaseUrl,
  auth: { type: "api_key_authorization", prefix: "" },
});

async function ringoverProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return regions[normalizeRegion(credential.values.region)];
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = normalizeRegion(input.values.region);
    const raw = objectPayload(
      await ringoverRequest(
        "/teams",
        { apiKey: input.apiKey, baseUrl: regions[region], fetcher, signal },
        undefined,
        "validate",
      ),
      "Ringover team",
    );
    return {
      profile: {
        accountId: optionalStringOrNumber(raw.team_id ?? raw.id) ?? region,
        displayName:
          optionalString(raw.team_name) ?? optionalString(raw.name) ?? `Ringover ${region.toUpperCase()} API Key`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: regions[region],
        region,
        validationEndpoint: "/teams",
      },
    };
  },
};

function ringoverRequest(
  path: string,
  context: Pick<RingoverContext, "apiKey" | "baseUrl" | "fetcher" | "signal">,
  query?: Record<string, string | number | undefined>,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Ringover",
    baseUrl: context.baseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    headers: {
      authorization: context.apiKey,
    },
  });
}

function listOutput(raw: unknown, key: string): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return {
    [key]: Array.isArray(object[key])
      ? object[key]
      : Array.isArray(object.list)
        ? object.list
        : Array.isArray(object.call_list)
          ? object.call_list
          : arrayPayload(raw, key),
    raw: object,
  };
}

function paginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    limit_count: optionalInteger(input.limitCount),
    limit_offset: optionalInteger(input.limitOffset),
  };
}

function normalizeRegion(value: unknown): "eu" | "us" {
  const region = optionalString(value)?.toLowerCase() ?? "eu";
  if (region !== "eu" && region !== "us") {
    throw new ProviderRequestError(400, "region must be eu or us");
  }
  return region;
}

function pathValue(value: unknown, fieldName: string): string {
  return encodePathSegment(requiredString(value, fieldName));
}

function optionalStringOrNumber(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : optionalString(value);
}
