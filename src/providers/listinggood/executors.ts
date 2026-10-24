import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { listinggoodActions } from "./actions.ts";

const baseUrl = "https://listinggood.com/api";
const paths: Record<string, string> = {
  ai_readiness_check: "/free-check",
  compliance_check: "/compliance-check",
  fill_from_sentence: "/fill-from-sentence",
  generate_listing: "/generate",
};
const defaultHeaders = { accept: "application/json", "user-agent": providerUserAgent };
interface ListinggoodRequest {
  path: string;
  apiKey: string;
  body: Record<string, unknown> | undefined;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ path, apiKey, body, fetcher, parentSignal }: ListinggoodRequest) {
  return runProviderRequest({ signal: parentSignal, label: "ListingGood" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...defaultHeaders,
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    let payload: Record<string, unknown>;
    try {
      payload = requiredResponseRecord(await response.json(), "ListingGood response");
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "ListingGood returned an invalid JSON response",
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const detail = optionalRawString(payload.error_en) ?? optionalRawString(payload.error);
      throw new ProviderRequestError(
        response.status,
        `ListingGood request failed${detail ? `: ${detail}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return payload;
  });
}
const handlers = mapProviderActionHandlers(
  "listinggood",
  listinggoodActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const values = dataInput;
    const isTask = action.name === "get_task";
    const path = isTask ? `/task/${encodeURIComponent(String(values.task_id))}` : paths[action.name]!;
    const payload: Record<string, unknown> | undefined = isTask ? undefined : { ...values, lang: values.lang ?? "en" };
    if (action.name === "ai_readiness_check" && payload) payload.marketplace ??= "US";
    const body = await request({
      path: path,
      apiKey: context.apiKey,
      body: payload,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (action.name === "generate_listing") {
      if (!optionalRawString(body.task_id)?.trim())
        throw new ProviderRequestError(502, "ListingGood did not return a task_id", undefined, "provider_error");
      return body;
    }
    if (isTask) {
      const state = optionalRawString(body.status);
      if (!state?.trim())
        throw new ProviderRequestError(502, "ListingGood task is missing status", undefined, "provider_error");
      return {
        status: state === "done" ? "succeeded" : state === "error" ? "failed" : "pending",
        task: body,
      };
    }
    return { result: body };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("listinggood", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "ListingGood API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "listinggood",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
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
