import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalRawString,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRawString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const eversignApiBaseUrl = "https://api.eversign.com";
export const eversignValidationPath = "/business";

const eversignRequestTimeoutMs = 30_000;

type EversignPhase = "validate" | "execute";

interface EversignCredentialSummary {
  primary: {
    businessId: number;
    businessName: string;
  };
  businessCount: number;
}
export const eversignActionHandlers: ProviderActionHandlers<
  "eversign",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_businesses(_input, context) {
    const payload = await requestEversignJson({
      path: "/business",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      businesses: readResponseArray(payload, "business list").map(normalizeBusiness),
    };
  },

  async create_document(input, context) {
    const payload = await requestEversignJson({
      path: "/document",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "POST",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
      },
      body: buildCreateDocumentBody(input),
    });
    return {
      document: normalizeDocument(payload, "created document"),
    };
  },

  async create_document_from_template(input, context) {
    const payload = await requestEversignJson({
      path: "/document",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "POST",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
      },
      body: buildCreateDocumentFromTemplateBody(input),
    });
    return {
      document: normalizeDocument(payload, "template-created document"),
    };
  },

  async get_document(input, context) {
    const payload = await requestEversignJson({
      path: "/document",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
        document_hash: requiredString(input.documentHash, "documentHash", inputError),
      },
    });
    return {
      document: normalizeDocument(payload, "document"),
    };
  },

  async list_documents(input, context) {
    const payload = await requestEversignJson({
      path: "/document",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
        type: optionalString(input.type) ?? "all",
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        page: readOptionalPositiveInteger(input.page, "page"),
      },
    });
    return {
      documents: readResponseArray(payload, "document list").map((document) =>
        normalizeDocument(document, "document list item"),
      ),
    };
  },

  async list_templates(input, context) {
    const payload = await requestEversignJson({
      path: "/document",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
        type: optionalString(input.type) ?? "templates",
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        page: readOptionalPositiveInteger(input.page, "page"),
      },
    });
    return {
      templates: readResponseArray(payload, "template list").map((template) =>
        normalizeDocument(template, "template list item"),
      ),
    };
  },

  async send_reminder(input, context) {
    const payload = await requestEversignJson({
      path: "/send_reminder",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "POST",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
      },
      body: {
        document_hash: requiredString(input.documentHash, "documentHash", inputError),
        signer_id: positiveInteger(input.signerId, "signerId", inputError),
      },
    });
    const result = requiredRecord(payload, "reminder result", responseError);
    return {
      success: result.success === true,
      raw: result,
    };
  },

  async reassign_signer(input, context) {
    const payload = await requestEversignJson({
      path: "/reassign",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "POST",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
      },
      body: compactObject({
        document_hash: requiredString(input.documentHash, "documentHash", inputError),
        signer_id: positiveInteger(input.signerId, "signerId", inputError),
        new_signer_name: requiredString(input.newSignerName, "newSignerName", inputError),
        new_signer_email: requiredString(input.newSignerEmail, "newSignerEmail", inputError),
        reason: optionalString(input.reason),
      }),
    });
    const result = requiredRecord(payload, "signer reassignment result", responseError);
    return {
      success: result.success === true,
      raw: result,
    };
  },

  async get_audit_log(input, context) {
    const documentHash = requiredString(input.documentHash, "documentHash", inputError);
    const payload = await requestEversignJson({
      path: `/document/${encodeURIComponent(documentHash)}/audit_log`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: {
        business_id: positiveInteger(input.businessId, "businessId", inputError),
      },
    });
    return {
      events: readResponseArray(payload, "audit log").map(normalizeAuditEvent),
    };
  },
};

