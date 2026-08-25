import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, readProviderJson } from "../provider-runtime.ts";

const apiBaseUrl = "https://api.dandelion.eu";

async function request(path: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const body = new URLSearchParams({ token: context.apiKey });
  for (const [name, value] of Object.entries(input)) {
    if (value != null) body.set(name, String(value));
  }
  const response = await context.fetcher(new URL(path, apiBaseUrl), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: context.signal,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new ProviderRequestError(
      response.status,
      message || `Dandelion request failed with status ${response.status}`,
    );
  }
  return readProviderJson<unknown>(response, "Dandelion response");
}

function languageResult(payload: unknown) {
  if (typeof payload != "object" || payload == null || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.detectedLangs)) return payload;
  return {
    timestamp: record.timestamp,
    time: record.time,
    detectedLanguages: record.detectedLangs.map((item) => {
      const language =
        typeof item == "object" && item != null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      return { language: language.lang, confidence: language.confidence };
    }),
  };
}

export const dandelionActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  extract_entities(input, context) {
    return request(
      "/datatxt/nex/v1/",
      compactObject({
        text: optionalString(input.text),
        lang: optionalString(input.language),
        min_confidence: optionalNumber(input.minimumConfidence),
        top_entities: optionalNumber(input.maximumEntities),
        include: Array.isArray(input.include) ? input.include.join(",") : undefined,
        country: optionalString(input.country),
      }),
      context,
    );
  },
  analyze_sentiment(input, context) {
    return request(
      "/datatxt/sent/v1/",
      compactObject({ text: optionalString(input.text), lang: optionalString(input.language) }),
      context,
    );
  },
  async detect_language(input, context) {
    return languageResult(
      await request(
        "/datatxt/li/v1/",
        compactObject({ text: optionalString(input.text), clean: input.clean }),
        context,
      ),
    );
  },
  compare_text_similarity(input, context) {
    return request(
      "/datatxt/sim/v1/",
      compactObject({
        text1: optionalString(input.firstText),
        text2: optionalString(input.secondText),
        lang: optionalString(input.language),
        bow: input.bagOfWords,
      }),
      context,
    );
  },
};

export async function validateDandelionApiKey(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  await request("/datatxt/li/v1/", { text: "Hello" }, { apiKey, fetcher });
  return {
    profile: { displayName: "Dandelion API Token" },
    metadata: { apiBaseUrl, validationEndpoint: "/datatxt/li/v1/" },
  };
}
