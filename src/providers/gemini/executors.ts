import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GeminiActionName } from "./actions.ts";
import type { GeminiRuntimeContext } from "./runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  countGeminiTokens,
  embedGeminiContent,
  fetchGeminiModelsWithMode,
  geminiApiBaseUrl,
  geminiDefaultVideoMaxWaitMs,
  geminiDefaultVideoPollIntervalMs,
  generateGeminiContent,
  generateGeminiImage,
  generateGeminiVideos,
  getGeminiVideosOperation,
  listGeminiModels,
  waitForGeminiVideo,
} from "./runtime.ts";

const service = "gemini";

type GeminiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const geminiActionHandlers: Record<GeminiActionName, GeminiActionHandler> = {
  list_models(input, context) {
    return listGeminiModels(input, createGeminiRuntimeContext(context));
  },
  generate_content(input, context) {
    return generateGeminiContent(input, createGeminiRuntimeContext(context));
  },
  embed_content(input, context) {
    return embedGeminiContent(input, createGeminiRuntimeContext(context));
  },
  count_tokens(input, context) {
    return countGeminiTokens(input, createGeminiRuntimeContext(context));
  },
  generate_image(input, context) {
    return generateGeminiImage(input, createGeminiRuntimeContext(context));
  },
  generate_videos(input, context) {
    return generateGeminiVideos(input, createGeminiRuntimeContext(context));
  },
  get_videos_operation(input, context) {
    return getGeminiVideosOperation(input, createGeminiRuntimeContext(context));
  },
  wait_for_video(input, context) {
    return waitForGeminiVideo(input, createGeminiRuntimeContext(context));
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, geminiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { models } = await fetchGeminiModelsWithMode(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "gemini-api-key",
        displayName: "Gemini API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: geminiApiBaseUrl,
        validationEndpoint: "/models",
        availableModels: models.map((model) => model.name),
      }),
    };
  },
};

function createGeminiRuntimeContext(context: ApiKeyProviderContext): GeminiRuntimeContext {
  return {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    transitFiles: context.transitFiles,
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    pollIntervalMs: geminiDefaultVideoPollIntervalMs,
    maxWaitMs: geminiDefaultVideoMaxWaitMs,
  };
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  auth: { type: "api_key_header", name: "x-goog-api-key" },
});
