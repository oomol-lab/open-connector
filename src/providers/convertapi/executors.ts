import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderTransitFile } from "../provider-runtime.ts";
import type { ConvertapiActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  uploadProviderUrlToTransitFile,
} from "../provider-runtime.ts";

const service = "convertapi";
const convertapiApiBaseUrl = "https://v2.convertapi.com";
const convertapiCredentialHelpUrl = "https://www.convertapi.com/a/authentication";
const convertapiDefaultRequestTimeoutMs = 120_000;

type ConvertapiActionContext = ApiKeyProviderContext;
type ConvertapiActionHandler = (input: Record<string, unknown>, context: ConvertapiActionContext) => Promise<unknown>;

interface NormalizedConvertapiFile {
  fileName?: string;
  fileExt?: string;
  fileSize?: number;
  fileId?: string;
  url?: string;
  transitFile?: ProviderTransitFile | null;
}

export const convertapiActionHandlers: Record<ConvertapiActionName, ConvertapiActionHandler> = {
  convert_pdf_to_docx(input, context) {
    return convertPdfToDocx(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, convertapiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input): Promise<CredentialValidationResult> {
    requiredString(input.apiKey, "apiKey", providerInputError);
    return {
      profile: {
        accountId: "convertapi-api-token",
        displayName: "ConvertAPI API Token",
        grantedScopes: [],
      },
      metadata: {
        apiBaseUrl: convertapiApiBaseUrl,
        credentialHelpUrl: convertapiCredentialHelpUrl,
      },
    };
  },
};

async function convertPdfToDocx(input: Record<string, unknown>, context: ConvertapiActionContext): Promise<unknown> {
  const payload = await requestConvertapiJson({
    context,
    path: "/convert/pdf/to/docx",
    formData: buildConvertPdfToDocxForm(input),
  });

  return normalizeConversionPayload(payload, context);
}

function buildConvertPdfToDocxForm(input: Record<string, unknown>): FormData {
  const fileUrl = assertPublicHttpUrl(requiredString(input.fileUrl, "fileUrl", providerInputError), {
    fieldName: "fileUrl",
    createError: providerInputError,
  });
  const formData = new FormData();
  formData.set("File", fileUrl.toString());
  formData.set("StoreFile", "true");
  setOptionalFormValue(formData, "FileName", input.fileName);
  setOptionalFormValue(formData, "Timeout", input.timeout);
  setOptionalFormValue(formData, "Password", input.password);
  setOptionalFormValue(formData, "PageRange", input.pageRange);
  setOptionalFormValue(formData, "Layout", input.layout);
  setOptionalFormValue(formData, "OcrMode", input.ocrMode);
  setOptionalFormValue(formData, "OcrLanguage", input.ocrLanguage);
  setOptionalFormValue(formData, "OcrEngine", input.ocrEngine);
  setOptionalFormValue(formData, "Annotations", input.annotations);
  return formData;
}

function setOptionalFormValue(formData: FormData, name: string, value: unknown): void {
  if (value !== undefined) {
    formData.set(name, String(value));
  }
}

async function requestConvertapiJson(input: {
  context: ConvertapiActionContext;
  path: string;
  formData: FormData;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, convertapiDefaultRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, convertapiApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      body: input.formData,
      signal: timeout.signal,
    });
    payload = await readConvertapiPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ConvertAPI request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ConvertAPI request failed: ${error.message}` : "ConvertAPI request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createConvertapiError(response, payload);
  }
  return payload;
}

async function readConvertapiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ConvertAPI returned invalid JSON");
  }
}

function createConvertapiError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.Message) ??
    optionalString(record?.message) ??
    `ConvertAPI request failed with HTTP ${response.status}`;

  if (response.status === 400 || response.status === 415) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 503) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

async function normalizeConversionPayload(
  payload: unknown,
  context: ConvertapiActionContext,
): Promise<Record<string, unknown>> {
  const record = optionalRecord(payload);
  const filesValue = record?.Files;
  const files = Array.isArray(filesValue)
    ? (await Promise.all(filesValue.map((file) => normalizeConvertedFile(file, context)))).filter(
        (file) => file !== undefined,
      )
    : [];

  if (files.length === 0) {
    throw new ProviderRequestError(502, "ConvertAPI response did not include files", payload);
  }

  return compactObject({
    conversionCost: optionalInteger(record?.ConversionCost),
    files,
  });
}

async function normalizeConvertedFile(
  value: unknown,
  context: ConvertapiActionContext,
): Promise<NormalizedConvertapiFile | undefined> {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const url = optionalString(record.Url);
  return compactObject({
    fileName: optionalString(record.FileName),
    fileExt: optionalString(record.FileExt),
    fileSize: optionalInteger(record.FileSize),
    fileId: optionalString(record.FileId),
    url,
    transitFile: url
      ? await uploadProviderUrlToTransitFile(
          {
            url,
            name: inferConvertedFileName(record),
            source: "ConvertAPI",
          },
          context,
        )
      : null,
  }) as NormalizedConvertapiFile;
}

function inferConvertedFileName(record: Record<string, unknown>): string {
  const fileName = optionalString(record.FileName);
  if (fileName) {
    return fileName;
  }
  const fileId = optionalString(record.FileId) ?? "convertapi-output";
  const fileExt = optionalString(record.FileExt);
  return fileExt ? `${fileId}.${fileExt}` : fileId;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
