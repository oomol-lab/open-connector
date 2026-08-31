import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "gamma";
const gammaApiBaseUrl = "https://public-api.gamma.app";
const gammaApiVersionPath = "/v1.0";
const gammaDefaultRequestTimeoutMs = 30_000;

type GammaRequestPhase = "validate" | "execute";
type GammaActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GammaActionHandler = (input: Record<string, unknown>, context: GammaActionContext) => Promise<unknown>;

interface GammaRequestInput {
  method: "GET" | "POST";
  path: string;
  context: GammaActionContext;
  phase: GammaRequestPhase;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

interface GammaGeneration {
  generationId: string;
  status?: string;
}

export const gammaActionHandlers: ProviderActionHandlers<"gamma", GammaActionHandler> = {
  create_generation(input, context) {
    return createGeneration(input, context);
  },
  get_generation(input, context) {
    return getGeneration(input, context);
  },
  create_generation_and_wait(input, context) {
    return createGenerationAndWait(input, context);
  },
  wait_for_generation(input, context) {
    return waitForGeneration(input, context);
  },
  create_generation_from_template(input, context) {
    return createGenerationFromTemplate(input, context);
  },
  create_generation_from_template_and_wait(input, context) {
    return createGenerationFromTemplateAndWait(input, context);
  },
  list_themes(input, context) {
    return listThemes(input, context);
  },
  list_folders(input, context) {
    return listFolders(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gammaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: GammaActionContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await gammaRequest({
      method: "GET",
      path: "/themes",
      context,
      phase: "validate",
    });
    const data = expectArray(optionalRecord(payload)?.data, "malformed gamma theme list response");

    return {
      profile: {
        accountId: "gamma-api-key",
        displayName: "Gamma API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: gammaApiBaseUrl,
        validationEndpoint: "/v1.0/themes",
        themeCount: data.length,
      },
    };
  },
};

async function createGeneration(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  const payload = await gammaRequest({
    method: "POST",
    path: "/generations",
    context,
    phase: "execute",
    body: buildCreateGenerationBody(input),
  });

  return {
    generation: normalizeGeneration(payload),
  };
}

async function getGeneration(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  return {
    generation: await fetchGeneration(requiredInputString(input.generationId, "generationId"), context),
  };
}

async function createGenerationFromTemplate(
  input: Record<string, unknown>,
  context: GammaActionContext,
): Promise<unknown> {
  const payload = await gammaRequest({
    method: "POST",
    path: "/generations/from-template",
    context,
    phase: "execute",
    body: buildCreateGenerationFromTemplateBody(input),
  });

  return {
    generation: normalizeGeneration(payload),
  };
}

async function createGenerationAndWait(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  const created = (await createGeneration(input, context)) as { generation: GammaGeneration };
  return waitForGeneration(
    {
      generationId: created.generation.generationId,
      timeoutSeconds: input.timeoutSeconds,
      pollIntervalSeconds: input.pollIntervalSeconds,
    },
    context,
  );
}

async function createGenerationFromTemplateAndWait(
  input: Record<string, unknown>,
  context: GammaActionContext,
): Promise<unknown> {
  const created = (await createGenerationFromTemplate(input, context)) as { generation: GammaGeneration };
  return waitForGeneration(
    {
      generationId: created.generation.generationId,
      timeoutSeconds: input.timeoutSeconds,
      pollIntervalSeconds: input.pollIntervalSeconds,
    },
    context,
  );
}

async function waitForGeneration(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  const generationId = requiredInputString(input.generationId, "generationId");
  const timeoutMs = toMilliseconds(input.timeoutSeconds, 120_000);
  const pollIntervalMs = toMilliseconds(input.pollIntervalSeconds, 5_000);
  const startedAt = Date.now();

  let generation = await fetchGeneration(generationId, context, timeoutMs > 0 ? timeoutMs : undefined);
  if (isTerminalGenerationStatus(generation.status)) {
    return { generation, timedOut: false };
  }
  if (timeoutMs <= 0 || Date.now() - startedAt >= timeoutMs) {
    return { generation, timedOut: true };
  }

  for (;;) {
    const remainingBeforeSleep = timeoutMs - (Date.now() - startedAt);
    if (remainingBeforeSleep <= 0) {
      return { generation, timedOut: true };
    }
    if (pollIntervalMs > 0) {
      await sleep(Math.min(pollIntervalMs, remainingBeforeSleep));
    }

    const remainingBeforeFetch = timeoutMs - (Date.now() - startedAt);
    if (remainingBeforeFetch <= 0) {
      return { generation, timedOut: true };
    }

    generation = await fetchGeneration(generationId, context, remainingBeforeFetch);
    if (isTerminalGenerationStatus(generation.status)) {
      return { generation, timedOut: false };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return { generation, timedOut: true };
    }
  }
}

async function listThemes(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  const payload = await gammaRequest({
    method: "GET",
    path: "/themes",
    context,
    phase: "execute",
    query: buildListQuery(input),
  });
  const parsed = requireResponseObject(payload, "theme list response");

  return {
    themes: expectArray(parsed.data, "malformed gamma theme list response").map((item) => normalizeTheme(item)),
    pageInfo: normalizePageInfo(parsed),
  };
}

async function listFolders(input: Record<string, unknown>, context: GammaActionContext): Promise<unknown> {
  const payload = await gammaRequest({
    method: "GET",
    path: "/folders",
    context,
    phase: "execute",
    query: buildListQuery(input),
  });
  const parsed = requireResponseObject(payload, "folder list response");

  return {
    folders: expectArray(parsed.data, "malformed gamma folder list response").map((item) => normalizeFolder(item)),
    pageInfo: normalizePageInfo(parsed),
  };
}

function buildCreateGenerationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson({
    inputText: requiredInputString(input.inputText, "inputText"),
    additionalInstructions: optionalString(input.additionalInstructions),
    textMode: requiredInputString(input.textMode, "textMode"),
    format: optionalString(input.format),
    numCards: optionalInteger(input.numCards),
    cardSplit: optionalString(input.cardSplit),
    themeId: optionalString(input.themeId),
    textOptions: optionalRecord(input.textOptions),
    imageOptions: optionalRecord(input.imageOptions),
    cardOptions: optionalRecord(input.cardOptions),
    sharingOptions: optionalRecord(input.sharingOptions),
    folderIds: Array.isArray(input.folderIds) ? input.folderIds : undefined,
    exportAs: optionalString(input.exportAs),
  }) as Record<string, unknown>;
}

function buildCreateGenerationFromTemplateBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson({
    prompt: requiredInputString(input.prompt, "prompt"),
    gammaId: requiredInputString(input.gammaId, "gammaId"),
    themeId: optionalString(input.themeId),
    imageOptions: optionalRecord(input.imageOptions),
    sharingOptions: optionalRecord(input.sharingOptions),
    folderIds: Array.isArray(input.folderIds) ? input.folderIds : undefined,
    exportAs: optionalString(input.exportAs),
  }) as Record<string, unknown>;
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    query: optionalString(input.query),
    limit: optionalInteger(input.limit)?.toString(),
    after: optionalString(input.after),
  });
}

