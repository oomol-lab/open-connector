import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderRuntimeHandler,
  ProviderTransitFile,
} from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerFetch,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const apiBaseUrl = "https://api.toriitranslate.com";
const translatePath = "/api/upload";
const ocrPath = "/api/ocr";
const inpaintPath = "/api/inpaint";
const typesetPath = "/api/typeset";
const creditsPath = "/api/credits";
const maximumSourceImageBytes = 50 * 1024 * 1024;
const maximumResponseBytes = 70 * 1024 * 1024;

interface DownloadedImage {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  name: string;
}

interface ToriiResponse {
  payload: unknown;
  creditsRemaining?: number;
}

export const toriiImageTranslatorActionHandlers: ProviderActionHandlers<
  "torii_image_translator",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  translate_image(input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return translateImage(input, context);
  },
  extract_text(input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return extractText(input, context);
  },
  inpaint_image(input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return inpaintImage(input, context);
  },
  typeset_image(input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return typesetImage(input, context);
  },
  get_credits(_input: Record<string, unknown>, context: ApiKeyProviderContext) {
    return getCredits(context.apiKey, context.fetcher, context.signal);
  },
};

export async function validateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await getCredits(apiKey, fetcher, signal);
  return {
    profile: {
      accountId: "api_key",
      displayName: "Torii Image Translator API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationEndpoint: creditsPath,
      credits: result.credits,
    },
  };
}

async function translateImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const source = await downloadSource(
    requiredString(input.imageUrl, "imageUrl", providerInputError),
    "imageUrl",
    context.signal,
  );
  const form = new FormData();
  appendImage(form, "file", source);
  form.set("target_lang", requiredString(input.targetLanguage, "targetLanguage", providerInputError));
  form.set("translator", optionalString(input.translator) ?? "gemini-3.1-flash-lite");
  form.set("font", optionalString(input.font) ?? "noto");
  appendOptional(form, "text_align", optionalString(input.textAlign));
  appendOptional(form, "stroke_disabled", optionalBoolean(input.strokeDisabled));
  appendOptional(form, "min_font_size", optionalInteger(input.minFontSize));
  appendOptional(form, "bubbles_only", optionalBoolean(input.bubblesOnly));
  appendOptional(form, "custom_prompt", optionalString(input.customPrompt));
  appendOptional(form, "context", optionalString(input.context));

  const response = await requestJson(translatePath, context, form);
  const payload = requireRecord(response.payload, "translation response");
  const image = await storePng(payload.image, "torii-translated.png", context);
  if (!Array.isArray(payload.text)) {
    throw new ProviderRequestError(502, "Torii translation response did not include text regions");
  }
  return compactObject({
    translatedImage: image,
    textRegions: objectArray(payload.text, "translation text region", providerResponseError),
    context: optionalString(payload.context),
    creditsRemaining: response.creditsRemaining,
  });
}

async function extractText(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const source = await downloadSource(
    requiredString(input.imageUrl, "imageUrl", providerInputError),
    "imageUrl",
    context.signal,
  );
  const form = new FormData();
  appendImage(form, "file", source);
  const response = await requestJson(ocrPath, context, form);
  if (!Array.isArray(response.payload)) {
    throw new ProviderRequestError(502, "Torii OCR response was not an array");
  }
  return compactObject({
    paragraphs: objectArray(response.payload, "OCR paragraph", providerResponseError),
    creditsRemaining: response.creditsRemaining,
  });
}

async function inpaintImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const [source, mask] = await Promise.all([
    downloadSource(requiredString(input.imageUrl, "imageUrl", providerInputError), "imageUrl", context.signal),
    downloadSource(requiredString(input.maskUrl, "maskUrl", providerInputError), "maskUrl", context.signal),
  ]);
  const form = new FormData();
  appendImage(form, "image", source);
  appendImage(form, "mask", mask);
  const response = await requestJson(inpaintPath, context, form);
  const payload = requireRecord(response.payload, "inpaint response");
  return compactObject({
    image: await storePng(payload.image, "torii-inpainted.png", context),
    creditsRemaining: response.creditsRemaining,
  });
}

