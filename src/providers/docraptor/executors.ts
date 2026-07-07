import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DocraptorActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "docraptor";
const docraptorApiBaseUrl = "https://docraptor.com";
const docraptorHostedDocsPath = "/docs";
const docraptorRequestTimeoutMs = 31_000;
const docraptorValidationBody = {
  doc: {
    test: true,
    hosted: true,
    name: "oomol-connect-validation.pdf",
    type: "pdf",
    document_content: "<html><body>OOMOL Connect validation</body></html>",
  },
};

type DocraptorRequestPhase = "validate" | "execute";
type DocraptorActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const docraptorActionHandlers: Record<DocraptorActionName, DocraptorActionHandler> = {
  create_hosted_document(input, context) {
    return executeCreateHostedDocument(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, docraptorActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: docraptorApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await postDocraptorJson({
      path: docraptorHostedDocsPath,
      body: docraptorValidationBody,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: {
        accountId: "docraptor:api-key",
        displayName: "DocRaptor API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: docraptorApiBaseUrl,
        validationEndpoint: docraptorHostedDocsPath,
        validationMode: "hosted_test_document",
      },
    };
  },
};

async function executeCreateHostedDocument(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await postDocraptorJson({
    path: docraptorHostedDocsPath,
    body: {
      doc: buildHostedDocumentRequest(input),
    },
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeHostedDocumentPayload(payload);
}

function buildHostedDocumentRequest(input: Record<string, unknown>): Record<string, unknown> {
  const documentContent = optionalString(input.documentContent);
  const documentUrl = optionalString(input.documentUrl);
  if (documentContent && documentUrl) {
    throw new ProviderRequestError(400, "Exactly one of documentContent or documentUrl is required");
  }
  if (!documentContent && !documentUrl) {
    throw new ProviderRequestError(400, "Exactly one of documentContent or documentUrl is required");
  }

  return compactObject({
    hosted: true,
    name: optionalString(input.name),
    type: optionalString(input.documentType),
    document_content: documentContent,
    document_url: documentUrl ? normalizePublicUrl(documentUrl, "documentUrl") : undefined,
    test: optionalBoolean(input.test),
    javascript: optionalBoolean(input.javascript),
    pipeline: optionalString(input.pipeline),
    referrer: optionalString(input.referrer)
      ? normalizePublicUrl(optionalString(input.referrer), "referrer")
      : undefined,
    tag: optionalString(input.tag),
    strict: optionalString(input.strict),
    hosted_download_limit: optionalInteger(input.hostedDownloadLimit),
    hosted_expires_at: optionalString(input.hostedExpiresAt),
    prince_options: optionalRecord(input.princeOptions),
  });
}

async function postDocraptorJson(input: {
  path: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: DocraptorRequestPhase;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, docraptorRequestTimeoutMs);

  try {
    const response = await input.fetcher(new URL(input.path, docraptorApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: buildDocraptorAuthorizationHeader(input.apiKey),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readDocraptorPayload(response);
    if (!response.ok) {
      throw createDocraptorError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DocRaptor request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DocRaptor request failed: ${error.message}` : "DocRaptor request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDocraptorAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function readDocraptorPayload(response: Response): Promise<unknown> {
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

function normalizeHostedDocumentPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "DocRaptor returned an empty response", payload);
  }

  const nested = optionalRecord(record.data) ?? optionalRecord(record.doc) ?? record;
  const documentUrl =
    optionalString(nested.document_url) ??
    optionalString(nested.download_url) ??
    optionalString(nested.url) ??
    optionalString(nested.DownloadUrl) ??
    optionalString(record.document_url) ??
    optionalString(record.download_url) ??
    optionalString(record.url);
  if (!documentUrl) {
    throw new ProviderRequestError(502, "DocRaptor response did not include a hosted document URL", payload);
  }

  return {
    documentUrl,
    documentId: optionalString(nested.id) ?? optionalString(nested.document_id) ?? optionalString(record.id) ?? null,
    numberOfPages:
      optionalInteger(nested.number_of_pages) ??
      optionalInteger(nested.numberOfPages) ??
      optionalInteger(record.number_of_pages) ??
      null,
  };
}

function createDocraptorError(
  response: Response,
  payload: unknown,
  phase: DocraptorRequestPhase,
): ProviderRequestError {
  const message = extractDocraptorMessage(payload) ?? `DocRaptor request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractDocraptorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const baseMessage =
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.error_message) ??
    optionalString(record.title);
  const details = extractDocraptorDetails(record.errors) ?? extractDocraptorDetails(record.details);
  if (baseMessage && details && !baseMessage.includes(details)) {
    return `${baseMessage}: ${details}`;
  }
  return baseMessage ?? details;
}

function extractDocraptorDetails(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first : undefined;
  }

  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string" && entry.trim()) {
      return `${key} ${entry}`.trim();
    }
    if (!Array.isArray(entry) || entry.length === 0) {
      continue;
    }
    const firstItem = entry[0];
    if (typeof firstItem === "string" && firstItem.trim()) {
      return `${key} ${firstItem}`.trim();
    }
  }

  return undefined;
}

function normalizePublicUrl(value: string | undefined, fieldName: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const url = assertPublicHttpUrl(value, {
    fieldName,
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, `${fieldName} must use https`);
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, `${fieldName} must not include credentials`);
  }
  return url.toString();
}
