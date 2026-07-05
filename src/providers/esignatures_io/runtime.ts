import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { EsignaturesIoActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const esignaturesIoApiBaseUrl = "https://esignatures.com/api";

type EsignaturesIoRequestPhase = "validate" | "execute";

export const esignaturesIoActionHandlers: Record<
  EsignaturesIoActionName,
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  create_template(input, context) {
    return executeCreateTemplate(input, context);
  },
  list_templates(_input, context) {
    return executeListTemplates(context);
  },
  get_template(input, context) {
    return executeGetTemplate(input, context);
  },
  get_template_content(input, context) {
    return executeGetTemplateContent(input, context);
  },
  create_contract(input, context) {
    return executeCreateContract(input, context);
  },
  get_contract(input, context) {
    return executeGetContract(input, context);
  },
  get_contract_content(input, context) {
    return executeGetContractContent(input, context);
  },
  withdraw_contract(input, context) {
    return executeWithdrawContract(input, context);
  },
};

export async function validateEsignaturesIoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await esignaturesIoRequest("/templates", {
    apiKey,
    fetcher,
    method: "GET",
    phase: "validate",
    signal,
  });

  return {
    profile: {
      displayName: "eSignatures.com API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: esignaturesIoApiBaseUrl,
      validationEndpoint: "/templates",
    },
  };
}

async function executeCreateTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await esignaturesIoRequest("/templates", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: buildCreateTemplatePayload(input),
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);

  return {
    templates: readDataArray(object).map(normalizeTemplate),
    raw: object,
  };
}

async function executeListTemplates(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await esignaturesIoRequest("/templates", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);

  return {
    templates: readDataArray(object).map(normalizeTemplate),
    raw: object,
  };
}

async function executeGetTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const templateId = readRequiredTrimmedString(input.templateId, "templateId");
  const payload = await esignaturesIoRequest(`/templates/${encodeURIComponent(templateId)}`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);

  return {
    template: normalizeTemplate(readDataObject(object)),
    raw: object,
  };
}

async function executeGetTemplateContent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const templateId = readRequiredTrimmedString(input.templateId, "templateId");
  const payload = await esignaturesIoRequest(`/templates/${encodeURIComponent(templateId)}/content`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);
  const data = readDataObject(object);

  return {
    templateId: nullableString(data.template_id),
    markdown: nullableString(data.markdown),
    raw: object,
  };
}

async function executeCreateContract(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await esignaturesIoRequest("/contracts", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: buildCreateContractPayload(input),
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);
  const data = readDataObject(object);

  return {
    status: nullableString(object.status),
    contract: normalizeContract(readWrappedObject(data, "contract")),
    raw: object,
  };
}

async function executeGetContract(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const contractId = readRequiredTrimmedString(input.contractId, "contractId");
  const payload = await esignaturesIoRequest(`/contracts/${encodeURIComponent(contractId)}`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);
  const data = readDataObject(object);

  return {
    contract: normalizeContract(readWrappedObject(data, "contract")),
    raw: object,
  };
}

async function executeGetContractContent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const contractId = readRequiredTrimmedString(input.contractId, "contractId");
  const payload = await esignaturesIoRequest(`/contracts/${encodeURIComponent(contractId)}/content`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);
  const data = readDataObject(object);

  return {
    contractId: nullableString(data.contract_id),
    markdown: nullableString(data.markdown),
    raw: object,
  };
}

async function executeWithdrawContract(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const contractId = readRequiredTrimmedString(input.contractId, "contractId");
  const payload = await esignaturesIoRequest(`/contracts/${encodeURIComponent(contractId)}/withdraw`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    phase: "execute",
    signal: context.signal,
  });
  const object = readResponseObject(payload);

  return {
    status: nullableString(object.status),
    raw: object,
  };
}

async function esignaturesIoRequest(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method: "GET" | "POST";
    phase: EsignaturesIoRequestPhase;
    signal?: AbortSignal;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildEsignaturesIoUrl(path), {
      method: input.method,
      headers: esignaturesIoHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readEsignaturesIoPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `eSignatures.com request failed: ${error.message}` : "eSignatures.com request failed",
    );
  }

  if (!response.ok) {
    throw createEsignaturesIoError(response, payload, input.phase);
  }

  return payload;
}

function esignaturesIoHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildEsignaturesIoAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

