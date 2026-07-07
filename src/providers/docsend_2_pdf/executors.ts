import type {
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  TransitFileWriter,
} from "../../core/types.ts";
import type { Docsend2PdfActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "docsend_2_pdf";
const convertUrl = "https://docsend2pdf.com/api/convert";
const docsend2PdfApiBaseUrl = "https://docsend2pdf.com/api";
const pdfMimeType = "application/pdf";

interface Docsend2PdfContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

type Handler = (input: Record<string, unknown>, context: Docsend2PdfContext) => Promise<unknown>;

const handlers: Record<Docsend2PdfActionName, Handler> = {
  convert(input, context) {
    return convert(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Docsend2PdfContext>({
  service,
  handlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): Docsend2PdfContext {
    const providerContext: Docsend2PdfContext = { fetcher, signal: context.signal };
    if (context.transitFiles) providerContext.transitFiles = context.transitFiles;
    return providerContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: docsend2PdfApiBaseUrl,
  auth: { type: "none" },
});

async function convert(input: Record<string, unknown>, context: Docsend2PdfContext): Promise<unknown> {
  const returnPdfBase64 = optionalBoolean(input.returnPdfBase64) ?? false;
  if (!returnPdfBase64 && !context.transitFiles) {
    throw new ProviderRequestError(
      400,
      "Transit file storage is not enabled; set returnPdfBase64=true to return PDF bytes inline.",
    );
  }

  const response = await context.fetcher(convertUrl, {
    method: "POST",
    headers: {
      accept: "application/pdf, application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(buildRequestBody(input)),
    signal: context.signal,
  });

  await assertResponse(response);
  const contentType = response.headers.get("content-type") ?? pdfMimeType;
  if (!contentType.toLowerCase().includes(pdfMimeType)) {
    throw new ProviderRequestError(502, `Docsend2pdf convert returned unexpected content type ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const outputName = normalizePdfName(optionalString(input.outputName) ?? readFilename(response));
  const pdf = returnPdfBase64
    ? {
        name: outputName,
        mimetype: pdfMimeType,
        base64: bytes.toString("base64"),
      }
    : await uploadConvertedPdf(context, outputName, bytes);

  return {
    succeeded: true,
    contentType: pdfMimeType,
    contentLength: readHeaderInteger(response.headers, "content-length") ?? bytes.byteLength,
    rateLimit: compactObject({
      limit: readHeaderInteger(response.headers, "x-ratelimit-limit"),
      remaining: readHeaderInteger(response.headers, "x-ratelimit-remaining"),
      reset: readHeaderInteger(response.headers, "x-ratelimit-reset"),
      retryAfter: readHeaderInteger(response.headers, "retry-after"),
    }),
    pdf,
  };
}

function buildRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  const url = readDocsendUrl(input.url);
  return compactObject({
    url,
    email: optionalString(input.email),
    passcode: optionalString(input.passcode),
  });
}

function readDocsendUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw new ProviderRequestError(400, "url is required");
  const url = assertPublicHttpUrl(raw, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "url must use https");
  if (url.username || url.password) throw new ProviderRequestError(400, "url must not include credentials");
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "docsend.com" && !hostname.endsWith(".docsend.com")) {
    throw new ProviderRequestError(400, "url must be a docsend.com URL");
  }
  return url.toString();
}

async function uploadConvertedPdf(
  context: Docsend2PdfContext,
  name: string,
  bytes: Buffer,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }
  const file = new File([Uint8Array.from(bytes)], name, { type: pdfMimeType });
  const upload = await context.transitFiles.create(file);
  return {
    name,
    mimetype: pdfMimeType,
    downloadUrl: upload.downloadUrl,
  };
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const message = await readError(response);
  if (response.status === 429) throw new ProviderRequestError(429, message);
  if (response.status >= 400 && response.status < 500) throw new ProviderRequestError(response.status, message);
  throw new ProviderRequestError(response.status >= 500 ? response.status : 502, message);
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText || `Docsend2pdf request failed with ${response.status}`;
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return (
      optionalString(payload.error) ??
      optionalString(payload.message) ??
      response.statusText ??
      `Docsend2pdf request failed with ${response.status}`
    );
  } catch {
    return text;
  }
}

function readHeaderInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) return undefined;
  return optionalInteger(Number(value));
}

function readFilename(response: Response): string {
  const disposition = response.headers.get("content-disposition");
  if (!disposition) return "docsend.pdf";
  for (const segment of disposition.split(";")) {
    const trimmed = segment.trim();
    if (trimmed.toLowerCase().startsWith("filename=")) {
      return stripWrappingQuotes(trimmed.slice("filename=".length).trim()) || "docsend.pdf";
    }
  }
  return "docsend.pdf";
}

function normalizePdfName(value: string): string {
  const trimmed = value.trim() || "docsend.pdf";
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

function stripWrappingQuotes(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}
