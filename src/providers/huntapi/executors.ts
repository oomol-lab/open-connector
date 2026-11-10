import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const service = "huntapi";
const apiBaseUrl = "https://api.huntapi.com";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const huntapiActionHandlers: ProviderActionHandlers<"huntapi", Handler> = {
  async download_video(input, context) {
    return objectPayload(
      await huntapiRequest("/v1/video/download", context, {
        query: requiredInputString(input.url, "url"),
        video_quality: optionalString(input.videoQuality),
        video_format: optionalString(input.videoFormat),
        download_type: optionalString(input.downloadType),
        max_duration: optionalInteger(input.maxDuration),
      }),
      "HuntAPI download_video",
    );
  },
  async download_audio(input, context) {
    return objectPayload(
      await huntapiRequest("/v1/audio/download", context, {
        query: requiredInputString(input.url, "url"),
        audio_quality: optionalString(input.audioQuality),
        audio_format: optionalString(input.audioFormat),
        max_duration: optionalInteger(input.maxDuration),
      }),
      "HuntAPI download_audio",
    );
  },
  async get_job(input, context) {
    return objectPayload(
      await huntapiRequest(`/v1/jobs/${encodePathSegment(requiredInputString(input.jobId, "jobId"))}`, context, {}),
      "HuntAPI get_job",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, huntapiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const usage = objectPayload(
      await huntapiRequest("/v1/usage", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "HuntAPI usage",
    );
    const account = optionalRecord(usage.account);
    const slug = optionalString(account?.slug);
    return {
      profile: {
        accountId: slug ? `huntapi:account:${slug}` : "huntapi-api-key",
        displayName: optionalString(account?.name) ?? "HuntAPI API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v1/usage",
        remaining: optionalNumber(usage.remaining),
      },
    };
  },
};

async function huntapiRequest(
  path: string,
  context: RequestContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
  body?: unknown,
): Promise<unknown> {
  try {
    return await requestJson({
      providerName: "HuntAPI",
      baseUrl: apiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      phase,
      body,
      headers: { "x-api-key": context.apiKey },
    });
  } catch (error) {
    // HuntAPI answers an exceeded rate limit with 401, which would otherwise read as a rejected key.
    if (error instanceof ProviderRequestError && error.status === 401 && /rate limit/i.test(error.message)) {
      throw new ProviderRequestError(429, error.message, error.details);
    }
    throw error;
  }
}
