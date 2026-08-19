import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  uploadProviderUrlToTransitFile,
} from "../provider-runtime.ts";

const pdfCoApiBaseUrl = "https://api.pdf.co";
const pdfCoBalancePath = "/v1/account/credit/balance";

type PdfCoRequestPhase = "validate" | "execute";
type PdfCoActionContext = ApiKeyProviderContext;
type PdfCoActionHandler = (input: Record<string, unknown>, context: PdfCoActionContext) => Promise<unknown>;

export const pdfCoActionHandlers: ProviderActionHandlers<"pdf_co", PdfCoActionHandler> = {
  async get_account_balance(_input, context) {
    const payload = await pdfCoGetJson(pdfCoBalancePath, context.apiKey, context.fetcher, "execute");
    return normalizeBalancePayload(payload);
  },
  html_to_pdf(input, context) {
    return executePdfCoJsonAction("/v1/pdf/convert/from/html", buildHtmlToPdfBody(input), context);
  },
  url_to_pdf(input, context) {
    return executePdfCoJsonAction("/v1/pdf/convert/from/url", buildUrlToPdfBody(input), context);
  },
  async get_pdf_info(input, context) {
    const payload = await executePdfCoJsonAction("/v1/pdf/info", buildSourceDocumentBody(input), context, {
      normalize: false,
    });
    return normalizePdfInfoPayload(payload);
  },
  merge_pdfs(input, context) {
    const urls = input.urls;
    if (!Array.isArray(urls) || urls.length < 2) {
      throw new ProviderRequestError(400, "urls must include at least two PDF URLs");
    }

    return executePdfCoJsonAction(
      "/v1/pdf/merge",
      compactObject({
        url: urls.map((url) => readRequiredString(url, "urls")).join(", "),
        ...buildOptionalSourceOptions(input),
      }),
      context,
    );
  },
  split_pdf(input, context) {
    return executePdfCoJsonAction("/v1/pdf/split", buildSourceDocumentBody(input), context);
  },
  compress_pdf(input, context) {
    return executePdfCoJsonAction(
      "/v2/pdf/compress",
      compactObject({
        url: readRequiredString(input.url, "url"),
        name: readOptionalTrimmedString(input.name),
        config: optionalRecord(input.config),
        async: false,
      }),
      context,
    );
  },
  pdf_to_text(input, context) {
    return executePdfCoJsonAction(
      "/v1/pdf/convert/to/text",
      compactObject({
        ...buildSourceDocumentBody(input),
        lang: readOptionalTrimmedString(input.lang),
        rect: readOptionalTrimmedString(input.rect),
        unwrap: optionalBoolean(input.unwrap),
        linegrouping: optionalBoolean(input.lineGrouping),
      }),
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdf_co", pdfCoActionHandlers);

export async function validatePdfCoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await pdfCoGetJson(pdfCoBalancePath, input.apiKey, fetcher, "validate");
  const balance = normalizeBalancePayload(payload);

  return {
    profile: {
      accountId: buildPdfCoProviderAccountId(input.apiKey),
      displayName: "PDF.co API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pdfCoApiBaseUrl,
      validationEndpoint: pdfCoBalancePath,
      credits: balance.credits ?? undefined,
      status: balance.status ?? undefined,
    }),
  };
}

async function executePdfCoJsonAction(
  path: string,
  body: Record<string, unknown>,
  context: PdfCoActionContext,
  options: { normalize?: boolean } = {},
): Promise<unknown> {
  const payload = await pdfCoPostJson(path, body, context.apiKey, context.fetcher, "execute");
  if (options.normalize === false) {
    return payload;
  }

  const file = normalizePdfCoFilePayload(payload);
  return withPdfCoTransitFile(file, body, context);
}

async function pdfCoGetJson(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  phase: PdfCoRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new URL(path, pdfCoApiBaseUrl), {
      method: "GET",
      headers: pdfCoHeaders(apiKey),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PDF.co request failed: ${error.message}` : "PDF.co request failed",
    );
  }

  const payload = await readPdfCoPayload(response);
  if (!response.ok) {
    throw mapPdfCoError(response, payload, phase);
  }

  return payload;
}

async function pdfCoPostJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: PdfCoRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new URL(path, pdfCoApiBaseUrl), {
      method: "POST",
      headers: {
        ...pdfCoHeaders(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PDF.co request failed: ${error.message}` : "PDF.co request failed",
    );
  }

  const payload = await readPdfCoPayload(response);
  if (!response.ok) {
    throw mapPdfCoError(response, payload, phase);
  }

  return payload;
}

function pdfCoHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readPdfCoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapPdfCoError(response: Response, payload: unknown, phase: PdfCoRequestPhase): ProviderRequestError {
  const message = extractPdfCoErrorMessage(payload) ?? (response.statusText || "PDF.co request failed");

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractPdfCoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.Message) ??
    optionalString(record.error) ??
    optionalString(record.Error) ??
    optionalString(record.detail) ??
    optionalString(record.Detail)
  );
}

function normalizeBalancePayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "PDF.co returned invalid account balance JSON");
  }

  return {
    credits:
      optionalNumber(record.credits) ??
      optionalNumber(record.remainingCredits) ??
      optionalNumber(record.balance) ??
      null,
    status: readNullableString(record.status),
    message: readNullableString(record.message),
    raw: record,
  };
}

function normalizePdfCoFilePayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "PDF.co returned invalid JSON");
  }

  const hasError = optionalBoolean(record.error) === true;
  const status = readNullableString(record.status);
  if (hasError || status?.toLowerCase() === "error") {
    throw new ProviderRequestError(502, extractPdfCoErrorMessage(record) ?? "PDF.co operation failed", record);
  }

  return {
    url: readNullableString(record.url),
    transitFile: null,
    body: record.body ?? record.text ?? record.data ?? null,
    jobId: readNullableString(record.jobId),
    credits: optionalNumber(record.credits) ?? null,
    remainingCredits: optionalNumber(record.remainingCredits) ?? null,
    duration: optionalNumber(record.duration) ?? null,
    status,
    message: readNullableString(record.message),
    raw: record,
  };
}

async function withPdfCoTransitFile(
  file: Record<string, unknown>,
  input: Record<string, unknown>,
  context: PdfCoActionContext,
): Promise<Record<string, unknown>> {
  const url = readNullableString(file.url);
  if (!url || file.body != null) {
    return file;
  }

  return {
    ...file,
    transitFile: await uploadProviderUrlToTransitFile(
      {
        url,
        name: readOptionalTrimmedString(input.name) ?? inferPdfCoFileName(url),
        source: "PDF.co",
      },
      context,
    ),
  };
}

function inferPdfCoFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).at(-1);
    if (name) {
      return decodeURIComponent(name);
    }
  } catch {
    // Fall through to a stable generic name for non-standard provider URLs.
  }

  return "pdf-co-output.pdf";
}

function normalizePdfInfoPayload(payload: unknown): Record<string, unknown> {
  const file = normalizePdfCoFilePayload(payload);
  const raw = file.raw as Record<string, unknown>;

  return {
    pageCount: optionalNumber(raw.pageCount) ?? optionalNumber(raw.pages) ?? optionalNumber(raw.PageCount) ?? null,
    title: readNullableString(raw.title ?? raw.Title),
    author: readNullableString(raw.author ?? raw.Author),
    subject: readNullableString(raw.subject ?? raw.Subject),
    keywords: readNullableString(raw.keywords ?? raw.Keywords),
    encrypted: optionalBoolean(raw.encrypted ?? raw.Encrypted) ?? null,
    credits: file.credits,
    remainingCredits: file.remainingCredits,
    duration: file.duration,
    status: file.status,
    message: file.message,
    raw,
  };
}

function buildHtmlToPdfBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    html: readRequiredString(input.html, "html"),
    templateid: readOptionalTrimmedString(input.templateId),
    templatedata: optionalRecord(input.templateData),
    ...buildHtmlRenderOptions(input),
    async: false,
  });
}

function buildUrlToPdfBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readRequiredString(input.url, "url"),
    templatedata: optionalRecord(input.templateData),
    ...buildHtmlRenderOptions(input),
    ...buildHttpAuthOptions(input),
    async: false,
  });
}

function buildSourceDocumentBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readRequiredString(input.url, "url"),
    pages: readOptionalTrimmedString(input.pages),
    inline: optionalBoolean(input.inline),
    password: readOptionalTrimmedString(input.password),
    ...buildOptionalSourceOptions(input),
    async: false,
  });
}

function buildOptionalSourceOptions(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readOptionalTrimmedString(input.name),
    timeout: optionalNumber(input.timeout),
    expiration: optionalNumber(input.expiration),
    profiles: optionalRecord(input.profiles),
    ...buildHttpAuthOptions(input),
  });
}

function buildHtmlRenderOptions(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readOptionalTrimmedString(input.name),
    margins: readOptionalTrimmedString(input.margins),
    papersize: readOptionalTrimmedString(input.paperSize),
    orientation: readOptionalTrimmedString(input.orientation),
    printbackground: optionalBoolean(input.printBackground),
    mediatype: readOptionalTrimmedString(input.mediaType),
    donotwaitfullload: optionalBoolean(input.doNotWaitFullLoad),
    header: optionalString(input.header),
    footer: optionalString(input.footer),
    rendertimeout: optionalNumber(input.renderTimeout),
    expiration: optionalNumber(input.expiration),
    profiles: optionalRecord(input.profiles),
    customscript: optionalString(input.customScript),
  });
}

function buildHttpAuthOptions(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    httpusername: readOptionalTrimmedString(input.httpUsername),
    httppassword: optionalString(input.httpPassword),
  });
}

function buildPdfCoProviderAccountId(apiKey: string): string {
  return `pdf_co:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const resolved = readOptionalTrimmedString(value);
  if (resolved) {
    return resolved;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readNullableString(value: unknown): string | null {
  return readOptionalTrimmedString(value) ?? null;
}
