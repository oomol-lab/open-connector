import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

type WinstonAiRequestPhase = "validate" | "execute";
type WinstonAiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface WinstonAiRequestInput {
  path: string;
  body: Record<string, unknown>;
  phase: WinstonAiRequestPhase;
}

export const winstonAiApiBaseUrl = "https://api.gowinston.ai";
const winstonAiDefaultRequestTimeoutMs = 60_000;
const winstonAiValidationText =
  "Winston AI validates this connector credential with a short AI content detection request. This sample text is intentionally long enough to satisfy the documented minimum length for reliable API analysis while avoiding any user data.";

export const winstonAiActionHandlers: ProviderActionHandlers<"winston_ai", WinstonAiActionHandler> = {
  detect_ai_text(input, context) {
    return requestWinstonAiJson(
      { path: "/v2/ai-content-detection", body: buildScanBody(input), phase: "execute" },
      context,
    );
  },
  check_plagiarism(input, context) {
    return requestWinstonAiJson({ path: "/v2/plagiarism", body: buildScanBody(input), phase: "execute" }, context);
  },
  fact_check(input, context) {
    return requestWinstonAiJson({ path: "/v2/fact-checker", body: buildScanBody(input), phase: "execute" }, context);
  },
  compare_texts(input, context) {
    return requestWinstonAiJson(
      {
        path: "/v2/text-compare",
        body: {
          first_text: input.first_text,
          second_text: input.second_text,
        },
        phase: "execute",
      },
      context,
    );
  },
};

export async function validateWinstonAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestWinstonAiJson(
    {
      path: "/v2/ai-content-detection",
      body: {
        text: winstonAiValidationText,
        sentences: false,
        language: "en",
      },
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "winston-ai-api-key",
      displayName: "Winston AI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: winstonAiApiBaseUrl,
      validationEndpoint: "/v2/ai-content-detection",
      creditsRemaining: readNumberLike(payload, "credits_remaining"),
    },
  };
}

function buildScanBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    text: input.text,
    file: input.fileUrl,
    website: input.websiteUrl,
    version: input.version,
    sentences: input.sentences,
    language: input.language,
    excluded_sources: input.excluded_sources,
    country: input.country,
  });
}

async function requestWinstonAiJson(
  input: WinstonAiRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  return runProviderRequest(
    { signal: context.signal, timeoutMs: winstonAiDefaultRequestTimeoutMs, label: "Winston AI" },
    async (signal) => {
      const response = await context.fetcher(new URL(input.path, winstonAiApiBaseUrl), {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${context.apiKey}`,
          "content-type": "application/json",
          "user-agent": providerUserAgent,
        },
        body: JSON.stringify(input.body),
        signal,
      });
      const payload = await readWinstonAiPayload(response);
      if (!response.ok) throw createWinstonAiError(response, payload, input.phase);
      return payload;
    },
  );
}

async function readWinstonAiPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.trim() === "") return {};
  try {
    const payload = JSON.parse(text) as unknown;
    const record = optionalRecord(payload);
    if (record) return record;
  } catch {
    // handled below
  }
  throw new ProviderRequestError(502, "Winston AI returned invalid JSON");
}

function createWinstonAiError(
  response: Response,
  payload: Record<string, unknown>,
  phase: WinstonAiRequestPhase,
): ProviderRequestError {
  const message = extractWinstonAiErrorMessage(payload) ?? `Winston AI request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractWinstonAiErrorMessage(payload: Record<string, unknown>): string | undefined {
  const description = optionalString(payload.description);
  const error = optionalString(payload.error);
  const message = optionalString(payload.message);
  if (description && error) return `${error}: ${description}`;
  return description ?? error ?? message;
}

function readNumberLike(payload: unknown, key: string): number | undefined {
  const value = optionalRecord(payload)?.[key];
  return typeof value === "number" ? value : undefined;
}
