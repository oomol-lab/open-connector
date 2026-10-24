import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { basename } from "node:path";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const templatedocsApiBaseUrl = "https://templatedocs.io/api";

interface TemplateDocsContext {
  apiKey: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface TemplateDocsRequest extends TemplateDocsContext {
  path: string;
  method?: string;
  body?: unknown;
}

type TemplateDocsHandler = (input: Record<string, unknown>, context: TemplateDocsContext) => Promise<unknown>;

export const templatedocsActionHandlers: ProviderActionHandlers<"templatedocs", TemplateDocsHandler> = {
  list_templates(input, context) {
    const pageIndex = optionalInteger(input.pageIndex);
    return requestTemplateDocsJson({
      ...context,
      path: `/v1/templates${pageIndex == null ? "" : `?pageIndex=${pageIndex}`}`,
    });
  },
  get_template(input, context) {
    return requestTemplateDocsJson({ ...context, path: templatePath(input.templateId) });
  },
  async update_template(input, context) {
    const name = optionalString(input.name)?.trim();
    const allowGenerationWithWarnings = input.allowGenerationWithWarnings;
    if (!name && allowGenerationWithWarnings == null) {
      throw providerInputError("name or allowGenerationWithWarnings is required");
    }
    await requestTemplateDocs({
      ...context,
      path: templatePath(input.templateId),
      method: "PATCH",
      body: compactObject({
        name,
        options: allowGenerationWithWarnings == null ? undefined : { allowGenerationWithWarnings },
      }),
    });
    return { success: true };
  },
  async delete_template(input, context) {
    await requestTemplateDocs({
      ...context,
      path: templatePath(input.templateId),
      method: "DELETE",
    });
    return { success: true };
  },
  generate_document: generateDocument,
};

export async function validateTemplateDocsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTemplateDocsJson({
    apiKey,
    fetcher,
    signal,
    path: "/v1/templates?pageIndex=1",
  });
  const record = optionalRecord(payload);
  return {
    profile: { displayName: "TemplateDocs API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: templatedocsApiBaseUrl,
      validationEndpoint: "/v1/templates",
      pageSize: optionalInteger(record?.pageSize),
    }),
  };
}

async function generateDocument(input: Record<string, unknown>, context: TemplateDocsContext): Promise<unknown> {
  if (!context.transitFiles) throw providerInputError("Transit file storage is not enabled.");
  const format = optionalString(input.format) ?? "docx";
  const response = await requestTemplateDocs({
    ...context,
    path: `${templatePath(input.templateId)}/generate`,
    method: "POST",
    body: {
      data: optionalRecord(input.data) ?? {},
      output: compactObject({
        format,
        filename: optionalString(input.filename)?.trim(),
        email: optionalRecord(input.email),
      }),
    },
  });
  const name = generatedFileName(input.filename, format);
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? mimeTypeForFormat(format);
  const stored = await storeResponseInTransit(response, context.transitFiles, {
    name,
    mimeType,
    fieldName: name,
    createError: (message) => new ProviderRequestError(413, message),
    signal: context.signal,
  });
  if (stored.sizeBytes === 0) {
    await context.transitFiles.delete(stored.fileId).catch(() => undefined);
    throw new ProviderRequestError(502, "TemplateDocs returned an empty document");
  }
  return {
    document: {
      name: stored.name,
      mimeType: stored.mimeType,
      downloadUrl: stored.downloadUrl,
      sizeBytes: stored.sizeBytes,
    },
  };
}

async function requestTemplateDocsJson(input: TemplateDocsRequest): Promise<unknown> {
  const response = await requestTemplateDocs(input);
  return readProviderJsonBody(response, {
    emptyBody: undefined,
    invalidJsonMessage: "TemplateDocs returned invalid JSON",
  });
}

async function requestTemplateDocs(input: TemplateDocsRequest): Promise<Response> {
  return runProviderRequest({ label: "TemplateDocs", signal: input.signal }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body != null) headers.set("content-type", "application/json");
    const response = await input.fetcher(`${templatedocsApiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal,
    });
    if (!response.ok) throw await createTemplateDocsError(response);
    return response;
  });
}

async function createTemplateDocsError(response: Response): Promise<ProviderRequestError> {
  let message = `TemplateDocs request failed with status ${response.status}`;
  try {
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: undefined,
        invalidJsonMessage: "TemplateDocs returned invalid JSON",
      }),
    );
    message = optionalString(optionalRecord(payload?.error)?.message) ?? message;
  } catch {}
  return new ProviderRequestError(response.status || 502, message);
}

function templatePath(value: unknown): string {
  return `/v1/templates/${encodeURIComponent(requiredInputString(value, "templateId"))}`;
}

function generatedFileName(value: unknown, format: string): string {
  const requested = optionalString(value)?.trim();
  if (!requested) return `templatedocs-document.${format}`;
  const safeName = basename(requested.replaceAll("\\", "/"));
  return safeName.toLowerCase().endsWith(`.${format}`) ? safeName : `${safeName}.${format}`;
}

function mimeTypeForFormat(format: string): string {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
