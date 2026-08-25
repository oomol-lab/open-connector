import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type {
  ApiKeyProviderContext,
  ProviderFetch,
  ProviderRuntimeHandler,
  ProviderTransitFile,
} from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError, readProviderTextBody } from "../provider-runtime.ts";

export const photoroomApiBaseUrl = "https://image-api.photoroom.com";
const photoroomAccountUrl = `${photoroomApiBaseUrl}/v2/account`;
const photoroomEditUrl = `${photoroomApiBaseUrl}/v2/edit`;
const photoroomAiShadowsModelVersion = "2026-04-15";
const photoroomShadowModeByStyle: Record<string, string> = {
  auto: "ai.auto-with-overrides",
  soft: "ai.preset-soft",
  hard: "ai.preset-hard",
};

type PhotoroomRequestPhase = "validate" | "execute";

export const photoroomActionHandlers: ProviderActionHandlers<
  "photoroom",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  edit_product_image(input, context) {
    return editPhotoroomProductImage(input, context);
  },
};

export async function validatePhotoroomCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await fetchPhotoroom(
    photoroomAccountUrl,
    {
      headers: photoroomHeaders(apiKey, "application/json"),
      signal,
    },
    fetcher,
  );
  const payload = await readPhotoroomJson(response);
  if (!response.ok) {
    throw createPhotoroomError(response, payload, "validate");
  }

  const account = normalizePhotoroomAccount(payload);
  return {
    profile: {
      accountId: "photoroom",
      displayName: account.plan ? `Photoroom ${account.plan}` : "Photoroom API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: photoroomApiBaseUrl,
      validationEndpoint: "/v2/account",
      plan: account.plan,
      images: account.images,
    }),
  };
}

async function editPhotoroomProductImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const response = await fetchPhotoroom(
    buildPhotoroomEditUrl(input),
    {
      headers: photoroomHeaders(
        context.apiKey,
        "image/png, image/jpeg, image/webp, application/json",
        input.shadowStyle !== undefined,
      ),
      signal: context.signal,
    },
    context.fetcher,
  );

  if (!response.ok) {
    throw createPhotoroomError(response, await readPhotoroomJson(response), "execute");
  }

  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Photoroom edited image",
    createError: (message) => new ProviderRequestError(413, message),
  });
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, "Photoroom response did not include edited image bytes");
  }

  const contentType = detectPhotoroomImageMimeType(bytes);
  if (!contentType) {
    throw new ProviderRequestError(502, "Photoroom response was not a supported PNG, JPEG, or WebP image");
  }

  const fileName = `photoroom-product-image.${extensionForMimeType(contentType)}`;
  let file: ProviderTransitFile;
  try {
    const stored = await context.transitFiles.create(
      new File([Uint8Array.from(bytes)], fileName, { type: contentType }),
    );
    file = {
      fileId: stored.fileId,
      downloadUrl: stored.downloadUrl,
      sizeBytes: stored.sizeBytes,
      name: stored.name,
      mimeType: stored.mimeType,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(500, error instanceof Error ? error.message : "Unknown file transit error", error);
  }

  return {
    file,
    humanReviewRecommended:
      input.lightingMode !== undefined || input.textRemovalMode !== undefined || input.beautifyMode !== undefined,
  };
}

