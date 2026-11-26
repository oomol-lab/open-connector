import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { JsonRequestOptions } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { providerInputError, runProviderRequest } from "../provider-runtime.ts";

const service = "worldrouter";
const apiBaseUrl = "https://inference-api.worldrouter.ai/v1";
const requestLabel = "WorldRouter API";

function requestOptions(context: ApiKeyProviderContext): Omit<JsonRequestOptions, "path"> {
  return {
    providerName: requestLabel,
    baseUrl: apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    headers: { authorization: `Bearer ${context.apiKey}` },
  };
}

async function listModels(
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const payload = await runProviderRequest({ label: requestLabel, signal: context.signal }, (signal) =>
    requestJson({ ...requestOptions(context), signal, path: "/models", phase }),
  );
  const result = objectPayload(payload, "WorldRouter model list");
  arrayPayload(result.data, "WorldRouter model list data");
  return result;
}

const handlers: ProviderActionHandlers<
  typeof service,
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_models(_input, context) {
    return listModels(context, "execute");
  },
  async create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    const payload = await runProviderRequest(
      { label: requestLabel, signal: context.signal, timeoutMs: 300_000 },
      (signal) =>
        requestJson({
          ...requestOptions(context),
          signal,
          path: "/chat/completions",
          body: { ...input, stream: false },
        }),
    );
    return objectPayload(payload, "WorldRouter chat completion");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await listModels({ apiKey: input.apiKey, fetcher, signal }, "validate");
    return { metadata: { validationEndpoint: "/models" } };
  },
};