export async function validateEversignCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<EversignCredentialSummary> {
  const payload = await requestEversignJson({
    path: eversignValidationPath,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const businesses = readResponseArray(payload, "business list").map(normalizeBusiness);
  const primary = businesses.find((business) => business.isPrimary) ?? businesses[0];
  if (!primary) {
    throw new ProviderRequestError(400, "Xodo Sign returned no businesses for this API key");
  }

  return {
    primary,
    businessCount: businesses.length,
  };
}

async function requestEversignJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: EversignPhase;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}) {
  const url = new URL(input.path, eversignApiBaseUrl);
  url.searchParams.set("access_key", input.apiKey);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, eversignRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readEversignPayload(response);
    if (!response.ok || isEversignErrorPayload(payload)) {
      throw mapEversignError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Xodo Sign request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Xodo Sign request failed: ${error.message}` : "Xodo Sign request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCreateDocumentBody(input: Record<string, unknown>) {
  const files = requireInputArray(input.files, "files").map((value, index) => {
    const file = requiredRecord(value, `files[${index}]`, inputError);
    return compactObject({
      name: requiredString(file.name, `files[${index}].name`, inputError),
      file_url: optionalString(file.fileUrl),
      file_id: optionalString(file.fileId),
    });
  });
  const signers = requireInputArray(input.signers, "signers").map((value, index) => {
    const signer = requiredRecord(value, `signers[${index}]`, inputError);
    return compactObject({
      id: positiveInteger(signer.id, `signers[${index}].id`, inputError),
      name: requiredString(signer.name, `signers[${index}].name`, inputError),
      email: requiredString(signer.email, `signers[${index}].email`, inputError),
      order: readOptionalPositiveInteger(signer.order, `signers[${index}].order`),
      pin: optionalString(signer.pin),
      message: optionalString(signer.message),
      language: optionalString(signer.language),
    });
  });
  const recipients = readOptionalInputArray(input.recipients, "recipients")?.map((value, index) => {
    const recipient = requiredRecord(value, `recipients[${index}]`, inputError);
    return compactObject({
      name: requiredString(recipient.name, `recipients[${index}].name`, inputError),
      email: requiredString(recipient.email, `recipients[${index}].email`, inputError),
      language: optionalString(recipient.language),
    });
  });

  return compactObject({
    sandbox: optionalBooleanFlag(input.sandbox),
    is_draft: optionalBooleanFlag(input.isDraft),
    title: optionalString(input.title),
    message: optionalString(input.message),
    use_signer_order: optionalBooleanFlag(input.useSignerOrder),
    reminders: optionalBooleanFlag(input.reminders),
    require_all_signers: optionalBooleanFlag(input.requireAllSigners),
    custom_requester_name: optionalString(input.customRequesterName),
    custom_requester_email: optionalString(input.customRequesterEmail),
    redirect: optionalString(input.redirectUrl),
    redirect_decline: optionalString(input.declineRedirectUrl),
    client: optionalString(input.client),
    expires: readOptionalPositiveInteger(input.expires, "expires"),
    embedded_signing_enabled: optionalBooleanFlag(input.embeddedSigningEnabled),
    flexible_signing: optionalBooleanFlag(input.flexibleSigning),
    use_hidden_tags: optionalBooleanFlag(input.useHiddenTags),
    files,
    signers,
    recipients,
  });
}

function buildCreateDocumentFromTemplateBody(input: Record<string, unknown>) {
  const signers = requireInputArray(input.signers, "signers").map((value, index) => {
    const signer = requiredRecord(value, `signers[${index}]`, inputError);
    return compactObject({
      role: requiredString(signer.role, `signers[${index}].role`, inputError),
      name: optionalString(signer.name),
      email: optionalString(signer.email),
      pin: optionalString(signer.pin),
      message: optionalString(signer.message),
      deliver_email: optionalBooleanFlag(signer.deliverEmail),
      language: optionalString(signer.language),
    });
  });
  const recipients = readOptionalInputArray(input.recipients, "recipients")?.map((value, index) => {
    const recipient = requiredRecord(value, `recipients[${index}]`, inputError);
    return compactObject({
      role: requiredString(recipient.role, `recipients[${index}].role`, inputError),
      name: requiredString(recipient.name, `recipients[${index}].name`, inputError),
      email: requiredString(recipient.email, `recipients[${index}].email`, inputError),
      language: optionalString(recipient.language),
    });
  });
  const fields = readOptionalInputArray(input.mergeFields, "mergeFields")?.map((value, index) => {
    const field = requiredRecord(value, `mergeFields[${index}]`, inputError);
    return {
      identifier: requiredString(field.identifier, `mergeFields[${index}].identifier`, inputError),
      value: requiredRawString(field.value, `mergeFields[${index}].value`, inputError),
    };
  });

  return compactObject({
    sandbox: optionalBooleanFlag(input.sandbox),
    template_id: requiredString(input.templateId, "templateId", inputError),
    title: optionalString(input.title),
    message: optionalString(input.message),
    custom_requester_name: optionalString(input.customRequesterName),
    custom_requester_email: optionalString(input.customRequesterEmail),
    redirect: optionalString(input.redirectUrl),
    redirect_decline: optionalString(input.declineRedirectUrl),
    client: optionalString(input.client),
    expires: readOptionalPositiveInteger(input.expires, "expires"),
    embedded_signing_enabled: optionalBooleanFlag(input.embeddedSigningEnabled),
    signers,
    recipients,
    fields,
  });
}

async function readEversignPayload(response: Response) {
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

function isEversignErrorPayload(payload: unknown) {
  const body = optionalRecord(payload);
  return body?.success === false;
}

function mapEversignError(status: number, payload: unknown, phase: EversignPhase) {
  const body = optionalRecord(payload);
  const error = body ? optionalRecord(body.error) : undefined;
  const errorType = optionalString(error?.type);
  const message =
    optionalString(error?.info) ??
    optionalString(error?.message) ??
    optionalString(body?.message) ??
    (typeof payload === "string" && payload.trim() ? payload.trim() : undefined) ??
    `Xodo Sign API request failed with status ${status}`;

  if (
    status === 401 ||
    status === 403 ||
    errorType === "missing_access_key" ||
    errorType === "invalid_access_key" ||
    errorType === "inactive_user"
  ) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || status === 422 || (status >= 200 && status < 300)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function normalizeBusiness(value: unknown, index?: number) {
  const label = index === undefined ? "business" : `business list item ${index}`;
  const business = requiredRecord(value, label, responseError);
  return {
    businessId: integer(business.business_id, `${label} business_id`, responseError),
    businessStatus: integer(business.business_status, `${label} business_status`, responseError),
    businessIdentifier: requiredString(business.business_identifier, `${label} business_identifier`, responseError),
    businessName: requiredString(business.business_name, `${label} business_name`, responseError),
    creationTimestamp: integer(business.creation_time_stamp, `${label} creation_time_stamp`, responseError),
    isPrimary: readBooleanFlag(business.is_primary),
    raw: business,
  };
}

function normalizeDocument(value: unknown, label: string) {
  const document = requiredRecord(value, label, responseError);
  const signers = Array.isArray(document.signers)
    ? document.signers.map((signer, index) => normalizeSigner(signer, index))
    : [];
  return {
    documentHash: requiredString(document.document_hash, `${label} document_hash`, responseError),
    title: optionalRawString(document.title ?? document.document_title) ?? null,
    message: optionalRawString(document.message ?? document.document_message) ?? null,
    requesterEmail: optionalRawString(document.requester_email ?? document.requester_email_address) ?? null,
    templateId: optionalRawString(document.template_id ?? document.origin_template_id) ?? null,
    created: nullableResponseInteger(document.created ?? document.document_creation_ts, `${label} created`),
    completed: nullableResponseInteger(document.completed ?? document.document_completion_ts, `${label} completed`),
    expires: nullableResponseInteger(document.expires ?? document.document_expiration_ts, `${label} expires`),
    isDraft: readBooleanFlag(document.is_draft),
    isTemplate: readBooleanFlag(document.is_template),
    isCompleted: readBooleanFlag(document.is_completed),
    isArchived: readBooleanFlag(document.is_archived),
    isDeleted: readBooleanFlag(document.is_deleted),
    isTrashed: readBooleanFlag(document.is_trashed),
    isCancelled: readBooleanFlag(document.is_cancelled),
    signers,
    raw: document,
  };
}

function normalizeSigner(value: unknown, index: number) {
  const label = `signer ${index}`;
  const signer = requiredRecord(value, label, responseError);
  return {
    signerId: integer(signer.id, `${label} id`, responseError),
    name: optionalRawString(signer.name) ?? null,
    email: optionalRawString(signer.email) ?? null,
    role: optionalRawString(signer.role) ?? null,
    order: nullableResponseInteger(signer.order, `${label} order`),
    signed: readBooleanFlag(signer.signed),
    status: optionalRawString(signer.status) ?? null,
    raw: signer,
  };
}

function normalizeAuditEvent(value: unknown, index: number) {
  const label = `audit event ${index}`;
  const event = requiredRecord(value, label, responseError);
  return {
    entryId: integer(event.entry_id, `${label} entry_id`, responseError),
    eventType: requiredString(event.event_type, `${label} event_type`, responseError),
    signerId: nullableResponseInteger(event.event_assoc_signer, `${label} signer`),
    signerName: optionalRawString(event.event_assoc_signer_name) ?? null,
    signerEmail: optionalRawString(event.event_assoc_signer_email) ?? null,
    timestamp: integer(event.time_stamp, `${label} time_stamp`, responseError),
    raw: event,
  };
}

function optionalBooleanFlag(value: unknown) {
  return typeof value === "boolean" ? (value ? 1 : 0) : undefined;
}

function readBooleanFlag(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function readResponseArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Xodo Sign returned an invalid ${label} payload`);
  }
  return value;
}

function requireInputArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }
  return value;
}

function readOptionalInputArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  return positiveInteger(value, fieldName, inputError);
}

function nullableResponseInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return integer(value, fieldName, responseError);
}

function inputError(message: string) {
  return new ProviderRequestError(400, message);
}

function responseError(message: string) {
  return new ProviderRequestError(502, `Xodo Sign ${message}`);
}