async function fetchGeneration(
  generationId: string,
  context: GammaActionContext,
  timeoutMs?: number,
): Promise<GammaGeneration & Record<string, unknown>> {
  const payload = await gammaRequest({
    method: "GET",
    path: `/generations/${encodeURIComponent(generationId)}`,
    context,
    phase: "execute",
    timeoutMs,
  });

  return normalizeGeneration(payload) as GammaGeneration & Record<string, unknown>;
}

function isTerminalGenerationStatus(status: string | undefined): boolean {
  return status === "completed" || status === "failed";
}

async function gammaRequest(input: GammaRequestInput): Promise<unknown> {
  const requestTimeoutMs =
    input.timeoutMs == null ? gammaDefaultRequestTimeoutMs : Math.min(gammaDefaultRequestTimeoutMs, input.timeoutMs);
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;
  const url = new URL(`${gammaApiVersionPath}${input.path}`, gammaApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: gammaHeaders(input.context.apiKey),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const rawText = await response.text();
    const payload = rawText ? tryParseJson(rawText) : null;
    if (!response.ok) {
      throw mapGammaError(response.status, payload ?? rawText, input.phase);
    }
    if (rawText && payload === undefined) {
      throw new ProviderRequestError(502, "invalid gamma JSON response");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Gamma request timed out", error);
    }
    const message = error instanceof Error ? `Gamma request failed: ${error.message}` : "Gamma request failed";
    throw new ProviderRequestError(502, message, error);
  }
}

function gammaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function tryParseJson(rawText: string): unknown | undefined {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }
}

function mapGammaError(status: number, payload: unknown, phase: GammaRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload);
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const parsed = optionalRecord(payload);
  return optionalString(parsed?.message) ?? optionalString(parsed?.error) ?? "Gamma request failed";
}

function normalizeGeneration(payload: unknown): Record<string, unknown> {
  const parsed = requireResponseObject(payload, "generation response");
  return compactJson({
    generationId: readResponseString(parsed, "generationId"),
    status: optionalString(parsed.status),
    gammaId: optionalString(parsed.gammaId),
    gammaUrl: optionalString(parsed.gammaUrl),
    exportUrl: optionalString(parsed.exportUrl),
    warnings: optionalString(parsed.warnings),
    error: normalizeGenerationError(parsed.error),
    credits: normalizeCredits(parsed.credits),
  }) as Record<string, unknown>;
}

function normalizeGenerationError(value: unknown): Record<string, unknown> | undefined {
  const parsed = optionalRecord(value);
  if (!parsed) {
    return undefined;
  }
  const message = optionalString(parsed.message);
  const statusCode = optionalInteger(parsed.statusCode);
  if (!message || statusCode === undefined) {
    return undefined;
  }
  return { message, statusCode };
}

function normalizeCredits(value: unknown): Record<string, number> | undefined {
  const parsed = optionalRecord(value);
  if (!parsed) {
    return undefined;
  }
  const deducted = optionalInteger(parsed.deducted);
  const remaining = optionalInteger(parsed.remaining);
  if (deducted === undefined || remaining === undefined) {
    return undefined;
  }
  return { deducted, remaining };
}

function normalizeTheme(value: unknown): Record<string, unknown> {
  const parsed = requireResponseObject(value, "theme");
  return compactJson({
    id: readResponseString(parsed, "id"),
    name: readResponseString(parsed, "name"),
    type: readResponseString(parsed, "type"),
    toneKeywords: Array.isArray(parsed.toneKeywords) ? parsed.toneKeywords.map((item) => String(item)) : undefined,
    colorKeywords: Array.isArray(parsed.colorKeywords) ? parsed.colorKeywords.map((item) => String(item)) : undefined,
  }) as Record<string, unknown>;
}

function normalizeFolder(value: unknown): Record<string, unknown> {
  const parsed = requireResponseObject(value, "folder");
  return {
    id: readResponseString(parsed, "id"),
    name: readResponseString(parsed, "name"),
  };
}

function normalizePageInfo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    hasMore: value.hasMore === true,
    nextCursor: optionalString(value.nextCursor) ?? null,
  };
}

function expectArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed gamma ${fieldName}`, value);
  }
  return record;
}

function readResponseString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(502, `missing gamma field: ${key}`, input);
  }
  return value;
}

function toMilliseconds(value: unknown, defaultValue: number): number {
  const seconds = optionalNumber(value);
  if (seconds === undefined || Number.isNaN(seconds)) {
    return defaultValue;
  }
  return Math.max(0, Math.round(seconds * 1000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://public-api.gamma.app",
  auth: { type: "api_key_header", name: "x-api-key" },
});
