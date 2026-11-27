import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, providerInputError, runProviderRequest } from "../provider-runtime.ts";

const service = "straitly";
const apiBaseUrl = "https://api.straitly.ai/v1";
const requestLabel = "Straitly API";
const inferenceTimeoutMs = 300_000;

function requestStraitly(
  context: ApiKeyProviderContext,
  path: string,
  options: { body?: Record<string, unknown>; phase?: ProviderRequestPhase } = {},
): Promise<unknown> {
  const phase = options.phase ?? "execute";
  return runProviderRequest(
    { label: requestLabel, signal: context.signal, timeoutMs: options.body ? inferenceTimeoutMs : undefined },
    async (signal) => {
      try {
        return await requestJson({
          providerName: requestLabel,
          baseUrl: apiBaseUrl,
          fetcher: context.fetcher,
          headers: { authorization: `Bearer ${context.apiKey}` },
          signal,
          path,
          body: options.body,
          phase,
        });
      } catch (error) {
        if (
          phase === "execute" &&
          error instanceof ProviderRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw new ProviderRequestError(error.status, error.message, error.details, "provider_error");
        }
        throw error;
      }
    },
  );
}

async function listModels(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const result = objectPayload(await requestStraitly(context, "/models"), "Straitly model list");
  arrayPayload(result.data, "Straitly model list data");
  return result;
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, {
  list_models(_input, context) {
    return listModels(context);
  },
  async create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return objectPayload(
      await requestStraitly(context, "/chat/completions", { body: { ...input, stream: false } }),
      "Straitly chat completion",
    );
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  timeoutMs: inferenceTimeoutMs,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  // /v1/models is public on Straitly, so validate keys against /v1/key (401 on bad key, no inference).
  async apiKey(input, { fetcher, signal }) {
    objectPayload(
      await requestStraitly({ apiKey: input.apiKey, fetcher, signal }, "/key", { phase: "validate" }),
      "Straitly key validation",
    );
    return {
      profile: { displayName: "Straitly API Key" },
      metadata: { validationEndpoint: "/key" },
    };
  },
};
