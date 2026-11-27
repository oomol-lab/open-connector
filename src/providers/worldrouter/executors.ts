import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { ProviderRequestError, runProviderRequest, providerInputError } from "../provider-runtime.ts";

const service = "worldrouter";
const apiBaseUrl = "https://inference-api.worldrouter.ai/v1";

function requestWorldrouter(
  context: ApiKeyProviderContext,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  return runProviderRequest(
    { label: "WorldRouter API", signal: context.signal, timeoutMs: body ? 300_000 : undefined },
    async (signal) => {
      try {
        return await requestJson({
          providerName: "WorldRouter API",
          baseUrl: apiBaseUrl,
          fetcher: context.fetcher,
          headers: { authorization: `Bearer ${context.apiKey}` },
          signal,
          path,
          body,
        });
      } catch (error) {
        // HTTP status alone cannot distinguish an invalid key from account or model restrictions.
        if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
          throw new ProviderRequestError(error.status, error.message, error.details, "provider_error");
        }
        throw error;
      }
    },
  );
}

async function listModels(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const result = objectPayload(await requestWorldrouter(context, "/models"), "WorldRouter model list");
  arrayPayload(result.data, "WorldRouter model list data");
  return result;
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, {
  list_models(_input, context) {
    return listModels(context);
  },
  async create_chat_completion(input, context) {
    if (input.stream === true) throw providerInputError("stream=true is not supported by connector actions");
    return objectPayload(
      await requestWorldrouter(context, "/chat/completions", { ...input, stream: false }),
      "WorldRouter chat completion",
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await listModels({ apiKey: input.apiKey, fetcher, signal });
    return { metadata: { validationEndpoint: "/models" } };
  },
};
