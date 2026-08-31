import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderRuntimeHandler,
  ProviderTransitFile,
} from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerFetch, providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const apiBaseUrl = "https://api.imagetranslate.ai";
const translatePath = "/translate/image";
const maximumSourceBytes = 20 * 1024 * 1024;
const maximumResultBytes = 50 * 1024 * 1024;
const maximumResponseBytes = Math.ceil((maximumResultBytes * 4) / 3) + 2 * 1024 * 1024;

export const imagetranslateAiActionHandlers: ProviderActionHandlers<
  "imagetranslate_ai",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  translate_image(input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return translateImage(input, context);
  },
};

export function validateCredential(apiKey: string): CredentialValidationResult {
  if (!apiKey.startsWith("sk_imagetranslate_") || apiKey.length === "sk_imagetranslate_".length) {
    throw new ProviderRequestError(400, "ImageTranslate.AI API keys must start with sk_imagetranslate_");
  }
  return {
    profile: {
      accountId: "api_key",
      displayName: "ImageTranslate.AI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationMode: "format_only",
    },
  };
}

async function translateImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) throw new ProviderRequestError(500, "local transit storage is not configured");
  const imageUrl = requiredString(input.imageUrl, "imageUrl", providerInputError);
  const targetLanguage = requiredString(input.targetLanguage, "targetLanguage", providerInputError);
  if (targetLanguage.toLowerCase() === "auto") {
    throw providerInputError("targetLanguage must be an explicit language code and cannot be auto");
  }
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", providerInputError);
  const source = await downloadSource(imageUrl, context.signal);
  const response = await requestTranslation(
    {
      imageBase64: `data:${source.mimeType};base64,${Buffer.from(source.bytes).toString("base64")}`,
      sourceLanguage: optionalString(input.sourceLanguage) ?? "auto",
      targetLanguage,
      mode: optionalString(input.mode),
      translator: optionalString(input.translator),
      customPrompt: optionalString(input.customPrompt),
    },
    idempotencyKey,
    context,
  );
  const resultImage = requiredString(response.resultImage, "resultImage", upstreamError);
  const prefix = "data:image/png;base64,";
  if (!resultImage.startsWith(prefix)) throw upstreamError("ImageTranslate.AI returned an invalid PNG data URL");
  const bytes = Buffer.from(resultImage.slice(prefix.length), "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > Math.min(maximumResultBytes, context.transitFiles.maxBytes)) {
    throw new ProviderRequestError(413, "ImageTranslate.AI translated image exceeds the local transit limit");
  }
  const stored = await context.transitFiles.create(
    new File([Uint8Array.from(bytes)], "imagetranslate-result.png", { type: "image/png" }),
  );
  const file: ProviderTransitFile = {
    fileId: stored.fileId,
    downloadUrl: stored.downloadUrl,
    sizeBytes: stored.sizeBytes,
    name: stored.name,
    mimeType: stored.mimeType,
  };
  const recordId = requiredString(response.recordId, "recordId", upstreamError);
  const remainingCredit = response.remainingCredit;
  if (typeof remainingCredit !== "number" || !Number.isInteger(remainingCredit) || remainingCredit < 0) {
    throw upstreamError("ImageTranslate.AI response is missing remainingCredit");
  }
  return { recordId, remainingCredit, file };
}

async function downloadSource(url: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let response: Response;
  try {
    response = await providerFetch(url, {
      headers: { accept: "image/jpeg, image/png, image/webp", "user-agent": providerUserAgent },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Failed to download imageUrl: ${error instanceof Error ? error.message : "network error"}`,
      error,
    );
  }
  if (!response.ok) throw providerInputError(`imageUrl returned ${response.status}`);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maximumSourceBytes,
    fieldName: "imageUrl",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const mimeType = detectMimeType(bytes);
  if (!mimeType) throw providerInputError("imageUrl must return a JPG, PNG, or WebP image");
  return { bytes, mimeType };
}

async function requestTranslation(
  body: Record<string, unknown>,
  idempotencyKey: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(translatePath, apiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactObject(body)),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `ImageTranslate.AI request failed: ${error instanceof Error ? error.message : "network error"}`,
      error,
    );
  }
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maximumResponseBytes,
    fieldName: "ImageTranslate.AI response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  let payload: unknown;
  try {
    payload = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  } catch {
    throw upstreamError("ImageTranslate.AI returned malformed JSON");
  }
  const record = optionalRecord(payload) ?? {};
  if (!response.ok) {
    const message =
      optionalString(record.message) ??
      optionalString(record.error) ??
      `ImageTranslate.AI request failed with ${response.status}`;
    throw new ProviderRequestError(
      response.status === 401 || response.status === 403
        ? response.status
        : response.status === 429
          ? 429
          : response.status >= 400 && response.status < 500
            ? 400
            : 502,
      message,
    );
  }
  return record;
}

function detectMimeType(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function upstreamError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `ImageTranslate.AI ${message}`);
}
