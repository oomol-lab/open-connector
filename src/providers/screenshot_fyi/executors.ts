import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "screenshot_fyi";
const screenshotFyiApiBaseUrl = "https://www.screenshot.fyi";
const screenshotFyiCapturePath = "/api/take";
const screenshotFyiDefaultRequestTimeoutMs = 30_000;
const screenshotFyiValidationUrl = "https://example.com";

type ScreenshotFyiRequestPhase = "validate" | "execute";
type ScreenshotFyiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const screenshotFyiActionHandlers: ProviderActionHandlers<"screenshot_fyi", ScreenshotFyiActionHandler> = {
  async take_screenshot(input, context): Promise<unknown> {
    const payload = await requestScreenshotFyiJson({
      apiKey: context.apiKey,
      query: buildTakeScreenshotQuery(input),
      context,
      phase: "execute",
    });
    return parseScreenshotFyiCapturePayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, screenshotFyiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestScreenshotFyiJson({
      apiKey: input.apiKey,
      query: {
        url: screenshotFyiValidationUrl,
        width: "1",
        height: "1",
      },
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });
    parseScreenshotFyiCapturePayload(payload);

    return {
      profile: {
        displayName: "screenshot.fyi API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: screenshotFyiApiBaseUrl,
        validationEndpoint: screenshotFyiCapturePath,
        validationUrl: screenshotFyiValidationUrl,
      },
    };
  },
};

function buildTakeScreenshotQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    url: optionalString(input.url),
    width: stringifyOptionalNumber(optionalInteger(input.width)),
    height: stringifyOptionalNumber(optionalInteger(input.height)),
    fullPage: stringifyOptionalBoolean(optionalBoolean(input.fullPage)),
    darkMode: stringifyOptionalBoolean(optionalBoolean(input.darkMode)),
    disableCookieBanners: stringifyOptionalBoolean(optionalBoolean(input.disableCookieBanners)),
  });
}

async function requestScreenshotFyiJson(input: {
  apiKey: string;
  query: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: ScreenshotFyiRequestPhase;
}): Promise<unknown> {
  const timeout = createTimeoutSignal(input.context.signal, screenshotFyiDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildScreenshotFyiUrl(input.apiKey, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readScreenshotFyiPayload(response);
    if (!response.ok) {
      throw createScreenshotFyiError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout || isAbortError(error) ? 504 : 502,
      timeout.didTimeout || isAbortError(error)
        ? "screenshot.fyi request timed out"
        : error instanceof Error
          ? `screenshot.fyi request failed: ${error.message}`
          : "screenshot.fyi request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildScreenshotFyiUrl(apiKey: string, query: Record<string, string | undefined>): URL {
  const url = new URL(screenshotFyiCapturePath, screenshotFyiApiBaseUrl);
  url.searchParams.set("accessKey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readScreenshotFyiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "screenshot.fyi returned invalid JSON");
  }
}

function parseScreenshotFyiCapturePayload(payload: unknown): { url: string } {
  const record = optionalRecord(payload);
  const screenshotUrl = optionalString(record?.url);
  if (!screenshotUrl) {
    throw new ProviderRequestError(502, "screenshot.fyi capture response did not include url");
  }

  return { url: screenshotUrl };
}

function createScreenshotFyiError(
  response: Response,
  payload: unknown,
  phase: ScreenshotFyiRequestPhase,
): ProviderRequestError {
  const message =
    extractScreenshotFyiErrorMessage(payload) ?? `screenshot.fyi request failed with status ${response.status}`;
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractScreenshotFyiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelMessage = optionalString(record.error);
  const detailMessage = readFirstDetailMessage(record.details);
  if (topLevelMessage && detailMessage) {
    return `${topLevelMessage}: ${detailMessage}`;
  }

  return topLevelMessage ?? detailMessage;
}

function readFirstDetailMessage(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return optionalString(optionalRecord(value[0])?.message);
}

function stringifyOptionalBoolean(value: boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value ? "true" : "false";
}

function stringifyOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function createTimeoutSignal(
  sourceSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeout: boolean; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    state.didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromSource = (): void => controller.abort();
  sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  const state = {
    signal: controller.signal,
    didTimeout: false,
    cleanup(): void {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    },
  };
  return state;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
