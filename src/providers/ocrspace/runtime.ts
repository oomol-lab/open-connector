import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalIntegerLike, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, readTransitFileInput } from "../provider-runtime.ts";

type OcrspaceActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type OcrspaceRequestPhase = "validate" | "execute";

const ocrspaceApiBaseUrl = "https://api.ocr.space";
const ocrspaceParsePath = "/parse/image";
const ocrspaceValidationProbeUrl = "https://dl.a9t9.com/ocr/solarcell.jpg";
const ocrspaceMyApiBaseUrl = "https://myapi.ocr.space";
const ocrspaceConversionsPath = "/conversions";

export const ocrspaceActionHandlers: ProviderActionHandlers<"ocrspace", OcrspaceActionHandler> = {
  async extract_text(input, context) {
    const payload = await requestOcrspaceParse(await buildOcrspaceParseFormData(input, context), context, "execute");
    return normalizeOcrspaceParsePayload(payload);
  },
  async get_conversion_stats(input, context) {
    const payload = await requestOcrspaceConversionStats(buildOcrspaceConversionStatsFormData(input), context);
    return normalizeOcrspaceConversionStatsPayload(
      payload,
      optionalString(input.startDate) === "lastMonth" ? "lastMonth" : "currentMonth",
    );
  },
};

export async function validateOcrspaceCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestOcrspaceParse(
    buildOcrspaceValidationFormData(),
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "ocrspace-api-key",
      displayName: "OCR.space API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: ocrspaceApiBaseUrl,
      validationEndpoint: ocrspaceParsePath,
      validationProbeUrl: ocrspaceValidationProbeUrl,
    },
  };
}

function buildOcrspaceValidationFormData(): FormData {
  const formData = new FormData();
  formData.set("url", ocrspaceValidationProbeUrl);
  formData.set("language", "eng");
  formData.set("isOverlayRequired", "false");
  return formData;
}

async function buildOcrspaceParseFormData(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<FormData> {
  const formData = new FormData();
  const url = optionalString(input.url);
  const fileInput = input.file;
  const sourceCount = [url !== undefined, fileInput !== undefined].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of url or file is required");
  }
  if (url) {
    const publicUrl = assertPublicHttpUrl(url, {
      fieldName: "url",
      createError: (message) => new ProviderRequestError(400, message),
    });
    formData.set("url", publicUrl.toString());
  } else {
    const file = await readTransitFileInput(fileInput, context);
    formData.set("file", file.file);
  }

  appendOptionalField(formData, "language", optionalString(input.language));
  appendOptionalBooleanField(formData, "detectOrientation", optionalBoolean(input.detectOrientation));
  appendOptionalBooleanField(formData, "scale", optionalBoolean(input.scale));
  appendOptionalBooleanField(formData, "isOverlayRequired", optionalBoolean(input.isOverlayRequired));
  appendOptionalBooleanField(formData, "isTable", optionalBoolean(input.isTable));
  appendOptionalField(formData, "OCREngine", optionalString(input.ocrEngine));
  return formData;
}

function appendOptionalField(formData: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) {
    formData.set(key, value);
  }
}

function appendOptionalBooleanField(formData: FormData, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    formData.set(key, String(value));
  }
}

function buildOcrspaceConversionStatsFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  const startDate = optionalString(input.startDate);
  if (startDate) {
    formData.set("startDate", startDate);
  }
  return formData;
}

async function requestOcrspaceParse(
  formData: FormData,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: OcrspaceRequestPhase,
): Promise<unknown> {
  const response = await context.fetcher(new URL(ocrspaceParsePath, ocrspaceApiBaseUrl), {
    method: "POST",
    headers: ocrspaceHeaders(context.apiKey),
    body: formData,
    signal: context.signal,
  });
  const payload = await readOcrspacePayload(response);
  if (!response.ok) {
    throw createOcrspaceHttpError(response.status, payload, phase);
  }
  return payload;
}

