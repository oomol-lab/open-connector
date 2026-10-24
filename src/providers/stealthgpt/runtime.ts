import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionName } from "../provider-executors.ts";

import { optionalRecord, optionalString, requiredNumber, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const stealthgptApiBaseUrl = "https://www.stealthgpt.ai";

type StealthgptPhase = "validate" | "execute";

interface TextActionInput {
  model: string;
  qualityMode?: string;
  isMultilingual?: boolean;
  outputFormat?: string;
}

interface GenerateTextInput extends TextActionInput {
  prompt: string;
  writingMode?: string;
  tone?: string;
}

interface HumanizeTextInput extends TextActionInput {
  text: string;
}

export async function validateStealthgptCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const balance = await stealthgptJsonRequest(
    "/api/stealthify/balance",
    { method: "GET" },
    apiKey,
    fetcher,
    "validate",
    signal,
  );

  return {
    profile: { displayName: "StealthGPT API Key" },
    metadata: {
      apiBaseUrl: stealthgptApiBaseUrl,
      validationEndpoint: "/api/stealthify/balance",
      credits: requiredNumber(balance.credits, "StealthGPT balance credits", providerResponseError),
      paygMode: optionalString(optionalRecord(balance.payg)?.mode),
    },
  };
}

export async function executeStealthgptAction(
  actionName: ProviderActionName<"stealthgpt">,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (actionName) {
    case "generate_text":
      return executeGenerateText(input as unknown as GenerateTextInput, apiKey, fetcher, signal);
    case "humanize_text":
      return executeHumanizeText(input as unknown as HumanizeTextInput, apiKey, fetcher, signal);
    case "detect_ai_text":
      return executeDetectAiText(input, apiKey, fetcher, signal);
    case "get_balance":
      return executeGetBalance(apiKey, fetcher, signal);
  }
}

async function executeGenerateText(
  input: GenerateTextInput,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const payload = await stealthgptJsonRequest(
    "/api/stealthify",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        rephrase: false,
        model: input.model,
        writingMode: input.writingMode,
        tone: input.tone,
        qualityMode: input.qualityMode,
        isMultilingual: input.isMultilingual,
        outputFormat: input.outputFormat,
      }),
    },
    apiKey,
    fetcher,
    "execute",
    signal,
  );
  requireTextResult(payload);
  return payload;
}

async function executeHumanizeText(
  input: HumanizeTextInput,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const payload = await stealthgptJsonRequest(
    "/api/stealthify",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: input.text,
        rephrase: true,
        model: input.model,
        qualityMode: input.qualityMode,
        isMultilingual: input.isMultilingual,
        outputFormat: input.outputFormat,
      }),
    },
    apiKey,
    fetcher,
    "execute",
    signal,
  );
  requireTextResult(payload);
  return payload;
}

async function executeDetectAiText(
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const payload = await stealthgptJsonRequest(
    "/api/stealthify/detect",
    {
      method: "POST",
      body: JSON.stringify({ text: input.text }),
    },
    apiKey,
    fetcher,
    "execute",
    signal,
  );
  requiredNumber(payload.howLikelyToBeDetected, "StealthGPT detection howLikelyToBeDetected", providerResponseError);
  return payload;
}

async function executeGetBalance(apiKey: string, fetcher: typeof fetch, signal?: AbortSignal) {
  const payload = await stealthgptJsonRequest(
    "/api/stealthify/balance",
    { method: "GET" },
    apiKey,
    fetcher,
    "execute",
    signal,
  );
  requiredNumber(payload.credits, "StealthGPT balance credits", providerResponseError);
  return payload;
}

async function stealthgptJsonRequest(
  path: string,
  init: RequestInit,
  apiKey: string,
  fetcher: typeof fetch,
  phase: StealthgptPhase,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "StealthGPT", signal: parentSignal }, async (signal) => {
    const response = await fetcher(new URL(path, stealthgptApiBaseUrl), {
      ...init,
      headers: {
        accept: "application/json",
        "api-token": apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readStealthgptPayload(response);
    if (!response.ok) {
      throw createStealthgptError(response.status, payload, phase);
    }
    return requiredResponseRecord(payload, "StealthGPT response");
  });
}

async function readStealthgptPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createStealthgptError(status: number, payload: unknown, phase: StealthgptPhase) {
  const message = readStealthgptErrorMessage(payload) ?? `StealthGPT request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401) {
    return phase === "validate" ? providerInputError(message) : new ProviderRequestError(401, message);
  }
  if (status === 400) {
    return providerInputError(message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readStealthgptErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message)?.trim() || undefined;
}

function requireTextResult(payload: Record<string, unknown>) {
  requiredString(payload.result, "StealthGPT result", providerResponseError);
}
