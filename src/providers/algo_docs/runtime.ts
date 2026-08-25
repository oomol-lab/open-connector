import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const algoDocsApiBaseUrl = "https://api.algodocs.com/v1";
const validationPath = "/me";

type AlgoDocsRequestPhase = "validate" | "execute";
type AlgoDocsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const algoDocsActionHandlers: ProviderActionHandlers<"algo_docs", AlgoDocsActionHandler> = {
  async get_me(_input, context) {
    const record = readRecord(
      await requestAlgoDocsJson({
        method: "GET",
        path: "/me",
        context,
        phase: "execute",
      }),
      "account identity",
    );
    return {
      fullName: optionalString(record.fullName) ?? null,
      email: optionalString(record.email) ?? null,
      raw: record,
    };
  },

  async list_extractors(_input, context) {
    const extractors = readRecordArray(
      await requestAlgoDocsJson({
        method: "GET",
        path: "/extractors",
        context,
        phase: "execute",
      }),
      "extractor list",
    );
    return {
      extractors,
      raw: extractors,
    };
  },

  async list_folders(_input, context) {
    const folders = readRecordArray(
      await requestAlgoDocsJson({
        method: "GET",
        path: "/folders",
        context,
        phase: "execute",
      }),
      "folder list",
    );
    return {
      folders,
      raw: folders,
    };
  },

  async upload_document_from_url(input, context) {
    const body = new FormData();
    body.set("url", readRequiredString(input.fileUrl, "fileUrl"));

    const document = readRecord(
      await requestAlgoDocsJson({
        method: "POST",
        path: `/document/upload_url/${encodeURIComponent(readRequiredString(input.extractorId, "extractorId"))}/${encodeURIComponent(readRequiredString(input.folderId, "folderId"))}`,
        context,
        phase: "execute",
        body,
      }),
      "document upload",
    );
    return {
      document,
      raw: document,
    };
  },

  async get_extracted_data_by_document(input, context) {
    const records = readRecordArray(
      await requestAlgoDocsJson({
        method: "GET",
        path: `/extracted_data/${encodeURIComponent(String(input.documentId))}`,
        context,
        phase: "execute",
      }),
      "document extracted data",
    );
    return {
      records,
      raw: records,
    };
  },

  async list_extracted_data(input, context) {
    const url = buildAlgoDocsUrl(
      `/extracted_data/${encodeURIComponent(readRequiredString(input.extractorId, "extractorId"))}`,
    );
    appendOptionalQuery(url, "folder_id", input.folderId);
    appendOptionalQuery(url, "limit", input.limit);
    appendOptionalQuery(url, "date", input.date);

    const records = readRecordArray(
      await requestAlgoDocsJson({
        method: "GET",
        url,
        context,
        phase: "execute",
      }),
      "extracted data list",
    );
    return {
      records,
      raw: records,
    };
  },
};

export async function validateAlgoDocsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = readRecord(
    await requestAlgoDocsJson({
      method: "GET",
      path: validationPath,
      context: { apiKey, fetcher, signal },
      phase: "validate",
    }),
    "account identity",
  );
  const fullName = optionalString(account.fullName);
  const email = optionalString(account.email);

  return {
    profile: {
      accountId: email,
      displayName: buildAccountLabel(fullName, email),
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: algoDocsApiBaseUrl,
      validationEndpoint: validationPath,
      fullName,
      email,
    }),
  };
}

async function requestAlgoDocsJson(input: {
  method: "GET" | "POST";
  context: ApiKeyProviderContext;
  phase: AlgoDocsRequestPhase;
  path?: string;
  url?: URL;
  body?: BodyInit;
}): Promise<unknown> {
  const url = input.url ?? buildAlgoDocsUrl(input.path ?? "/");
  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers: buildAlgoDocsHeaders(input.context.apiKey),
      body: input.body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `AlgoDocs request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readAlgoDocsPayload(response);
  if (!response.ok) {
    throw createAlgoDocsError(response, payload, input.phase);
  }

  return payload;
}

function buildAlgoDocsUrl(path: string): URL {
  return new URL(`${algoDocsApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
}

function buildAlgoDocsHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readAlgoDocsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAlgoDocsError(response: Response, payload: unknown, phase: AlgoDocsRequestPhase): ProviderRequestError {
  const message = extractAlgoDocsErrorMessage(payload) ?? `AlgoDocs request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function extractAlgoDocsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["error", "message", "Message"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `AlgoDocs ${label} response is invalid`);
  }
  return value as Record<string, unknown>;
}

function readRecordArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `AlgoDocs ${label} response is invalid`);
  }
  return value.map((item) => readRecord(item, label));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function appendOptionalQuery(url: URL, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(name, String(value));
}

function buildAccountLabel(fullName: string | undefined, email: string | undefined): string {
  if (fullName && email) {
    return `${fullName} <${email}>`;
  }
  return fullName ?? email ?? "AlgoDocs API Key";
}
