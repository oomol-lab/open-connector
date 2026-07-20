import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderTransitFile } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderFetch,
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "latchshot";
const latchshotApiBaseUrl = "https://latchshot.fly.dev";
const latchshotRenderPath = "/v1/render";
const latchshotUsagePath = "/v1/usage";
const latchshotJsonMaxBytes = 64 * 1024;

type LatchshotActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type LatchshotRequestPhase = "validate" | "execute";

export const latchshotActionHandlers: Record<string, LatchshotActionHandler> = {
  capture_page(input, context) {
    return captureLatchshotPage(input, context);
  },
  get_usage(_input, context) {
    return getLatchshotUsage(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, latchshotActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credentialFetch = createProviderFetch({ fetch: fetcher, skipDnsValidation: true });
    const result = await requestLatchshotUsage(input.apiKey, credentialFetch, signal, "validate");
    return {
      profile: {
        accountId: "latchshot-api-key",
        displayName: `${result.customer.name} (${displayPlan(result.customer.plan)})`,
        grantedScopes: [],
      },
      metadata: {
        apiBaseUrl: latchshotApiBaseUrl,
        plan: result.usage.plan,
        quotaLimit: result.usage.limit,
        quotaRemaining: result.usage.remaining,
        quotaResetAt: result.usage.resetAt,
      },
    };
  },
};

async function captureLatchshotPage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Latchshot capture requires local transit file storage.");
  }

  const kind = optionalString(input.kind) ?? "screenshot";
  const format = kind === "pdf" ? "pdf" : (optionalString(input.format) ?? "png");
  const response = await fetchLatchshot(latchshotRenderPath, context.apiKey, context.fetcher, context.signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      compactObject({
        url: requiredString(input.url, "url", providerInputError),
        kind,
        format,
        width: optionalInteger(input.width),
        height: optionalInteger(input.height),
        scale: optionalInteger(input.scale),
        fullPage: optionalBoolean(input.fullPage),
        waitUntil: optionalString(input.waitUntil),
        delay: optionalInteger(input.delay),
        timeout: optionalInteger(input.timeout),
        darkMode: optionalBoolean(input.darkMode),
        reducedMotion: optionalBoolean(input.reducedMotion),
        paper: optionalString(input.paper),
        landscape: optionalBoolean(input.landscape),
      }),
    ),
  });

  if (!response.ok) {
    throw await createLatchshotError(response, "execute");
  }

  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Latchshot artifact",
    createError: (message) => new ProviderRequestError(413, message),
  });
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, "Latchshot returned an empty artifact.");
  }

  const artifact = resolveArtifact(response.headers.get("content-type"), format);
  const stored = await context.transitFiles.create(
    new File([Uint8Array.from(bytes)], `latchshot-capture.${artifact.extension}`, { type: artifact.mimeType }),
  );
  const file: ProviderTransitFile = {
    fileId: stored.fileId,
    downloadUrl: stored.downloadUrl,
    sizeBytes: stored.sizeBytes,
    name: stored.name,
    mimeType: stored.mimeType,
  };

  return compactObject({
    file,
    diagnostics: compactObject({
      renderMs: readIntegerHeader(response.headers, "x-latchshot-render-ms"),
      navigation: optionalString(response.headers.get("x-latchshot-navigation")),
      fonts: optionalString(response.headers.get("x-latchshot-fonts")),
      scripts: optionalString(response.headers.get("x-latchshot-scripts")),
    }),
    quota: compactObject({
      limit: readIntegerHeader(response.headers, "x-quota-limit"),
      remaining: readIntegerHeader(response.headers, "x-quota-remaining"),
      resetAt: optionalString(response.headers.get("x-quota-reset")),
    }),
  });
}

async function getLatchshotUsage(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  return requestLatchshotUsage(context.apiKey, context.fetcher, context.signal, "execute");
}

async function requestLatchshotUsage(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: LatchshotRequestPhase,
): Promise<ReturnType<typeof normalizeUsagePayload>> {
  const response = await fetchLatchshot(latchshotUsagePath, apiKey, fetcher, signal);
  if (!response.ok) {
    throw await createLatchshotError(response, phase);
  }

  const text = await readProviderTextBody(response, "Latchshot usage response", latchshotJsonMaxBytes);
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Latchshot returned an invalid usage response.");
  }
  return normalizeUsagePayload(payload);
}