export function buildPhotoroomEditUrl(input: Record<string, unknown>): URL {
  const url = new URL(photoroomEditUrl);
  url.searchParams.set("imageUrl", requireTrimmedInputString(input.imageUrl, "imageUrl"));

  const background = requireInputObject(input.background, "background");
  const backgroundType = requireInputString(background.type, "background.type");
  if (backgroundType === "keep") {
    url.searchParams.set("removeBackground", "false");
    setOptionalString(url, "background.blur.mode", background.blurMode);
    setOptionalNumber(url, "background.blur.radius", background.blurRadius);
  } else if (backgroundType === "color") {
    url.searchParams.set("removeBackground", "true");
    url.searchParams.set("background.color", requireTrimmedInputString(background.color, "background.color"));
  } else if (backgroundType === "image") {
    url.searchParams.set("removeBackground", "true");
    url.searchParams.set("background.imageUrl", requireTrimmedInputString(background.imageUrl, "background.imageUrl"));
    setOptionalString(url, "background.scaling", background.scaling);
  } else if (backgroundType === "ai") {
    url.searchParams.set("removeBackground", "true");
    url.searchParams.set("background.prompt", requireTrimmedInputString(background.prompt, "background.prompt"));
    setOptionalNumber(url, "background.seed", background.seed);
    setOptionalString(url, "background.expandPrompt.mode", background.expandPromptMode);
  } else {
    throw new ProviderRequestError(400, `unsupported photoroom background type: ${backgroundType}`);
  }

  const shadowStyle = optionalRawString(input.shadowStyle);
  if (shadowStyle !== undefined) {
    const shadowMode = photoroomShadowModeByStyle[shadowStyle];
    if (!shadowMode) {
      throw new ProviderRequestError(400, `unsupported photoroom shadow style: ${shadowStyle}`);
    }
    url.searchParams.set("shadow.mode", shadowMode);
  }
  setOptionalString(url, "lighting.mode", input.lightingMode);
  setOptionalString(url, "textRemoval.mode", input.textRemovalMode);
  setOptionalString(url, "beautify.mode", input.beautifyMode);
  setOptionalNumber(url, "beautify.seed", input.beautifySeed);

  const outline = optionalRecord(input.outline);
  if (outline) {
    url.searchParams.set("outline.color", requireTrimmedInputString(outline.color, "outline.color"));
    setOptionalNumber(url, "outline.width", outline.width);
    setOptionalNumber(url, "outline.blurRadius", outline.blurRadius);
  }

  const canvas = optionalRecord(input.canvas);
  if (canvas) {
    if (typeof canvas.width === "number" && typeof canvas.height === "number") {
      url.searchParams.set("outputSize", `${canvas.width}x${canvas.height}`);
    }
    setOptionalNumber(url, "padding", canvas.padding);
    setOptionalString(url, "scaling", canvas.scaling);
    setOptionalString(url, "horizontalAlignment", canvas.horizontalAlignment);
    setOptionalString(url, "verticalAlignment", canvas.verticalAlignment);
  }

  setOptionalString(url, "export.format", input.outputFormat);
  setOptionalNumber(url, "export.dpi", input.outputDpi);
  return url;
}

async function fetchPhotoroom(input: string | URL, init: RequestInit, fetcher: ProviderFetch): Promise<Response> {
  try {
    return await fetcher(input, init);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Photoroom request failed", error);
  }
}

async function readPhotoroomJson(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Photoroom response");
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPhotoroomError(
  response: Response,
  payload: unknown,
  phase: PhotoroomRequestPhase,
): ProviderRequestError {
  const message = extractPhotoroomErrorMessage(payload) ?? `Photoroom request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 402) {
    return new ProviderRequestError(502, message, {
      status: response.status,
      payload,
    });
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, {
    status: response.status,
    payload,
  });
}

function extractPhotoroomErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalRawString(error?.message) ??
    optionalRawString(error?.detail) ??
    optionalRawString(record?.message) ??
    optionalRawString(record?.error)
  );
}

function normalizePhotoroomAccount(payload: unknown): {
  plan: string | undefined;
  images: {
    available: number;
    subscription: number;
  };
} {
  const account = optionalRecord(payload);
  if (!account) {
    throw new ProviderRequestError(502, "Photoroom account response was not an object");
  }
  const images = optionalRecord(account.images);
  const available = optionalNumber(images?.available);
  const subscription = optionalNumber(images?.subscription);
  const plan = optionalRawString(account.plan);

  if (!images || available === undefined || subscription === undefined) {
    throw new ProviderRequestError(502, "Photoroom account response did not include image quota details");
  }

  return {
    plan,
    images: {
      available,
      subscription,
    },
  };
}

function photoroomHeaders(apiKey: string, accept: string, usesAiShadows = false): Record<string, string> {
  const headers: Record<string, string> = {
    accept,
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (usesAiShadows) {
    headers["pr-ai-shadows-model-version"] = photoroomAiShadowsModelVersion;
  }
  return headers;
}

function requireInputString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireTrimmedInputString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (object) {
    return object;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function setOptionalString(url: URL, key: string, value: unknown): void {
  if (typeof value === "string") {
    url.searchParams.set(key, value);
  }
}

function setOptionalNumber(url: URL, key: string, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    url.searchParams.set(key, String(value));
  }
}

function detectPhotoroomImageMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function extensionForMimeType(mimeType: "image/png" | "image/jpeg" | "image/webp"): string {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  return "webp";
}