export function buildEsignaturesIoAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function buildEsignaturesIoUrl(path: string): URL {
  const url = new URL(esignaturesIoApiBaseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${basePath}${normalizedPath}`;
  return url;
}

async function readEsignaturesIoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "eSignatures.com returned invalid JSON");
  }
}

function createEsignaturesIoError(
  response: Response,
  payload: unknown,
  phase: EsignaturesIoRequestPhase,
): ProviderRequestError {
  const message = extractEsignaturesIoErrorMessage(payload) ?? response.statusText ?? "eSignatures.com request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractEsignaturesIoErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const data = optionalRecord(object.data);
  const error = optionalRecord(object.error);
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.error_message) ??
    optionalString(data?.error_message) ??
    optionalString(error?.message)
  );
}

function buildCreateTemplatePayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: readRequiredNonEmptyString(input.title, "title"),
    markdown: readRequiredNonEmptyString(input.markdown, "markdown"),
    labels: readOptionalStringArray(input.labels),
  });
}

function buildCreateContractPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    template_id: readRequiredTrimmedString(input.templateId, "templateId"),
    title: readOptionalNonEmptyString(input.title),
    locale: readOptionalNonEmptyString(input.locale),
    metadata: readOptionalNonEmptyString(input.metadata),
    expires_in_hours: stringifyOptionalInteger(optionalInteger(input.expiresInHours)),
    custom_webhook_url: readOptionalNonEmptyString(input.customWebhookUrl),
    assigned_user_email: readOptionalNonEmptyString(input.assignedUserEmail),
    labels: readOptionalStringArray(input.labels),
    test: stringifyOptionalYesNo(optionalBoolean(input.test)),
    save_as_draft: stringifyOptionalYesNo(optionalBoolean(input.saveAsDraft)),
    signers: readRequiredObjectArray(input.signers, "signers").map(buildSignerPayload),
    placeholder_fields: readOptionalObjectArray(input.placeholderFields)?.map(buildPlaceholderFieldPayload),
    signer_fields: readOptionalObjectArray(input.signerFields)?.map(buildSignerFieldPayload),
    emails: buildEmailsPayload(input.emails),
    custom_branding: buildCustomBrandingPayload(input.customBranding),
  });
}

function buildSignerPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readRequiredNonEmptyString(input.name, "signer.name"),
    email: readOptionalNonEmptyString(input.email),
    mobile: readOptionalNonEmptyString(input.mobile),
    company_name: readOptionalNonEmptyString(input.companyName),
    signing_order: stringifyOptionalInteger(optionalInteger(input.signingOrder)),
    auto_sign: stringifyOptionalYesNo(optionalBoolean(input.autoSign)),
    signature_request_delivery_methods: readOptionalStringArray(input.signatureRequestDeliveryMethods),
    signed_document_delivery_method: optionalRawString(input.signedDocumentDeliveryMethod),
    multi_factor_authentications: readOptionalStringArray(input.multiFactorAuthentications),
    redirect_url: readOptionalNonEmptyString(input.redirectUrl),
  });
}

function buildPlaceholderFieldPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    placeholder_key: readRequiredTrimmedString(input.placeholderKey, "placeholderKey"),
    replace_with_text: optionalRawString(input.replaceWithText),
    replace_with_markdown: optionalRawString(input.replaceWithMarkdown),
    replace_with_template: readOptionalNonEmptyString(input.replaceWithTemplate),
  });
}

function buildSignerFieldPayload(input: Record<string, unknown>): Record<string, unknown> {
  return {
    signer_field_id: readRequiredNonEmptyString(input.signerFieldId, "signerFieldId"),
    default_value: readRequiredNonEmptyString(input.defaultValue, "defaultValue"),
  };
}

function buildEmailsPayload(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }
  return compactObject({
    signature_request_subject: readOptionalNonEmptyString(input.signatureRequestSubject),
    signature_request_text: optionalRawString(input.signatureRequestText),
    final_contract_subject: readOptionalNonEmptyString(input.finalContractSubject),
    final_contract_text: optionalRawString(input.finalContractText),
    cc_email_addresses: readOptionalStringArray(input.ccEmailAddresses),
    reply_to: readOptionalNonEmptyString(input.replyTo),
  });
}

function buildCustomBrandingPayload(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }
  return compactObject({
    company_name: readOptionalNonEmptyString(input.companyName),
    logo_url: readOptionalNonEmptyString(input.logoUrl),
  });
}

function normalizeContract(contract: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(contract.id),
    status: nullableString(contract.status),
    title: nullableString(contract.title),
    metadata: nullableString(contract.metadata),
    source: nullableString(contract.source),
    test: nullableString(contract.test),
    contractPdfUrl: nullableString(contract.contract_pdf_url),
    labels: readStringArray(contract.labels),
    signers: readObjectArray(contract.signers).map(normalizeSigner),
    raw: contract,
  };
}

function normalizeSigner(signer: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(signer.id),
    name: nullableString(signer.name),
    email: nullableString(signer.email),
    mobile: nullableString(signer.mobile),
    companyName: nullableString(signer.company_name),
    signPageUrl: nullableString(signer.sign_page_url),
    signerFieldValues: signer.signer_field_values == null ? null : (optionalRecord(signer.signer_field_values) ?? null),
    raw: signer,
  };
}

function normalizeTemplate(template: Record<string, unknown>): Record<string, unknown> {
  return {
    templateId: nullableString(template.template_id),
    title: nullableString(template.title),
    createdAt: nullableString(template.created_at),
    placeholderFields: readStringArray(template.placeholder_fields),
    signerFields: readStringArray(template.signer_fields),
    raw: template,
  };
}

function readDataObject(payload: unknown): Record<string, unknown> {
  const object = readResponseObject(payload);
  const data = optionalRecord(object.data);
  if (!data) {
    throw new ProviderRequestError(502, "eSignatures.com response is missing data", object);
  }
  return data;
}

function readDataArray(payload: unknown): Array<Record<string, unknown>> {
  const object = readResponseObject(payload);
  if (!Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "eSignatures.com response data must be an array", object);
  }
  return readObjectArray(object.data);
}

function readWrappedObject(payload: unknown, key: string): Record<string, unknown> {
  const object = readResponseObject(payload);
  const value = optionalRecord(object[key]);
  if (!value) {
    throw new ProviderRequestError(502, `eSignatures.com response is missing ${key}`, object);
  }
  return value;
}

function readResponseObject(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "eSignatures.com response must be an object", payload);
  }
  return object;
}

function readRequiredObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must include at least one item`);
  }
  return objectArray(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "object array input", (message) => new ProviderRequestError(400, message));
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  return readStringArray(value);
}

function readRequiredNonEmptyString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  return readRequiredNonEmptyString(value, fieldName).trim();
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return optionalString(value);
}

function stringifyOptionalInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalYesNo(value: boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value ? "yes" : "no";
}

function nullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}
