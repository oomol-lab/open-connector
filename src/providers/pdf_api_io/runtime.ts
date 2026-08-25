import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  uploadProviderUrlToTransitFile,
} from "../provider-runtime.ts";

const pdfApiIoApiBaseUrl = "https://pdf-api.io";
const pdfApiIoTemplatesPath = "/api/templates";

type PdfApiIoRequestPhase = "validate" | "execute";
type PdfApiIoActionContext = ApiKeyProviderContext;
type PdfApiIoActionHandler = (input: Record<string, unknown>, context: PdfApiIoActionContext) => Promise<unknown>;

export const pdfApiIoActionHandlers: ProviderActionHandlers<"pdf_api_io", PdfApiIoActionHandler> = {
  async list_templates(_input, context) {
    const payload = await requestPdfApiIo({
      path: pdfApiIoTemplatesPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      templates: normalizeTemplateList(payload),
    };
  },
  async get_template(input, context) {
    const templateId = requiredString(input.templateId, "templateId", providerInputError);
    const payload = await requestPdfApiIo({
      path: `${pdfApiIoTemplatesPath}/${encodeURIComponent(templateId)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      template: normalizeTemplateDetail(payload),
    };
  },
  async render_pdf(input, context) {
    const templateId = requiredString(input.templateId, "templateId", providerInputError);
    const payload = await requestPdfApiIo({
      path: `${pdfApiIoTemplatesPath}/${encodeURIComponent(templateId)}/pdf`,
      method: "POST",
      body: {
        data: requiredRecord(input.data, "data", providerInputError),
        output: "url",
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
    const record = readPdfApiIoObject(payload);
    const fileUrl = requiredString(record.url, "url", providerOutputError);

    return {
      fileUrl,
      transitFile: await uploadProviderUrlToTransitFile(
        {
          url: fileUrl,
          name: `${templateId}.pdf`,
          source: "PDF-API.io",
        },
        context,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdf_api_io", pdfApiIoActionHandlers);

export async function validatePdfApiIoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPdfApiIo({
    path: pdfApiIoTemplatesPath,
    apiKey,
    fetcher,
    phase: "validate",
  });
  const templates = normalizeTemplateList(payload);
  const firstTemplate = templates[0];

  return {
    profile: {
      accountId: buildPdfApiIoProviderAccountId(apiKey),
      displayName: "PDF-API.io API Token",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pdfApiIoApiBaseUrl,
      validationEndpoint: pdfApiIoTemplatesPath,
      templateCount: templates.length,
      firstTemplateId: firstTemplate?.id,
      firstTemplateName: firstTemplate?.name,
    }),
  };
}

async function requestPdfApiIo(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: PdfApiIoRequestPhase;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, pdfApiIoApiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PDF-API.io request failed: ${error.message}` : "PDF-API.io request failed",
    );
  }

  const payload = await readPdfApiIoPayload(response);
  if (!response.ok) {
    throw mapPdfApiIoError(response, payload, input.phase);
  }

  return payload;
}

async function readPdfApiIoPayload(response: Response): Promise<unknown> {
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

function mapPdfApiIoError(response: Response, payload: unknown, phase: PdfApiIoRequestPhase): ProviderRequestError {
  const message = extractPdfApiIoErrorMessage(payload) ?? (response.statusText || "PDF-API.io request failed");

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractPdfApiIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
      const errorRecord = optionalRecord(item);
      const nestedMessage = optionalString(errorRecord?.message) ?? optionalString(errorRecord?.detail);
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return undefined;
}

function normalizeTemplateList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "PDF-API.io template list response is invalid");
  }

  return payload.map((item) => normalizeTemplateSummary(item));
}

function normalizeTemplateSummary(payload: unknown): Record<string, unknown> {
  const record = readPdfApiIoObject(payload);

  return {
    id: requiredString(record.id, "id", providerOutputError),
    name: requiredString(record.name, "name", providerOutputError),
    type: requiredString(record.type, "type", providerOutputError),
    createdAt: requiredString(record.created_at, "created_at", providerOutputError),
    meta: optionalRecord(record.meta) ?? null,
    variables: normalizeVariables(record.variables),
  };
}

function normalizeTemplateDetail(payload: unknown): Record<string, unknown> {
  const record = readPdfApiIoObject(payload);
  const summary = normalizeTemplateSummary(record);

  return {
    ...summary,
    teamName: requiredString(record.team_name, "team_name", providerOutputError),
    teamId: requiredString(record.team_id, "team_id", providerOutputError),
  };
}

function normalizeVariables(payload: unknown): Array<Record<string, string>> {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map((item) => {
    const record = readPdfApiIoObject(item);
    return {
      name: requiredString(record.name, "name", providerOutputError),
      type: requiredString(record.type, "type", providerOutputError),
    };
  });
}

function readPdfApiIoObject(value: unknown): Record<string, unknown> {
  return requiredRecord(
    value,
    "PDF-API.io payload",
    () => new ProviderRequestError(502, "PDF-API.io returned a non-object payload"),
  );
}

function buildPdfApiIoProviderAccountId(apiKey: string): string {
  return `pdf_api_io:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `PDF-API.io response ${message}`);
}
