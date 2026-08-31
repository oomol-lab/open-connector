import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerFetch,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireCustomCredential,
} from "../provider-runtime.ts";

const service = "ocr_web_service";
const ocrWebServiceApiBaseUrl = "https://www.ocrwebservice.com/restservices";
const ocrWebServiceMaxResponseBytes = 10 * 1024 * 1024;
const ocrWebServiceMaxInputBytes = 25 * 1024 * 1024;
const ocrWebServiceRequestTimeoutMs = 60_000;

interface OcrWebServiceCredential {
  username: string;
  licenseCode: string;
}

interface OcrWebServiceContext extends OcrWebServiceCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type OcrWebServiceActionHandler = (input: Record<string, unknown>, context: OcrWebServiceContext) => Promise<unknown>;

export const ocrWebServiceActionHandlers: ProviderActionHandlers<"ocr_web_service", OcrWebServiceActionHandler> = {
  async get_account_information(_input, context) {
    return normalizeAccountInformation(await requestAccountInformation(context, "execute"));
  },
  async process_document_from_url(input, context) {
    validateProcessDocumentInput(input);
    const fileContent = await downloadFileUrl(input.fileUrl, context.signal);
    const payload = await requestOcrWebService(
      {
        path: "processDocument",
        phase: "execute",
        method: "POST",
        query: buildProcessDocumentQuery(input),
        body: Uint8Array.from(fileContent).buffer,
      },
      context,
    );
    return normalizeProcessDocument(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OcrWebServiceContext>({
  service,
  handlers: ocrWebServiceActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<OcrWebServiceContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...readCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ocrWebServiceApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    headers.set("authorization", buildBasicAuthorizationHeader(readCredential(credential.values)));
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readCredential(input.values);
    const account = normalizeAccountInformation(
      await requestAccountInformation({ ...credential, fetcher, signal }, "validate"),
    );
    return {
      profile: {
        accountId: `ocr_web_service:${credential.username}`,
        displayName: `OCR Web Service (${credential.username})`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ocrWebServiceApiBaseUrl,
        validationEndpoint: "/getAccountInformation",
        username: credential.username,
        availablePages: account.availablePages,
        maxPages: account.maxPages,
        subscriptionPlan: account.subscriptionPlan,
        expirationDate: account.expirationDate,
      },
    };
  },
};

function readCredential(input: Record<string, string>): OcrWebServiceCredential {
  const username = input.username?.trim();
  const licenseCode = input.licenseCode?.trim();
  if (!username) {
    throw new ProviderRequestError(400, "username is required");
  }
  if (!licenseCode) {
    throw new ProviderRequestError(400, "licenseCode is required");
  }
  return { username, licenseCode };
}

function requestAccountInformation(context: OcrWebServiceContext, phase: "validate" | "execute"): Promise<unknown> {
  return requestOcrWebService({ path: "getAccountInformation", phase }, context);
}

async function requestOcrWebService(
  input: {
    path: string;
    phase: "validate" | "execute";
    method?: string;
    query?: Record<string, string | undefined>;
    body?: BodyInit;
  },
  context: OcrWebServiceContext,
): Promise<unknown> {
  const url = new URL(input.path, `${ocrWebServiceApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  const timeout = createProviderTimeout(context.signal, ocrWebServiceRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthorizationHeader(context),
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw mapOcrWebServiceHttpError(response.status, payload, input.phase);
    }
    const embeddedError = extractOcrWebServiceErrorMessage(payload);
    if (embeddedError) {
      throw new ProviderRequestError(input.phase === "validate" ? 400 : 502, embeddedError);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "OCR Web Service request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OCR Web Service request failed: ${error.message}` : "OCR Web Service request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function downloadFileUrl(value: unknown, signal?: AbortSignal): Promise<Uint8Array> {
  const fileUrl = requiredString(value, "fileUrl", ocrWebServiceInputError);
  const timeout = createProviderTimeout(signal, ocrWebServiceRequestTimeoutMs);
  try {
    const response = await providerFetch(fileUrl, { signal: timeout.signal });
    if (!response.ok) {
      throw new ProviderRequestError(400, `failed to fetch fileUrl: ${response.status}`);
    }
    return await readBoundedResponseBytes(response, {
      maxBytes: ocrWebServiceMaxInputBytes,
      fieldName: "fileUrl payload",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error.status === 400 ? error : new ProviderRequestError(400, error.message);
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "fileUrl download timed out");
    }
    throw new ProviderRequestError(400, "failed to fetch fileUrl");
  } finally {
    timeout.cleanup();
  }
}

function validateProcessDocumentInput(input: Record<string, unknown>): void {
  if (input.returnText !== true && input.outputFormats === undefined) {
    throw new ProviderRequestError(400, "returnText must be true or outputFormats must be provided");
  }
}

function buildProcessDocumentQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const returnText = optionalBoolean(input.returnText);
  return {
    language: readOptionalStringList(input.languages)?.join(","),
    pagerange: optionalString(input.pageRange),
    tobw: optionalBoolean(input.toBlackAndWhite)?.toString(),
    zone: readOptionalZones(input.zones),
    outputformat: readOptionalStringList(input.outputFormats)?.join(","),
    gettext: returnText === undefined ? undefined : returnText.toString(),
    getwords: optionalBoolean(input.returnWords)?.toString(),
    newline: optionalBoolean(input.newline) === true ? "1" : undefined,
    description: optionalString(input.description),
  };
}

function readOptionalStringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map((item) => requiredString(item, "list item", ocrWebServiceInputError))
    : undefined;
}

function readOptionalZones(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((item) => {
      const record = optionalRecord(item);
      if (!record) {
        throw new ProviderRequestError(400, "zone item must be an object");
      }
      return [
        integer(record.top, "zone.top", ocrWebServiceInputError),
        integer(record.left, "zone.left", ocrWebServiceInputError),
        integer(record.height, "zone.height", ocrWebServiceInputError),
        integer(record.width, "zone.width", ocrWebServiceInputError),
      ].join(":");
    })
    .join(",");
}

function normalizeAccountInformation(payload: unknown) {
  const record = requireResponseObject(payload, "OCR Web Service account response");
  return {
    availablePages: optionalInteger(record.AvailablePages),
    maxPages: optionalInteger(record.MaxPages),
    lastProcessingTime: normalizeNullableString(record.LastProcessingTime),
    subscriptionPlan: normalizeNullableString(record.SubcriptionPlan ?? record.SubscriptionPlan),
    expirationDate: normalizeNullableString(record.ExpirationDate),
  };
}

function normalizeProcessDocument(payload: unknown) {
  const record = requireResponseObject(payload, "OCR Web Service processDocument response");
  const ocrText = readOcrText(record.OCRText);
  return {
    text: ocrText.flat().join("\n"),
    ocrText,
    availablePages: optionalInteger(record.AvailablePages),
    processedPages: optionalInteger(record.ProcessedPages),
    outputFileUrl: normalizeNullableString(record.OutputFileUrl),
    taskDescription: normalizeNullableString(record.TaskDescription),
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "OCR Web Service response", ocrWebServiceMaxResponseBytes);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OCR Web Service returned invalid JSON");
  }
}

function readOcrText(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((zone) => (Array.isArray(zone) ? zone.map((page) => String(page ?? "")) : [String(zone ?? "")]));
}

function requireResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was malformed`);
  }
  return record;
}

function normalizeNullableString(value: unknown): string | null {
  const text = optionalString(value)?.trim();
  return text || null;
}

function buildBasicAuthorizationHeader(credential: OcrWebServiceCredential): string {
  return `Basic ${Buffer.from(`${credential.username}:${credential.licenseCode}`, "utf8").toString("base64")}`;
}

function mapOcrWebServiceHttpError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractOcrWebServiceErrorMessage(payload) ?? `OCR Web Service request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 402].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 402)) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function extractOcrWebServiceErrorMessage(payload: unknown): string | null {
  const record = optionalRecord(payload);
  return (
    normalizeNullableString(record?.ErrorMessage) ??
    normalizeNullableString(record?.OCRErrorMessage) ??
    normalizeNullableString(record?.error)
  );
}

function ocrWebServiceInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message.endsWith(".") ? message.slice(0, -1) : message);
}
