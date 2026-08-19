import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const service = "tldv";
const apiBaseUrl = "https://pasta.tldv.io";
const apiVersion = "v1alpha1";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const tldvActionHandlers: ProviderActionHandlers<"tldv", Handler> = {
  list_meetings(input, context) {
    return tldvRequest("/meetings", context, {
      query: compactObject({
        query: optionalString(input.query),
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        from: optionalString(input.from),
        to: optionalString(input.to),
        onlyParticipated: optionalBoolean(input.onlyParticipated),
        meetingType: optionalString(input.meetingType),
      }),
    });
  },
  get_meeting(input, context) {
    return tldvRequest(`/meetings/${encodePathSegment(requiredString(input.meetingId, "meetingId"))}`, context);
  },
  get_transcript(input, context) {
    return tldvRequest(
      `/meetings/${encodePathSegment(requiredString(input.meetingId, "meetingId"))}/transcript`,
      context,
    );
  },
  get_notes(input, context) {
    return tldvRequest(`/meetings/${encodePathSegment(requiredString(input.meetingId, "meetingId"))}/notes`, context);
  },
  import_meeting(input, context) {
    return tldvRequest("/meetings/import", context, {
      method: "POST",
      body: compactObject({
        name: requiredString(input.name, "name"),
        url: requiredString(input.url, "url"),
        happenedAt: optionalString(input.happenedAt),
        dryRun: optionalBoolean(input.dryRun),
        participants: input.participants,
      }),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tldvActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await tldvRequest("/meetings", { apiKey: input.apiKey, fetcher, signal }, { query: { limit: 1 } }, "validate");
    return {
      profile: {
        accountId: "tldv-api-key",
        displayName: "tl;dv API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        apiVersion,
        validationEndpoint: `/${apiVersion}/meetings`,
      },
    };
  },
};

function tldvRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options:
    | {
        method?: string;
        query?: Record<string, string | number | boolean | undefined>;
        body?: unknown;
      }
    | undefined = {},
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "tl;dv",
    baseUrl: apiBaseUrl,
    path: `/${apiVersion}${path.startsWith("/") ? path : `/${path}`}`,
    fetcher: context.fetcher,
    signal: context.signal,
    method: options?.method,
    query: options?.query,
    body: options?.body,
    phase,
    headers: {
      "x-api-key": context.apiKey,
    },
  });
}