async function requestOcrspaceConversionStats(
  formData: FormData,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const response = await context.fetcher(new URL(ocrspaceConversionsPath, ocrspaceMyApiBaseUrl), {
    method: "POST",
    headers: ocrspaceHeaders(context.apiKey),
    body: formData,
    signal: context.signal,
  });
  const payload = await readOcrspacePayload(response);
  if (!response.ok) {
    throw createOcrspaceHttpError(response.status, payload, "execute");
  }
  return payload;
}

function ocrspaceHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
  };
}

async function readOcrspacePayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeOcrspaceParsePayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const rawParsedResults = Array.isArray(record?.ParsedResults) ? record.ParsedResults : [];
  const pages = rawParsedResults.map((item, index) => normalizeOcrspacePage(item, index));
  const ocrExitCode = readOptionalInt(record?.OCRExitCode);
  if (ocrExitCode === undefined) {
    throw new ProviderRequestError(502, "OCR.space response missing OCRExitCode", payload);
  }
  if ((ocrExitCode === 3 || ocrExitCode === 4) && !hasSuccessfulPage(pages)) {
    throw new ProviderRequestError(
      502,
      normalizeOptionalMessage(record?.ErrorMessage) ??
        normalizeOptionalMessage(record?.ErrorDetails) ??
        "OCR.space request failed",
      payload,
    );
  }

  return {
    text: joinParsedText(pages),
    pages,
    ocrExitCode,
    isErroredOnProcessing: Boolean(record?.IsErroredOnProcessing),
    errorMessage: normalizeOptionalMessage(record?.ErrorMessage),
    errorDetails: normalizeOptionalMessage(record?.ErrorDetails),
    processingTimeInMilliseconds: optionalString(record?.ProcessingTimeInMilliseconds) ?? "0",
  };
}

function normalizeOcrspaceConversionStatsPayload(
  payload: unknown,
  period: "currentMonth" | "lastMonth",
): Record<string, unknown> {
  const record = optionalRecord(payload);
  const engine1 = readOptionalInt(record?.Engine1);
  const engine2 = readOptionalInt(record?.Engine2);
  const total = readOptionalInt(record?.Total);
  if (engine1 === undefined || engine2 === undefined || total === undefined) {
    throw new ProviderRequestError(502, "OCR.space conversion stats response malformed", payload);
  }
  return {
    engine1,
    engine2,
    total,
    period,
  };
}

interface OcrspacePage {
  pageNumber: number;
  parsedText: string;
  fileParseExitCode: number;
  errorMessage: string | null;
  errorDetails: string | null;
  textOverlay: Record<string, unknown> | null;
}

function normalizeOcrspacePage(value: unknown, index: number): OcrspacePage {
  const record = optionalRecord(value);
  const fileParseExitCode = readOptionalInt(record?.FileParseExitCode);
  if (fileParseExitCode === undefined) {
    throw new ProviderRequestError(502, "OCR.space page missing FileParseExitCode", value);
  }

  return {
    pageNumber: index + 1,
    parsedText: optionalString(record?.ParsedText) ?? "",
    fileParseExitCode,
    errorMessage: normalizeOptionalMessage(record?.ErrorMessage),
    errorDetails: normalizeOptionalMessage(record?.ErrorDetails),
    textOverlay: optionalRecord(record?.TextOverlay) ?? null,
  };
}

function normalizeOptionalMessage(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first : null;
  }
  return optionalString(value) ?? null;
}

function joinParsedText(pages: Array<Pick<OcrspacePage, "parsedText" | "fileParseExitCode">>): string {
  return pages
    .filter((page) => page.fileParseExitCode === 1 && page.parsedText.length > 0)
    .map((page) => page.parsedText)
    .join("\n\n");
}

function hasSuccessfulPage(pages: Array<Pick<OcrspacePage, "fileParseExitCode">>): boolean {
  return pages.some((page) => page.fileParseExitCode === 1);
}

function readOptionalInt(value: unknown): number | undefined {
  return optionalIntegerLike(value, "integer", (message) => new ProviderRequestError(502, message));
}

function createOcrspaceHttpError(status: number, payload: unknown, phase: OcrspaceRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    normalizeOptionalMessage(record?.ErrorMessage) ??
    normalizeOptionalMessage(record?.ErrorDetails) ??
    "OCR.space request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}
