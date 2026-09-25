import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { createHmac } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const framejetApiBaseUrl = "https://framejet.dev";

// A capture may wait for slow pages, page steps and goal mode, so it gets more than the default budget.
const framejetCaptureTimeoutMs = 90_000;

const framejetCaptureParams = ["format", "full_page", "width", "height", "dpr", "clean", "delay", "actions"];

type FramejetActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const framejetActionHandlers: ProviderActionHandlers<"framejet", FramejetActionHandler> = {
  take_screenshot(input, context) {
    return takeFramejetScreenshot(input, context);
  },
  create_signed_url(input, context) {
    return createFramejetSignedUrl(input, context);
  },
};

/**
 * Check a key against GET /v1/me, which does not spend a screenshot.
 */
export async function validateFramejetApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const key = requiredInputString(apiKey, "apiKey");
  await runProviderRequest({ signal, label: "Framejet" }, async (requestSignal) => {
    const response = await fetcher(new URL("/v1/me", framejetApiBaseUrl), {
      headers: framejetHeaders(key),
      signal: requestSignal,
    });
    if (!response.ok) {
      const error = await readFramejetError(response);
      // A rejected key is a field error on the connect form, not a reconnect prompt.
      throw response.status === 401 || response.status === 403 ? providerInputError(error.message) : error;
    }
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "Framejet API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: framejetApiBaseUrl,
      validationEndpoint: "/v1/me",
    },
  };
}

async function takeFramejetScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const transitFiles = context.transitFiles;
  if (!transitFiles) {
    throw new ProviderRequestError(500, "take_screenshot requires transit file storage");
  }

  const url = new URL("/v1/take", framejetApiBaseUrl);
  url.search = buildFramejetQuery(input, ["goal", "values", "cache"]).toString();

  return runProviderRequest(
    { signal: context.signal, label: "Framejet", timeoutMs: framejetCaptureTimeoutMs },
    async (signal) => {
      const response = await context.fetcher(url, { headers: framejetHeaders(context.apiKey), signal });
      if (!response.ok) {
        throw await readFramejetError(response);
      }

      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: transitFiles.maxBytes,
        fieldName: "Framejet screenshot",
        createError: (message) => new ProviderRequestError(413, message),
      });
      const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      const name = mimeType === "image/jpeg" ? "framejet-screenshot.jpg" : "framejet-screenshot.png";
      const upload = await transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
      const remaining = response.headers.get("x-framejet-remaining");

      return {
        file: {
          fileId: upload.fileId,
          downloadUrl: upload.downloadUrl,
          sizeBytes: upload.sizeBytes,
          name: upload.name,
          mimeType: upload.mimeType,
        },
        cache: response.headers.get("x-framejet-cache") === "HIT" ? "HIT" : "MISS",
        remaining: remaining === null ? null : Number(remaining),
      };
    },
  );
}

async function createFramejetSignedUrl(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ signed_url: string }> {
  const signingKey = await runProviderRequest({ signal: context.signal, label: "Framejet" }, async (signal) => {
    const response = await context.fetcher(new URL("/v1/signing-key", framejetApiBaseUrl), {
      headers: framejetHeaders(context.apiKey),
      signal,
    });
    if (!response.ok) {
      throw await readFramejetError(response);
    }
    return requiredResponseRecord(await response.json(), "Framejet signing key response");
  });
  const keyId = optionalString(signingKey.key_id);
  const secret = optionalString(signingKey.signing_secret);
  if (!keyId || !secret) {
    throw providerResponseError("Framejet signing key response is missing key_id or signing_secret");
  }

  const query = buildFramejetQuery(input, []);
  query.set("key_id", keyId);
  if (typeof input.expires_in === "number") {
    query.set("expires", String(Math.floor(Date.now() / 1000) + input.expires_in));
  }
  // Framejet verifies the exact bytes before "&sig=", so sign the query string exactly as it is sent.
  const signed = query.toString();
  const sig = createHmac("sha256", secret).update(signed).digest("hex");

  return { signed_url: `${framejetApiBaseUrl}/v1/take?${signed}&sig=${sig}` };
}

function buildFramejetQuery(input: Record<string, unknown>, extraParams: string[]): URLSearchParams {
  const query = new URLSearchParams({ url: requiredInputString(input.url, "url") });
  for (const name of [...framejetCaptureParams, ...extraParams]) {
    const value = input[name];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(name, Array.isArray(value) ? value.join("|") : String(value));
  }
  return query;
}

function framejetHeaders(apiKey: string): Record<string, string> {
  return {
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function readFramejetError(response: Response): Promise<ProviderRequestError> {
  const text = await response.text();
  let payload: Record<string, unknown> | undefined;
  try {
    payload = optionalRecord(JSON.parse(text));
  } catch {
    payload = undefined;
  }
  const message = optionalString(payload?.error) ?? (text || `Framejet request failed with status ${response.status}`);
  const code = optionalString(payload?.code);
  const fullMessage = code ? `${message} (${code})` : message;

  // 402 is Framejet's monthly quota; every other status maps through the shared convention.
  return response.status === 402
    ? new ProviderRequestError(402, fullMessage, payload, "insufficient_credit")
    : new ProviderRequestError(response.status, fullMessage, payload);
}