async function typesetImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const source = await downloadSource(
    requiredString(input.imageUrl, "imageUrl", providerInputError),
    "imageUrl",
    context.signal,
  );
  const textBoxes = objectArray(input.textBoxes, "textBoxes", providerInputError);
  if (textBoxes.length === 0) throw providerInputError("textBoxes must contain at least one item");
  const form = new FormData();
  appendImage(form, "file", source);
  form.set("text_boxes", JSON.stringify(textBoxes.map(normalizeTextBox)));
  form.set("font", optionalString(input.font) ?? "noto");
  appendOptional(form, "min_font_size", optionalInteger(input.minFontSize));
  appendOptional(form, "stroke_disabled", optionalBoolean(input.strokeDisabled));
  const response = await requestJson(typesetPath, context, form);
  const payload = requireRecord(response.payload, "typeset response");
  return compactObject({
    image: await storePng(payload.image, "torii-typeset.png", context),
    creditsRemaining: response.creditsRemaining,
  });
}

async function getCredits(apiKey: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<{ credits: number }> {
  const response = await requestJsonWith({ path: creditsPath, apiKey, fetcher, signal });
  const payload = requireRecord(response.payload, "credits response");
  const credits = optionalNumber(payload.credits) ?? response.creditsRemaining;
  if (credits == null || !Number.isFinite(credits) || credits < 0) {
    throw new ProviderRequestError(502, "Torii credits response did not include a valid balance");
  }
  return { credits };
}

async function downloadSource(url: string, fieldName: string, signal?: AbortSignal): Promise<DownloadedImage> {
  let response: Response;
  try {
    response = await providerFetch(url, {
      headers: { accept: "image/jpeg, image/png, image/webp", "user-agent": providerUserAgent },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Failed to download ${fieldName}: ${error instanceof Error ? error.message : "network error"}`,
      error,
    );
  }
  if (!response.ok) throw providerInputError(`${fieldName} returned ${response.status}`);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maximumSourceImageBytes,
    fieldName,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const mimeType = detectMimeType(bytes);
  if (!mimeType) throw providerInputError(`${fieldName} must return a JPG, PNG, or WebP image`);
  return { bytes, mimeType, name: `${fieldName}.${mimeType.split("/")[1]}` };
}

async function requestJson(path: string, context: ApiKeyProviderContext, body?: BodyInit): Promise<ToriiResponse> {
  return requestJsonWith({
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    body,
  });
}

async function requestJsonWith(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  body?: BodyInit;
}): Promise<ToriiResponse> {
  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, apiBaseUrl), {
      method: input.body ? "POST" : "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Torii request failed: ${error instanceof Error ? error.message : "network error"}`,
      error,
    );
  }
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maximumResponseBytes,
    fieldName: "Torii response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  let payload: unknown;
  try {
    payload = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  } catch {
    throw new ProviderRequestError(502, "Torii returned malformed JSON");
  }
  if (!response.ok || response.headers.get("success") === "false") {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ??
      optionalString(record?.error) ??
      `Torii request failed with ${response.status}`;
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
  return {
    payload,
    creditsRemaining: optionalNumber(response.headers.get("credits")),
  };
}

async function storePng(value: unknown, name: string, context: ApiKeyProviderContext): Promise<ProviderTransitFile> {
  if (!context.transitFiles) throw new ProviderRequestError(500, "local transit storage is not configured");
  const dataUrl = requiredString(value, "image", providerResponseError);
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new ProviderRequestError(502, "Torii returned an invalid PNG data URL");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
  } catch {
    throw new ProviderRequestError(502, "Torii returned invalid PNG base64");
  }
  if (bytes.byteLength > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `Torii image exceeds ${context.transitFiles.maxBytes} bytes`);
  }
  const stored = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: "image/png" }));
  return {
    fileId: stored.fileId,
    downloadUrl: stored.downloadUrl,
    sizeBytes: stored.sizeBytes,
    name: stored.name,
    mimeType: stored.mimeType,
  };
}

function normalizeTextBox(box: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    x: optionalNumber(box.x),
    y: optionalNumber(box.y),
    width: optionalNumber(box.width),
    height: optionalNumber(box.height),
    polygon: box.polygon,
    text: optionalString(box.text),
    alignment: optionalString(box.alignment),
    text_color: optionalString(box.textColor),
    stroke_color: optionalString(box.strokeColor),
    direction: optionalString(box.direction),
    angle: optionalNumber(box.angle),
    source_lang: optionalString(box.sourceLanguage),
    fontsize: optionalNumber(box.fontSize),
  });
}

function appendImage(form: FormData, name: string, image: DownloadedImage): void {
  form.set(name, new File([Uint8Array.from(image.bytes)], image.name, { type: image.mimeType }));
}

function appendOptional(form: FormData, name: string, value: string | number | boolean | undefined): void {
  if (value != null) form.set(name, String(value));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) return record;
  throw new ProviderRequestError(502, `Torii ${label} was not an object`);
}

function detectMimeType(bytes: Uint8Array): DownloadedImage["mimeType"] | undefined {
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