async function fetchLatchshot(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", path === latchshotUsagePath ? "application/json" : "*/*");
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.set("user-agent", providerUserAgent);
  try {
    return await fetcher(new URL(path, latchshotApiBaseUrl), { ...init, headers, signal });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Latchshot request failed: ${error.message}` : "Latchshot request failed.",
    );
  }
}

async function createLatchshotError(response: Response, phase: LatchshotRequestPhase): Promise<ProviderRequestError> {
  const text = await readProviderTextBody(response, "Latchshot error response", latchshotJsonMaxBytes);
  const message = extractLatchshotErrorMessage(text) ?? `Latchshot request failed with HTTP ${response.status}.`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if ([400, 401, 403, 413, 429].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message);
}

function extractLatchshotErrorMessage(text: string): string | undefined {
  if (!text.trim()) {
    return undefined;
  }
  try {
    const record = optionalRecord(JSON.parse(text) as unknown);
    return optionalString(optionalRecord(record?.error)?.message) ?? optionalString(record?.message);
  } catch {
    return text.trim().slice(0, 500);
  }
}

function resolveArtifact(contentType: string | null, format: string): { mimeType: string; extension: string } {
  const mimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const supported: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/pdf": "pdf",
  };
  const extension = mimeType ? supported[mimeType] : undefined;
  if (!mimeType || !extension) {
    throw new ProviderRequestError(502, "Latchshot returned an unsupported artifact type.", { contentType });
  }

  const expectedMimeType = format === "pdf" ? "application/pdf" : format === "jpeg" ? "image/jpeg" : "image/png";
  if (mimeType !== expectedMimeType) {
    throw new ProviderRequestError(502, "Latchshot artifact type did not match the requested format.", {
      expectedMimeType,
      contentType: mimeType,
    });
  }
  return { mimeType, extension };
}

function normalizeUsagePayload(payload: unknown): {
  customer: { name: string; plan: string };
  usage: Record<string, unknown>;
  upgradeRequest: Record<string, unknown> | null;
} {
  const record = requireObject(payload, "Latchshot usage response must be an object.");
  const customer = requireObject(record.customer, "Latchshot usage response is missing customer data.");
  const usage = requireObject(record.usage, "Latchshot usage response is missing usage data.");

  return {
    customer: {
      name: requiredString(customer.name, "customer.name", invalidResponseError),
      plan: requiredString(customer.plan, "customer.plan", invalidResponseError),
    },
    usage: {
      period: requiredString(usage.period, "usage.period", invalidResponseError),
      plan: requiredString(usage.plan, "usage.plan", invalidResponseError),
      limit: requireNonNegativeInteger(usage.limit, "usage.limit"),
      remaining: requireNonNegativeInteger(usage.remaining, "usage.remaining"),
      resetAt: requiredString(usage.resetAt, "usage.resetAt", invalidResponseError),
      successful: requireNonNegativeInteger(usage.successful, "usage.successful"),
      failed: requireNonNegativeInteger(usage.failed, "usage.failed"),
      reserved: requireNonNegativeInteger(usage.reserved, "usage.reserved"),
      outputBytes: requireNonNegativeInteger(usage.outputBytes, "usage.outputBytes"),
      renderMs: requireNonNegativeInteger(usage.renderMs, "usage.renderMs"),
      updatedAt:
        usage.updatedAt === null ? null : requiredString(usage.updatedAt, "usage.updatedAt", invalidResponseError),
    },
    upgradeRequest: normalizeUpgradeRequest(record.upgradeRequest),
  };
}

function normalizeUpgradeRequest(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  const request = requireObject(value, "Latchshot upgrade request must be an object.");
  return {
    id: requireNonNegativeInteger(request.id, "upgradeRequest.id", true),
    keyId: requireNonNegativeInteger(request.keyId, "upgradeRequest.keyId", true),
    requestedPlan: requiredString(request.requestedPlan, "upgradeRequest.requestedPlan", invalidResponseError),
    note: optionalRawString(request.note) ?? null,
    status: requiredString(request.status, "upgradeRequest.status", invalidResponseError),
    createdAt: requiredString(request.createdAt, "upgradeRequest.createdAt", invalidResponseError),
    updatedAt: requiredString(request.updatedAt, "upgradeRequest.updatedAt", invalidResponseError),
  };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, message);
}

function requireNonNegativeInteger(value: unknown, fieldName: string, positive = false): number {
  const resolved = optionalInteger(value);
  if (resolved !== undefined && (positive ? resolved > 0 : resolved >= 0)) {
    return resolved;
  }
  throw invalidResponseError(`${fieldName} is invalid.`);
}

function readIntegerHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value || !/^\d+$/u.test(value)) {
    return undefined;
  }
  const resolved = Number(value);
  return Number.isSafeInteger(resolved) ? resolved : undefined;
}

function displayPlan(plan: string): string {
  return plan === "trial" ? "Free" : `${plan[0]!.toUpperCase()}${plan.slice(1)}`;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
